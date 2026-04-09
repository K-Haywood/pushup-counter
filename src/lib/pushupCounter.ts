import type {
  AppSettings,
  BodySide,
  CalibrationSnapshot,
  CounterRuntimeState,
  CounterUpdate,
  PoseFrameMetrics
} from '../types/app';

type Landmark = {
  x: number;
  y: number;
  z: number;
  visibility?: number;
};

const LEFT = {
  shoulder: 11,
  elbow: 13,
  wrist: 15,
  hip: 23,
  knee: 25,
  ankle: 27
} as const;

const RIGHT = {
  shoulder: 12,
  elbow: 14,
  wrist: 16,
  hip: 24,
  knee: 26,
  ankle: 28
} as const;

const FULL_BODY_POINTS = [11, 12, 23, 24, 25, 26, 27, 28];
const PHASE_HOLD_MS = 120;
const PHASE_HYSTERESIS = 8;
const DIRECTION_EPSILON = 1.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function distance(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function visibility(point: Landmark | undefined): number {
  return point?.visibility ?? 0;
}

function angleAtVertex(a: Landmark, b: Landmark, c: Landmark): number {
  const abX = a.x - b.x;
  const abY = a.y - b.y;
  const cbX = c.x - b.x;
  const cbY = c.y - b.y;
  const numerator = abX * cbX + abY * cbY;
  const denominator = Math.hypot(abX, abY) * Math.hypot(cbX, cbY);

  if (!Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }

  const value = clamp(numerator / denominator, -1, 1);
  return (Math.acos(value) * 180) / Math.PI;
}

function distanceToLine(point: Landmark, lineStart: Landmark, lineEnd: Landmark): number {
  const numerator = Math.abs(
    (lineEnd.y - lineStart.y) * point.x -
      (lineEnd.x - lineStart.x) * point.y +
      lineEnd.x * lineStart.y -
      lineEnd.y * lineStart.x
  );
  const denominator = Math.hypot(lineEnd.y - lineStart.y, lineEnd.x - lineStart.x);

  return denominator === 0 ? 0 : numerator / denominator;
}

function getSideMetrics(landmarks: Landmark[], side: BodySide) {
  const ids = side === 'left' ? LEFT : RIGHT;
  const shoulder = landmarks[ids.shoulder];
  const elbow = landmarks[ids.elbow];
  const wrist = landmarks[ids.wrist];
  const hip = landmarks[ids.hip];
  const knee = landmarks[ids.knee];
  const ankle = landmarks[ids.ankle];

  const visibilityScore = average([
    visibility(shoulder),
    visibility(elbow),
    visibility(wrist),
    visibility(hip),
    visibility(knee),
    visibility(ankle)
  ]);

  const elbowAngle = angleAtVertex(shoulder, elbow, wrist);
  const bodyScale = distance(shoulder, ankle);
  const alignmentError = bodyScale === 0 ? 1 : average([
    distanceToLine(hip, shoulder, ankle) / bodyScale,
    distanceToLine(knee, shoulder, ankle) / bodyScale
  ]);

  return {
    side,
    visibilityScore,
    elbowAngle,
    bodyScale,
    alignmentError
  };
}

function isFramedWell(landmarks: Landmark[]): boolean {
  const relevant = FULL_BODY_POINTS.map((index) => landmarks[index]);
  const minX = Math.min(...relevant.map((point) => point.x));
  const maxX = Math.max(...relevant.map((point) => point.x));
  const minY = Math.min(...relevant.map((point) => point.y));
  const maxY = Math.max(...relevant.map((point) => point.y));
  return minX > 0.02 && maxX < 0.98 && minY > 0.02 && maxY < 0.98;
}

function getConfidenceLabel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.8) {
    return 'high';
  }

  if (confidence >= 0.6) {
    return 'medium';
  }

  return 'low';
}

export function createCounterRuntimeState(): CounterRuntimeState {
  return {
    phase: 'top',
    angleWindow: [],
    alignmentWindow: [],
    previousSmoothedAngle: null,
    lastRepTimestamp: 0,
    phaseEnteredAt: 0,
    seenBottom: false
  };
}

export function analyzePoseFrame(
  landmarks: Landmark[],
  settings: AppSettings,
  calibration: CalibrationSnapshot | null
): PoseFrameMetrics {
  if (!landmarks.length) {
    return {
      side: null,
      elbowAngle: null,
      bodyScale: null,
      shoulderWidthRatio: null,
      hipWidthRatio: null,
      alignmentError: null,
      visibility: 0,
      confidence: 0,
      confidenceLabel: 'low',
      status: 'no-person',
      guidance: 'No person detected. Move fully into frame.',
      countingReady: false
    };
  }

  const preferredSide = calibration?.side;
  const left = getSideMetrics(landmarks, 'left');
  const right = getSideMetrics(landmarks, 'right');

  let selected = left.visibilityScore >= right.visibilityScore ? left : right;
  if (preferredSide === 'left' && left.visibilityScore >= right.visibilityScore - 0.08) {
    selected = left;
  } else if (preferredSide === 'right' && right.visibilityScore >= left.visibilityScore - 0.08) {
    selected = right;
  }

  const shoulderWidthRatio =
    selected.bodyScale === 0
      ? 1
      : distance(landmarks[LEFT.shoulder], landmarks[RIGHT.shoulder]) / selected.bodyScale;
  const hipWidthRatio =
    selected.bodyScale === 0
      ? 1
      : distance(landmarks[LEFT.hip], landmarks[RIGHT.hip]) / selected.bodyScale;

  const framedWell = isFramedWell(landmarks);
  const sideOnEnough =
    shoulderWidthRatio <= settings.sideViewMaxRatio && hipWidthRatio <= settings.sideViewMaxRatio;
  const alignmentGood = selected.alignmentError <= settings.bodyAlignmentTolerance;
  const calibrationScale =
    calibration && selected.bodyScale > 0 ? selected.bodyScale / calibration.bodyScale : 1;
  const calibrationOkay = !calibration || (calibrationScale >= 0.7 && calibrationScale <= 1.35);

  const visibilityScore = clamp(
    (selected.visibilityScore - settings.minLandmarkVisibility) /
      (1 - settings.minLandmarkVisibility || 1),
    0,
    1
  );
  const alignmentScore = clamp(
    1 - selected.alignmentError / Math.max(settings.bodyAlignmentTolerance, 0.001),
    0,
    1
  );
  const sideViewScore = clamp(
    1 - Math.max(shoulderWidthRatio, hipWidthRatio) / Math.max(settings.sideViewMaxRatio, 0.01),
    0,
    1
  );
  const framingScore = framedWell ? 1 : 0.25;

  const confidence = clamp(
    visibilityScore * 0.45 + alignmentScore * 0.25 + sideViewScore * 0.2 + framingScore * 0.1,
    0,
    1
  );

  let status: PoseFrameMetrics['status'] = 'ready';
  let guidance = calibration
    ? 'Aligned and ready to count.'
    : 'Aligned and ready. Calibrate for tighter framing checks.';

  if (selected.visibilityScore < settings.minLandmarkVisibility) {
    status = 'low-confidence';
    guidance = 'Low confidence. Improve lighting and keep elbows visible.';
  } else if (!framedWell) {
    status = 'bad-angle';
    guidance = 'Keep your full body in frame from shoulders to ankles.';
  } else if (!sideOnEnough) {
    status = 'bad-angle';
    guidance = 'Rotate to a side-on profile for cleaner elbow angles.';
  } else if (!alignmentGood) {
    status = 'bad-angle';
    guidance = 'Keep your body straighter from shoulder to ankle.';
  } else if (!calibrationOkay) {
    status = 'bad-angle';
    guidance = 'Match your calibration distance before counting reps.';
  }

  return {
    side: selected.side,
    elbowAngle: selected.elbowAngle,
    bodyScale: selected.bodyScale,
    shoulderWidthRatio,
    hipWidthRatio,
    alignmentError: selected.alignmentError,
    visibility: selected.visibilityScore,
    confidence,
    confidenceLabel: getConfidenceLabel(confidence),
    status,
    guidance,
    countingReady: status === 'ready'
  };
}

// The rep counter is intentionally isolated in one file so sensitivity tuning
// can happen here without digging through the camera or UI code.
export function updateCounterState(
  runtime: CounterRuntimeState,
  frame: PoseFrameMetrics,
  settings: AppSettings,
  timestamp: number,
  allowRepCount: boolean
): CounterUpdate {
  const next: CounterRuntimeState = {
    ...runtime,
    angleWindow: [...runtime.angleWindow],
    alignmentWindow: [...runtime.alignmentWindow]
  };

  if (frame.elbowAngle == null) {
    return {
      state: next,
      phase: next.phase,
      repCount: 0,
      smoothedAngle: null
    };
  }

  next.angleWindow.push(frame.elbowAngle);
  next.alignmentWindow.push(frame.alignmentError ?? 1);

  if (next.angleWindow.length > settings.smoothingFrames) {
    next.angleWindow.shift();
  }

  if (next.alignmentWindow.length > settings.smoothingFrames) {
    next.alignmentWindow.shift();
  }

  const smoothedAngle = average(next.angleWindow);
  const delta =
    next.previousSmoothedAngle == null ? 0 : smoothedAngle - next.previousSmoothedAngle;
  const movingDown = delta < -DIRECTION_EPSILON;
  const movingUp = delta > DIRECTION_EPSILON;
  const atTop = smoothedAngle >= settings.topThreshold;
  const atBottom = smoothedAngle <= settings.bottomThreshold;

  if (!frame.countingReady) {
    next.previousSmoothedAngle = smoothedAngle;
    return {
      state: next,
      phase: next.phase,
      repCount: 0,
      smoothedAngle
    };
  }

  // The finite-state machine only awards a rep after a full cycle:
  // top -> descending -> bottom -> ascending -> top.
  switch (next.phase) {
    case 'top': {
      if (movingDown && smoothedAngle < settings.topThreshold - PHASE_HYSTERESIS) {
        next.phase = 'descending';
        next.phaseEnteredAt = timestamp;
      }
      break;
    }
    case 'descending': {
      if (atBottom && timestamp - next.phaseEnteredAt >= PHASE_HOLD_MS) {
        next.phase = 'bottom';
        next.phaseEnteredAt = timestamp;
        next.seenBottom = true;
      } else if (atTop && !movingDown) {
        next.phase = 'top';
        next.phaseEnteredAt = timestamp;
      }
      break;
    }
    case 'bottom': {
      if (movingUp && smoothedAngle > settings.bottomThreshold + PHASE_HYSTERESIS) {
        next.phase = 'ascending';
        next.phaseEnteredAt = timestamp;
      }
      break;
    }
    case 'ascending': {
      if (
        atTop &&
        next.seenBottom &&
        timestamp - next.phaseEnteredAt >= PHASE_HOLD_MS &&
        timestamp - next.lastRepTimestamp >= settings.cooldownMs
      ) {
        next.phase = 'top';
        next.phaseEnteredAt = timestamp;
        next.lastRepTimestamp = timestamp;
        next.seenBottom = false;
        next.previousSmoothedAngle = smoothedAngle;
        return {
          state: next,
          phase: next.phase,
          repCount: allowRepCount ? 1 : 0,
          smoothedAngle
        };
      }

      if (atBottom && movingDown) {
        next.phase = 'bottom';
        next.phaseEnteredAt = timestamp;
      }
      break;
    }
  }

  next.previousSmoothedAngle = smoothedAngle;
  return {
    state: next,
    phase: next.phase,
    repCount: 0,
    smoothedAngle
  };
}
