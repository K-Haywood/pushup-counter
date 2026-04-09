import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { EMPTY_CAMERA_DEVICES, INITIAL_SESSION_VIEW_STATE } from '../lib/defaults';
import { analyzePoseFrame, createCounterRuntimeState, updateCounterState } from '../lib/pushupCounter';
import { drawPoseOverlay } from '../lib/drawPoseOverlay';
import { triggerRepFeedback } from '../lib/feedback';
import type {
  AppSettings,
  CalibrationSnapshot,
  CameraDeviceOption,
  PoseFrameMetrics,
  PoseSessionViewState
} from '../types/app';

const INFERENCE_INTERVAL_MS = 70;

interface UsePushupPoseSessionOptions {
  settings: AppSettings;
  setActive: boolean;
  onRepCounted: () => void;
}

interface CalibrationDraft {
  active: boolean;
  holdStart: number | null;
  samples: PoseFrameMetrics[];
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
    return () => {
      void stopCamera();
      poseLandmarkerRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (viewState.isCameraRunning) {
      void startCameraRef.current();
    }
  }, [settings.preferredCameraId, viewState.isCameraRunning]);

  async function ensurePoseLandmarker(): Promise<PoseLandmarker> {
    if (poseLandmarkerRef.current) {
      return poseLandmarkerRef.current;
    }

    setViewState((current) => ({
      ...current,
      isLoadingModel: true,
      status: 'loading',
      guidance: 'Loading on-device pose model…',
      errorMessage: null
    }));

    const wasmBaseUrl = new URL('./vendor/mediapipe/wasm', window.location.href).toString();
    const modelUrl = new URL('./models/pose_landmarker_lite.task', window.location.href).toString();
    const vision = await FilesetResolver.forVisionTasks(wasmBaseUrl);
    const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelUrl
      },
      runningMode: 'VIDEO',
      numPoses: 2,
      minPoseDetectionConfidence: 0.6,
      minPosePresenceConfidence: 0.6,
      minTrackingConfidence: 0.6
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
              height: { ideal: 720 }
            }
          : {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' }
          }
        });
      }

      streamRef.current = stream;
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      await video.play();

      const devices = await listVideoInputs();
      setCameraDevices(devices);

      counterStateRef.current = createCounterRuntimeState();
      setViewState((current) => ({
        ...current,
        isCameraRunning: true,
        status: 'ready',
        guidance: 'Camera running. Side-on view works best for counting.',
        errorMessage: null
      }));

      startLoop();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start the camera.';
      setViewState((current) => ({
        ...current,
        isCameraRunning: false,
        isLoadingModel: false,
        status: 'camera-error',
        guidance: 'Camera access failed. Check permissions and try again.',
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

    setViewState((current) => ({
      ...current,
      isCameraRunning: false,
      status: 'camera-stopped',
      guidance: 'Start the camera to preview your pose.',
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
          draft.samples.reduce((sum, sample) => sum + (sample.hipWidthRatio ?? 0), 0) / draft.samples.length;
        const latest = draft.samples[draft.samples.length - 1];

        calibrationSnapshotRef.current = {
          side: latest.side!,
          bodyScale,
          shoulderWidthRatio,
          hipWidthRatio,
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
        guidance: 'Hold the top push-up position with a clear side view.'
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
        guidance: 'No person detected. Step back and frame your full body.',
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
      timestamp,
      setActiveRef.current
    );
    counterStateRef.current = update.state;

    if (update.repCount > 0) {
      onRepCountedRef.current();
      triggerRepFeedback(settingsRef.current.soundEnabled, settingsRef.current.vibrationEnabled);
    }

    setViewState((current) => ({
      ...current,
      status: frame.status,
      guidance: frame.guidance,
      phase: update.phase,
      confidence: frame.confidence,
      confidenceLabel: frame.confidenceLabel,
      selectedSide: frame.side,
      elbowAngle: frame.elbowAngle,
      smoothedAngle: update.smoothedAngle,
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
        guidance: 'Hold the top push-up position until calibration finishes.'
      }));
    }
  };
}
