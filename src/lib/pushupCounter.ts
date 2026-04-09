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
  hip: 23
} as const;

const RIGHT = {
  shoulder: 12,
  elbow: 14,
  wrist: 16,
  hip: 24
} as const;

const FRONTAL_POINTS = [11, 12, 13, 14, 15, 16, 23, 24];
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

function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: average([a.visibility ?? 0, b.visibility ?? 0])
  };
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

function getArmMetrics(landmarks: Landmark[], side: BodySide) {
  const ids = side === 'left' ? LEFT : RIGHT;
  const shoulder = landmarks[ids.shoulder];
  const elbow = landmarks[ids.elbow];
  const wrist = landmarks[ids.wrist];

  const visibilityScore = average([
    visibility(shoulder),
    visibility(elbow),
    visibility(wrist)
  ]);

  return {
    side,
    visibilityScore,
    elbowAngle: angleAtVertex(shoulder, elbow, wrist)
  };
}

function isFramedWell(landmarks: Landmark[]): boolean {
  const relevant = FRONTAL_POINTS.map((index) => landmarks[index]);
  const minX = Math.min(...relevant.map((point) => point.x));
  const maxX = Math.max(...relevant.map((point) => point.x));
  const minY = Math.min(...relevant.map((point) => point.y));
  const maxY = Math.max(...relevant.map((point) => point.y));
  return minX > 0.04 && maxX < 0.96 && minY > 0.03 && maxY < 0.97;
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

  const leftArm = getArmMetrics(landmarks, 'left');
  const rightArm = getArmMetrics(landmarks, 'right');
  const selectedSide = leftArm.visibilityScore >= rightArm.visibilityScore ? 'left' : 'right';

  const leftShoulder = landmarks[LEFT.shoulder];
  const rightShoulder = landmarks[RIGHT.shoulder];
  const leftWrist = landmarks[LEFT.wrist];
  const rightWrist = landmarks[RIGHT.wrist];
  const leftHip = landmarks[LEFT.hip];
  const rightHip = landmarks[RIGHT.hip];

  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);
  const wristMid = midpoint(leftWrist, rightWrist);

  const torsoHeight = distance(shoulderMid, hipMid);
  const shoulderWidth = distance(leftShoulder, rightShoulder);
  const hipWidth = distance(leftHip, rightHip);

  const shoulderWidthRatio = torsoHeight === 0 ? 0 : shoulderWidth / torsoHeight;
  const hipWidthRatio = torsoHeight === 0 ? 0 : hipWidth / torsoHeight;
  const armSymmetryError = Math.abs(leftArm.elbowAngle - rightArm.elbowAngle) / 180;
  const shoulderLevelError = shoulderWidth === 0 ? 1 : Math.abs(leftShoulder.y - rightShoulder.y) / shoulderWidth;
  const hipLevelError = hipWidth === 0 ? 1 : Math.abs(leftHip.y - rightHip.y) / hipWidth;
  const centerLineError = torsoHeight === 0 ? 1 : Math.abs(shoulderMid.x - hipMid.x) / torsoHeight;
  const wristCenterError = torsoHeight === 0 ? 1 : Math.abs(wristMid.x - shoulderMid.x) / torsoHeight;
  const alignmentError = average([
    shoulderLevelError,
    hipLevelError,
    centerLineError,
    wristCenterError,
    armSymmetryError
  ]);

  const framedWell = isFramedWell(landmarks);
  const frontFacingEnough =
    shoulderWidthRatio >= settings.frontViewMinRatio &&
    hipWidthRatio >= settings.frontViewMinRatio * 0.55;
  const symmetryGood = armSymmetryError <= settings.armSymmetryTolerance;
  const alignmentGood = alignmentError <= settings.bodyAlignmentTolerance;
  const averageElbowAngle = average([leftArm.elbowAngle, rightArm.elbowAngle]);
  const visibilityRaw = average([
    leftArm.visibilityScore,
    rightArm.visibilityScore,
    visibility(leftHip),
    visibility(rightHip)
  ]);

  const calibrationScale =
    calibration && torsoHeight > 0 ? torsoHeight / calibration.bodyScale : 1;
  const calibrationOkay =
    !calibration ||
    (calibrationScale >= 0.7 &&
      calibrationScale <= 1.35 &&
      shoulderWidthRatio >= calibration.shoulderWidthRatio * 0.55 &&
      shoulderWidthRatio <= calibration.shoulderWidthRatio * 1.5);

  const visibilityScore = clamp(
    (visibilityRaw - settings.minLandmarkVisibility) /
      (1 - settings.minLandmarkVisibility || 1),
    0,
    1
  );
  const alignmentScore = clamp(
    1 - alignmentError / Math.max(settings.bodyAlignmentTolerance, 0.001),
    0,
    1
  );
  const frontViewScore = clamp(
    Math.min(
      shoulderWidthRatio / Math.max(settings.frontViewMinRatio, 0.001),
      hipWidthRatio / Math.max(settings.frontViewMinRatio * 0.55, 0.001)
    ),
    0,
    1
  );
  const symmetryScore = clamp(
    1 - armSymmetryError / Math.max(settings.armSymmetryTolerance, 0.001),
    0,
    1
  );
  const framingScore = framedWell ? 1 : 0.25;

  const confidence = clamp(
    visibilityScore * 0.38 +
      alignmentScore * 0.22 +
      frontViewScore * 0.2 +
      symmetryScore * 0.15 +
      framingScore * 0.05,
    0,
    1
  );

  let status: PoseFrameMetrics['status'] = 'ready';
  let guidance = calibration
    ? 'Front-on view locked. Ready to count.'
    : 'Front-on view locked. Calibrate from the top position.';

  if (visibilityRaw < settings.minLandmarkVisibility) {
    status = 'low-confidence';
    guidance = 'Low confidence. Improve lighting and keep both elbows and wrists visible.';
  } else if (!framedWell) {
    status = 'bad-angle';
    guidance = 'Keep shoulders, elbows, wrists, and hips inside the frame.';
  } else if (!frontFacingEnough) {
    status = 'bad-angle';
    guidance = 'Face the camera directly so both shoulders and hips stay wide in frame.';
  } else if (!symmetryGood) {
    status = 'bad-angle';
    guidance = 'Keep both arms visible and moving evenly together.';
  } else if (!alignmentGood) {
    status = 'bad-angle';
    guidance = 'Square your shoulders and hips to the camera.';
  } else if (!calibrationOkay) {
    status = 'bad-angle';
    guidance = 'Match your calibration distance before counting reps.';
  }

  return {
    side: selectedSide,
    elbowAngle: averageElbowAngle,
    bodyScale: torsoHeight,
    shoulderWidthRatio,
    hipWidthRatio,
    alignmentError,
    visibility: visibilityRaw,
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
