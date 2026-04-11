import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { EMPTY_CAMERA_DEVICES, INITIAL_SESSION_VIEW_STATE } from '../lib/defaults';
import {
  analyzePoseFrame,
  createCounterRuntimeState,
  getEffectiveThresholds,
  updateCounterState
} from '../lib/pushupCounter';
import { drawPoseOverlay } from '../lib/drawPoseOverlay';
import { triggerRepFeedback } from '../lib/feedback';
import type {
  AppSettings,
  CalibrationSnapshot,
  CameraDeviceOption,
  PoseFrameMetrics,
  PoseStatus,
  PoseSessionViewState,
  RepTelemetry
} from '../types/app';

const INFERENCE_INTERVAL_MS = 70;
const READY_RECOVERY_DELAY_MS = 140;
const WARNING_STATUS_DELAY_MS = 280;
const PERSON_STATUS_DELAY_MS = 620;
const SECONDARY_PERSON_STATUS_DELAY_MS = 420;
const MOTION_PROGRESS_HOLD_MS = 320;
const MOTION_PROGRESS_DECAY = 0.84;
const MOTION_PROGRESS_BLEND = 0.6;

interface UsePushupPoseSessionOptions {
  settings: AppSettings;
  setActive: boolean;
  onRepCounted: (repTelemetry: RepTelemetry) => void;
}

interface CalibrationDraft {
  active: boolean;
  holdStart: number | null;
  samples: PoseFrameMetrics[];
}

interface StatusTransitionState {
  displayedStatus: PoseStatus;
  displayedGuidance: string;
  candidateStatus: PoseStatus | null;
  candidateGuidance: string;
  candidateSince: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getStatusDelay(currentStatus: PoseStatus, nextStatus: PoseStatus): number {
  if (nextStatus === currentStatus) {
    return 0;
  }

  switch (nextStatus) {
    case 'ready':
      return READY_RECOVERY_DELAY_MS;
    case 'no-person':
      return PERSON_STATUS_DELAY_MS;
    case 'multiple-people':
      return currentStatus === 'ready' ? PERSON_STATUS_DELAY_MS : SECONDARY_PERSON_STATUS_DELAY_MS;
    case 'low-confidence':
    case 'bad-angle':
      return WARNING_STATUS_DELAY_MS;
    default:
      return 0;
  }
}

function getRepProgress(
  smoothedAngle: number | null,
  settings: AppSettings,
  calibration: CalibrationSnapshot | null
): number | null {
  if (smoothedAngle == null) {
    return null;
  }

  const thresholds = getEffectiveThresholds(settings, calibration);
  const range = Math.max(thresholds.topThreshold - thresholds.bottomThreshold, 1);
  return clamp((thresholds.topThreshold - smoothedAngle) / range, 0, 1);
}

async function listVideoInputs(): Promise<CameraDeviceOption[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === 'videoinput')
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Camera ${index + 1}`
    }));
}

export function usePushupPoseSession({
  settings,
  setActive,
  onRepCounted
}: UsePushupPoseSessionOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastInferenceAtRef = useRef(0);
  const counterStateRef = useRef(createCounterRuntimeState());
  const calibrationSnapshotRef = useRef<CalibrationSnapshot | null>(null);
  const calibrationDraftRef = useRef<CalibrationDraft>({
    active: false,
    holdStart: null,
    samples: []
  });
  const statusTransitionRef = useRef<StatusTransitionState>({
    displayedStatus: INITIAL_SESSION_VIEW_STATE.status,
    displayedGuidance: INITIAL_SESSION_VIEW_STATE.guidance,
    candidateStatus: null,
    candidateGuidance: '',
    candidateSince: 0
  });
  const motionProgressRef = useRef(0);
  const lastMotionAtRef = useRef(0);
  const hasSeenCameraPreferenceRef = useRef(false);
  const startCameraRef = useRef<() => Promise<void>>(async () => {});
  const settingsRef = useRef(settings);
  const setActiveRef = useRef(setActive);
  const onRepCountedRef = useRef(onRepCounted);

  const [cameraDevices, setCameraDevices] = useState<CameraDeviceOption[]>(EMPTY_CAMERA_DEVICES);
  const [viewState, setViewState] = useState<PoseSessionViewState>(INITIAL_SESSION_VIEW_STATE);

  settingsRef.current = settings;
  setActiveRef.current = setActive;
  onRepCountedRef.current = onRepCounted;

  useEffect(() => {
    counterStateRef.current = createCounterRuntimeState();
  }, [setActive, settings.topThreshold, settings.bottomThreshold, settings.smoothingFrames, settings.cooldownMs]);

  useEffect(() => {
    const mountedVideo = videoRef.current;
    const mountedOverlay = overlayRef.current;

    return () => {
      if (animationFrameRef.current != null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (mountedVideo) {
        mountedVideo.pause();
        mountedVideo.srcObject = null;
      }

      if (mountedOverlay) {
        const context = mountedOverlay.getContext('2d');
        context?.clearRect(0, 0, mountedOverlay.width, mountedOverlay.height);
      }

      poseLandmarkerRef.current?.close();
    };
  }, []);

  function resetSessionUi(status: PoseStatus, guidance: string): void {
    statusTransitionRef.current = {
      displayedStatus: status,
      displayedGuidance: guidance,
      candidateStatus: null,
      candidateGuidance: '',
      candidateSince: 0
    };
    motionProgressRef.current = 0;
    lastMotionAtRef.current = 0;
  }

  function resolveDisplayedStatus(status: PoseStatus, guidance: string, timestamp: number) {
    const runtime = statusTransitionRef.current;

    if (status === runtime.displayedStatus) {
      runtime.displayedGuidance = guidance;
      runtime.candidateStatus = null;
      runtime.candidateGuidance = '';
      runtime.candidateSince = 0;
      return {
        status: runtime.displayedStatus,
        guidance: runtime.displayedGuidance
      };
    }

    if (runtime.candidateStatus !== status) {
      runtime.candidateStatus = status;
      runtime.candidateGuidance = guidance;
      runtime.candidateSince = timestamp;
      return {
        status: runtime.displayedStatus,
        guidance: runtime.displayedGuidance
      };
    }

    if (timestamp - runtime.candidateSince >= getStatusDelay(runtime.displayedStatus, status)) {
      runtime.displayedStatus = status;
      runtime.displayedGuidance = guidance;
      runtime.candidateStatus = null;
      runtime.candidateGuidance = '';
      runtime.candidateSince = 0;
    }

    return {
      status: runtime.displayedStatus,
      guidance: runtime.displayedGuidance
    };
  }

  function resolveRepProgress(smoothedAngle: number | null, timestamp: number): number {
    const rawProgress = getRepProgress(smoothedAngle, settingsRef.current, calibrationSnapshotRef.current);

    if (rawProgress != null) {
      lastMotionAtRef.current = timestamp;
      motionProgressRef.current =
        motionProgressRef.current * (1 - MOTION_PROGRESS_BLEND) + rawProgress * MOTION_PROGRESS_BLEND;
      return motionProgressRef.current;
    }

    if (timestamp - lastMotionAtRef.current <= MOTION_PROGRESS_HOLD_MS) {
      return motionProgressRef.current;
    }

    motionProgressRef.current *= MOTION_PROGRESS_DECAY;
    if (motionProgressRef.current < 0.02) {
      motionProgressRef.current = 0;
    }

    return motionProgressRef.current;
  }

  useEffect(() => {
    if (!hasSeenCameraPreferenceRef.current) {
      hasSeenCameraPreferenceRef.current = true;
      return;
    }

    if (streamRef.current) {
      void startCameraRef.current();
    }
  }, [settings.preferredCameraId, settings.cameraFacingMode]);

  async function ensurePoseLandmarker(): Promise<PoseLandmarker> {
    if (poseLandmarkerRef.current) {
      return poseLandmarkerRef.current;
    }

    setViewState((current) => ({
      ...current,
      isLoadingModel: true,
      status: 'loading',
      guidance: 'Loading on-device pose model...',
      repProgress: 0,
      errorMessage: null
    }));
    resetSessionUi('loading', 'Loading on-device pose model...');

    const wasmBaseUrl = new URL('./vendor/mediapipe/wasm', window.location.href).toString();
    const modelUrl = new URL('./models/pose_landmarker_lite.task', window.location.href).toString();
    const vision = await FilesetResolver.forVisionTasks(wasmBaseUrl);
      const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelUrl
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

    poseLandmarkerRef.current = poseLandmarker;
    setViewState((current) => ({
      ...current,
      isLoadingModel: false
    }));

    return poseLandmarker;
  }

  async function startCamera(): Promise<void> {
    try {
      const video = videoRef.current;
      if (!video) {
        return;
      }

      await ensurePoseLandmarker();
      await stopCamera(false);

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: settings.preferredCameraId
          ? {
              deviceId: { exact: settings.preferredCameraId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              aspectRatio: { ideal: 16 / 9 }
            }
          : {
              facingMode: { ideal: settings.cameraFacingMode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              aspectRatio: { ideal: 16 / 9 }
            }
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: settings.cameraFacingMode }
          }
        });
      }

      streamRef.current = stream;
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.muted = true;
      await video.play();

      const devices = await listVideoInputs();
      setCameraDevices(devices);

      counterStateRef.current = createCounterRuntimeState();
      resetSessionUi(
        'ready',
        'Camera running. Face the camera and keep your chest, elbows, and at least one wrist visible.'
      );
      setViewState((current) => ({
        ...current,
        isCameraRunning: true,
        status: 'ready',
        guidance: 'Camera running. Face the camera and keep your chest, elbows, and at least one wrist visible.',
        repProgress: 0,
        errorMessage: null
      }));

      startLoop();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start the camera.';
      resetSessionUi('camera-error', 'Camera access failed. Check permissions and try again.');
      setViewState((current) => ({
        ...current,
        isCameraRunning: false,
        isLoadingModel: false,
        status: 'camera-error',
        guidance: 'Camera access failed. Check permissions and try again.',
        repProgress: 0,
        errorMessage: message
      }));
    }
  }

  startCameraRef.current = startCamera;

  async function stopCamera(clearError = true): Promise<void> {
    if (animationFrameRef.current != null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    const canvas = overlayRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      context?.clearRect(0, 0, canvas.width, canvas.height);
    }

    calibrationDraftRef.current = {
      active: false,
      holdStart: null,
      samples: []
    };
    resetSessionUi('camera-stopped', 'Start the camera to preview your pose.');

    setViewState((current) => ({
      ...current,
      isCameraRunning: false,
      status: 'camera-stopped',
      guidance: 'Start the camera to preview your pose.',
      repProgress: 0,
      calibrationActive: false,
      calibrationProgress: 0,
      errorMessage: clearError ? null : current.errorMessage
    }));
  }

  function startLoop(): void {
    const tick = (timestamp: number) => {
      const video = videoRef.current;
      const overlay = overlayRef.current;
      const poseLandmarker = poseLandmarkerRef.current;

      if (!video || !overlay || !poseLandmarker || video.readyState < 2) {
        animationFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      if (timestamp - lastInferenceAtRef.current < INFERENCE_INTERVAL_MS) {
        animationFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      lastInferenceAtRef.current = timestamp;

      poseLandmarker.detectForVideo(video, timestamp, (result) => {
        handleResult(result, video, overlay, timestamp);
      });

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  }

  function handleCalibration(frame: PoseFrameMetrics, timestamp: number): void {
    const draft = calibrationDraftRef.current;
    if (!draft.active) {
      return;
    }

    if (
      frame.countingReady &&
      frame.elbowAngle != null &&
      frame.bodyScale != null &&
      frame.shoulderWidthRatio != null &&
      frame.hipWidthRatio != null &&
      frame.side &&
      frame.elbowAngle >= settingsRef.current.topThreshold - 10
    ) {
      if (draft.holdStart == null) {
        draft.holdStart = timestamp;
      }

      draft.samples.push(frame);
      const progress = Math.min(
        1,
        (timestamp - draft.holdStart) / settingsRef.current.calibrationHoldMs
      );

      setViewState((current) => ({
        ...current,
        calibrationActive: true,
        calibrationProgress: progress,
        guidance:
          progress < 1
            ? 'Hold the top position steady to finish calibration.'
            : 'Calibration complete.'
      }));

      if (progress >= 1) {
        const bodyScale =
          draft.samples.reduce((sum, sample) => sum + (sample.bodyScale ?? 0), 0) / draft.samples.length;
        const shoulderWidthRatio =
          draft.samples.reduce((sum, sample) => sum + (sample.shoulderWidthRatio ?? 0), 0) /
          draft.samples.length;
        const hipWidthRatio =
          draft.samples.reduce((sum, sample) => sum + (sample.hipWidthRatio ?? 0), 0) /
          draft.samples.length;
        const latest = draft.samples[draft.samples.length - 1];

        calibrationSnapshotRef.current = {
          side: latest.side!,
          bodyScale,
          shoulderWidthRatio,
          hipWidthRatio,
          topElbowAngle:
            draft.samples.reduce((sum, sample) => sum + (sample.elbowAngle ?? 0), 0) / draft.samples.length,
          capturedAt: new Date().toISOString()
        };

        calibrationDraftRef.current = {
          active: false,
          holdStart: null,
          samples: []
        };

        setViewState((current) => ({
          ...current,
          calibrationActive: false,
          calibrationProgress: 1,
          calibrationSnapshot: calibrationSnapshotRef.current,
          guidance: 'Calibration saved. Start a set when you are ready.'
        }));
      }
    } else {
      calibrationDraftRef.current = {
        active: true,
        holdStart: null,
        samples: []
      };
      setViewState((current) => ({
        ...current,
        calibrationActive: true,
        calibrationProgress: 0,
        guidance: 'Hold the top push-up position while facing the camera.'
      }));
    }
  }

  function handleResult(
    result: PoseLandmarkerResult,
    video: HTMLVideoElement,
    overlay: HTMLCanvasElement,
    timestamp: number
  ): void {
    let frame: PoseFrameMetrics;

    if (result.landmarks.length === 0) {
      frame = {
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
        guidance: 'No person detected. Frame your shoulders, elbows, wrists, and hips.',
        countingReady: false
      };
    } else if (result.landmarks.length > 1) {
      frame = {
        side: null,
        elbowAngle: null,
        bodyScale: null,
        shoulderWidthRatio: null,
        hipWidthRatio: null,
        alignmentError: null,
        visibility: 0,
        confidence: 0,
        confidenceLabel: 'low',
        status: 'multiple-people',
        guidance: 'Multiple people visible. Counting pauses until only one person remains.',
        countingReady: false
      };
    } else {
      frame = analyzePoseFrame(result.landmarks[0], settingsRef.current, calibrationSnapshotRef.current);
    }

    drawPoseOverlay(overlay, video, result, frame.side);
    handleCalibration(frame, timestamp);

    const update = updateCounterState(
      counterStateRef.current,
      frame,
      settingsRef.current,
      calibrationSnapshotRef.current,
      timestamp,
      setActiveRef.current
    );
    counterStateRef.current = update.state;
    const displayedStatus = resolveDisplayedStatus(frame.status, frame.guidance, timestamp);
    const repProgress = resolveRepProgress(update.smoothedAngle, timestamp);

    if (update.repCount > 0 && update.repTelemetry) {
      onRepCountedRef.current(update.repTelemetry);
      triggerRepFeedback(settingsRef.current.soundEnabled, settingsRef.current.vibrationEnabled);
    }

    setViewState((current) => ({
      ...current,
      status: displayedStatus.status,
      guidance: current.calibrationActive ? current.guidance : displayedStatus.guidance,
      phase: update.phase,
      confidence: frame.confidence,
      confidenceLabel: frame.confidenceLabel,
      selectedSide: frame.side,
      elbowAngle: frame.elbowAngle,
      smoothedAngle: update.smoothedAngle,
      repProgress,
      calibrationSnapshot: calibrationSnapshotRef.current
    }));
  }

  return {
    videoRef,
    overlayRef,
    viewState,
    cameraDevices,
    startCamera,
    stopCamera,
    startCalibration() {
      calibrationDraftRef.current = {
        active: true,
        holdStart: null,
        samples: []
      };
      setViewState((current) => ({
        ...current,
        calibrationActive: true,
        calibrationProgress: 0,
        guidance: 'Hold the top push-up position while facing the camera.'
      }));
    }
  };
}
