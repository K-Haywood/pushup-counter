export type AppTab = 'home' | 'camera' | 'history' | 'settings';

export type CounterPhase = 'top' | 'descending' | 'bottom' | 'ascending';

export type BodySide = 'left' | 'right';

export type PoseStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'camera-stopped'
  | 'camera-error'
  | 'no-person'
  | 'multiple-people'
  | 'low-confidence'
  | 'bad-angle';

export interface AppSettings {
  defaultDailyGoal: number;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  preferredCameraId: string | null;
  smoothingFrames: number;
  topThreshold: number;
  bottomThreshold: number;
  minLandmarkVisibility: number;
  bodyAlignmentTolerance: number;
  sideViewMaxRatio: number;
  cooldownMs: number;
  calibrationHoldMs: number;
}

export interface CorrectionRecord {
  id: string;
  timestamp: string;
  delta: number;
  reason: 'manual' | 'reset';
}

export interface SetRecord {
  id: string;
  startedAt: string;
  endedAt: string | null;
  reps: number;
  autoCountedReps: number;
  manualAdjustments: number;
  corrections: CorrectionRecord[];
}

export interface DayRecord {
  date: string;
  dailyGoal: number;
  totalReps: number;
  sets: SetRecord[];
  updatedAt: string;
}

export interface SessionState {
  activeSetId: string | null;
  activeDate: string | null;
}

export interface StreakSnapshot {
  current: number;
  longest: number;
}

export interface StoredAppState {
  version: number;
  settings: AppSettings;
  days: Record<string, DayRecord>;
  session: SessionState;
  streakSnapshot: StreakSnapshot;
}

export interface DashboardSummary {
  todayTotal: number;
  dailyGoal: number;
  remaining: number;
  setCount: number;
  currentSetReps: number;
  streak: number;
  longestStreak: number;
  allTimeReps: number;
  level: number;
  currentLevelStart: number;
  nextLevelTarget: number;
}

export interface HistoryPoint {
  date: string;
  totalReps: number;
  dailyGoal: number;
  hitGoal: boolean;
}

export interface CameraDeviceOption {
  deviceId: string;
  label: string;
}

export interface CalibrationSnapshot {
  side: BodySide;
  bodyScale: number;
  shoulderWidthRatio: number;
  hipWidthRatio: number;
  capturedAt: string;
}

export interface PoseFrameMetrics {
  side: BodySide | null;
  elbowAngle: number | null;
  bodyScale: number | null;
  shoulderWidthRatio: number | null;
  hipWidthRatio: number | null;
  alignmentError: number | null;
  visibility: number;
  confidence: number;
  confidenceLabel: 'high' | 'medium' | 'low';
  status: PoseStatus;
  guidance: string;
  countingReady: boolean;
}

export interface CounterRuntimeState {
  phase: CounterPhase;
  angleWindow: number[];
  alignmentWindow: number[];
  previousSmoothedAngle: number | null;
  lastRepTimestamp: number;
  phaseEnteredAt: number;
  seenBottom: boolean;
}

export interface CounterUpdate {
  state: CounterRuntimeState;
  phase: CounterPhase;
  repCount: number;
  smoothedAngle: number | null;
}

export interface PoseSessionViewState {
  isCameraRunning: boolean;
  isLoadingModel: boolean;
  status: PoseStatus;
  guidance: string;
  phase: CounterPhase;
  confidence: number;
  confidenceLabel: 'high' | 'medium' | 'low';
  selectedSide: BodySide | null;
  elbowAngle: number | null;
  smoothedAngle: number | null;
  calibrationSnapshot: CalibrationSnapshot | null;
  calibrationActive: boolean;
  calibrationProgress: number;
  errorMessage: string | null;
}
