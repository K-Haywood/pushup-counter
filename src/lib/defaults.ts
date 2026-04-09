import type {
  AppSettings,
  CameraDeviceOption,
  CounterPhase,
  PoseSessionViewState,
  StoredAppState
} from '../types/app';

export const APP_STORAGE_KEY = 'pushup-counter:v1';
export const APP_STATE_VERSION = 1;

export const DEFAULT_SETTINGS: AppSettings = {
  defaultDailyGoal: 100,
  soundEnabled: true,
  vibrationEnabled: true,
  cameraFacingMode: 'environment',
  preferredCameraId: null,
  smoothingFrames: 5,
  topThreshold: 155,
  bottomThreshold: 95,
  minLandmarkVisibility: 0.65,
  bodyAlignmentTolerance: 0.12,
  sideViewMaxRatio: 0.28,
  frontViewMinRatio: 0.55,
  armSymmetryTolerance: 0.14,
  cooldownMs: 650,
  calibrationHoldMs: 1200
};

export const EMPTY_CAMERA_DEVICES: CameraDeviceOption[] = [];

export const INITIAL_SESSION_VIEW_STATE: PoseSessionViewState = {
  isCameraRunning: false,
  isLoadingModel: false,
  status: 'camera-stopped',
  guidance: 'Start the camera to preview your pose.',
  phase: 'top',
  confidence: 0,
  confidenceLabel: 'low',
  selectedSide: null,
  elbowAngle: null,
  smoothedAngle: null,
  calibrationSnapshot: null,
  calibrationActive: false,
  calibrationProgress: 0,
  errorMessage: null
};

export const PHASE_LABELS: Record<CounterPhase, string> = {
  top: 'Top',
  descending: 'Down',
  bottom: 'Bottom',
  ascending: 'Up'
};

export function createEmptyStoredState(): StoredAppState {
  return {
    version: APP_STATE_VERSION,
    settings: DEFAULT_SETTINGS,
    days: {},
    session: {
      activeSetId: null,
      activeDate: null
    },
    streakSnapshot: {
      current: 0,
      longest: 0
    }
  };
}
