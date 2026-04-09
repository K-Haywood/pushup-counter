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

type ArmMetrics = {
  side: BodySide;
  visibilityScore: number;
  elbowAngle: number;
  shoulder: Landmark;
  elbow: Landmark;
  wrist: Landmark;
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

const ESSENTIAL_FRONTAL_POINTS = [11, 12, 13, 14, 15, 16];
const OPTIONAL_FRONTAL_POINTS = [23, 24];
const PHASE_HOLD_MS = 90;
const PHASE_HYSTERESIS = 6;
const DIRECTION_EPSILON = 0.55;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weightedAverage(entries: Array<{ value: number; weight: number }>): number {
  const valid = entries.filter((entry) => Number.isFinite(entry.value) && entry.weight > 0);
  if (valid.length === 0) {
    return 0;
  }

  const weightSum = valid.reduce((sum, entry) => sum + entry.weight, 0);
  if (weightSum === 0) {
    return average(valid.map((entry) => entry.value));
  }

  return valid.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / weightSum;
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

function normalizedDifference(a: number, b: number, scale: number): number {
  return Math.abs(a - b) / Math.max(scale, 0.001);
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

function getArmMetrics(landmarks: Landmark[], side: BodySide): ArmMetrics {
  const ids = side === 'left' ? LEFT : RIGHT;
  const shoulder = landmarks[ids.shoulder];
  const elbow = landmarks[ids.elbow];
  const wrist = landmarks[ids.wrist];

  return {
    side,
    shoulder,
    elbow,
    wrist,
    visibilityScore: average([visibility(shoulder), visibility(elbow), visibility(wrist)]),
    elbowAngle: angleAtVertex(shoulder, elbow, wrist)
  };
}

function isFramedWell(landmarks: Landmark[]): boolean {
  const shoulderCount = [11, 12].filter((index) => visibility(landmarks[index]) > 0.18).length;
  const elbowCount = [13, 14].filter((index) => visibility(landmarks[index]) > 0.18).length;
  const wristCount = [15, 16].filter((index) => visibility(landmarks[index]) > 0.12).length;
  const essential = ESSENTIAL_FRONTAL_POINTS
    .map((index) => landmarks[index])
    .filter((point) => visibility(point) > 0.12);
  const optional = OPTIONAL_FRONTAL_POINTS
    .map((index) => landmarks[index])
    .filter((point) => visibility(point) > 0.15);
  const relevant = [...essential, ...optional];

  if (shoulderCount < 2 || elbowCount < 2 || wristCount < 1 || relevant.length === 0) {
    return false;
  }

  const minX = Math.min(...relevant.map((point) => point.x));
  const maxX = Math.max(...relevant.map((point) => point.x));
  const minY = Math.min(...relevant.map((point) => point.y));
  const maxY = Math.max(...relevant.map((point) => point.y));

  return minX > 0.01 && maxX < 0.99 && minY > 0.01 && maxY < 0.995;
}

function getConfidenceLabel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.8) {
    return 'high';
  }

  if (confidence >= 0.58) {
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
      guidance: 'No person detected. Move into frame and face the camera.',
      countingReady: false
    };
  }

  const leftArm = getArmMetrics(landmarks, 'left');
  const rightArm = getArmMetrics(landmarks, 'right');
  const primaryArm = leftArm.visibilityScore >= rightArm.visibilityScore ? leftArm : rightArm;
  const secondaryArm = primaryArm.side === 'left' ? rightArm : leftArm;
  const selectedSide = primaryArm.side;
  const secondaryArmUsable =
    secondaryArm.visibilityScore >= Math.max(0.25, settings.minLandmarkVisibility - 0.2);

  const leftShoulder = landmarks[LEFT.shoulder];
  const rightShoulder = landmarks[RIGHT.shoulder];
  const leftHip = landmarks[LEFT.hip];
  const rightHip = landmarks[RIGHT.hip];

  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);

  const shouldersVisible = average([visibility(leftShoulder), visibility(rightShoulder)]);
  const hipsVisible = average([visibility(leftHip), visibility(rightHip)]);
  const torsoHeight = distance(shoulderMid, hipMid);
  const shoulderWidth = distance(leftShoulder, rightShoulder);
  const hipWidth = distance(leftHip, rightHip);
  const hipsReliable = hipsVisible >= Math.max(0.18, settings.minLandmarkVisibility - 0.2);
  const bodyScale = hipsReliable && torsoHeight > 0.001 ? torsoHeight : shoulderWidth * 1.45;
  const upperBodyScale = Math.max(shoulderWidth, bodyScale * 0.72, 0.001);
  const shoulderWidthRatio = bodyScale === 0 ? 0 : shoulderWidth / bodyScale;
  const hipWidthRatio = bodyScale === 0 ? 0 : hipWidth / bodyScale;
  const primaryVerticalSpan = (primaryArm.wrist.y - primaryArm.shoulder.y) / upperBodyScale;
  const secondaryVerticalSpan = (secondaryArm.wrist.y - secondaryArm.shoulder.y) / upperBodyScale;
  const armVerticalSpanRatio = weightedAverage([
    { value: primaryVerticalSpan, weight: Math.max(primaryArm.visibilityScore, 0.01) },
    ...(secondaryArmUsable
      ? [{ value: secondaryVerticalSpan, weight: Math.max(secondaryArm.visibilityScore * 0.65, 0.01) }]
      : [])
  ]);
  const reachDerivedAngle = clamp(42 + armVerticalSpanRatio * 76, 72, 170);

  const reachWeight = primaryArm.visibilityScore < 0.55 ? 0.58 : 0.42;

  const weightedElbowAngle = weightedAverage([
    { value: primaryArm.elbowAngle, weight: Math.max(primaryArm.visibilityScore, 0.01) },
    { value: reachDerivedAngle, weight: reachWeight },
    ...(secondaryArmUsable
      ? [{ value: secondaryArm.elbowAngle, weight: Math.max(secondaryArm.visibilityScore * 0.65, 0.01) }]
      : [])
  ]);

  const armSymmetryError = secondaryArmUsable
    ? Math.abs(leftArm.elbowAngle - rightArm.elbowAngle) / 180
    : 0;
  const shoulderLevelError = normalizedDifference(leftShoulder.y, rightShoulder.y, shoulderWidth);
  const hipLevelError = hipsVisible > 0.25 ? normalizedDifference(leftHip.y, rightHip.y, hipWidth) : 0;
  const centerLineError = hipsVisible > 0.25 ? normalizedDifference(shoulderMid.x, hipMid.x, bodyScale) : 0;
  const alignmentError = average([
    shoulderLevelError,
    ...(hipsVisible > 0.25 ? [hipLevelError, centerLineError] : []),
    ...(secondaryArmUsable ? [armSymmetryError * 0.65] : [])
  ]);

  const framedWell = isFramedWell(landmarks);
  const frontFacingEnough = shoulderWidthRatio >= settings.frontViewMinRatio * 0.64;
  const symmetryGood = !secondaryArmUsable || armSymmetryError <= settings.armSymmetryTolerance * 1.5;
  const alignmentGood = alignmentError <= settings.bodyAlignmentTolerance * 1.45;
  const visibilityRaw = weightedAverage([
    { value: primaryArm.visibilityScore, weight: 0.45 },
    { value: shouldersVisible, weight: 0.3 },
    { value: secondaryArmUsable ? secondaryArm.visibilityScore : primaryArm.visibilityScore, weight: 0.15 },
    { value: hipsVisible > 0.2 ? hipsVisible : primaryArm.visibilityScore, weight: 0.1 }
  ]);

  const calibrationScale = calibration && bodyScale > 0 ? bodyScale / calibration.bodyScale : 1;
  const calibrationOkay =
    !calibration ||
    ((!hipsReliable || (calibrationScale >= 0.48 && calibrationScale <= 2.05)) ||
      shouldersVisible < settings.minLandmarkVisibility) &&
      shoulderWidthRatio >= calibration.shoulderWidthRatio * 0.34 &&
      shoulderWidthRatio <= calibration.shoulderWidthRatio * 2.15;

  const visibilityScore = clamp(
    (visibilityRaw - settings.minLandmarkVisibility) /
      Math.max(1 - settings.minLandmarkVisibility, 0.001),
    0,
    1
  );
  const alignmentScore = clamp(
    1 - alignmentError / Math.max(settings.bodyAlignmentTolerance * 1.45, 0.001),
    0,
    1
  );
  const frontViewScore = clamp(
    shoulderWidthRatio / Math.max(settings.frontViewMinRatio * 0.64, 0.001),
    0,
    1
  );
  const symmetryScore = secondaryArmUsable
    ? clamp(1 - armSymmetryError / Math.max(settings.armSymmetryTolerance * 1.5, 0.001), 0, 1)
    : 0.78;
  const framingScore = framedWell ? 1 : 0.2;

  const confidence = clamp(
    visibilityScore * 0.47 +
      alignmentScore * 0.18 +
      frontViewScore * 0.2 +
      symmetryScore * 0.1 +
      framingScore * 0.05,
    0,
    1
  );

  let status: PoseFrameMetrics['status'] = 'ready';
  let guidance = calibration
    ? 'Front-on view locked. Start counting when ready.'
    : 'Front-on view locked. Hold the top position to calibrate.';

  if (visibilityRaw < settings.minLandmarkVisibility) {
    status = 'low-confidence';
    guidance = 'Improve lighting and keep both elbows and wrists visible.';
  } else if (!framedWell) {
    status = 'bad-angle';
    guidance = 'Keep your upper body inside the frame and leave some margin around your arms.';
  } else if (!frontFacingEnough) {
    status = 'bad-angle';
    guidance = 'Face the camera directly and move slightly closer if your shoulders look narrow.';
  } else if (!symmetryGood) {
    status = 'bad-angle';
    guidance = 'Try to keep both elbows visible, but the app can still count from the clearer arm.';
  } else if (!alignmentGood) {
    status = 'bad-angle';
    guidance = 'Square your shoulders to the camera and avoid leaning to one side.';
  } else if (!calibrationOkay) {
    status = 'bad-angle';
    guidance = 'Return to roughly the same distance you used during calibration.';
  }

  return {
    side: selectedSide,
    elbowAngle: weightedElbowAngle,
    bodyScale,
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
