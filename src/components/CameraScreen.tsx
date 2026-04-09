import { PHASE_LABELS } from '../lib/defaults';
import type { CameraFacingMode, PoseSessionViewState, SetRecord } from '../types/app';

interface CameraScreenProps {
  currentSet: SetRecord | null;
  setActive: boolean;
  todayTotal: number;
  dailyGoal: number;
  setsDoneToday: number;
  repsRemaining: number;
  streak: number;
  viewState: PoseSessionViewState;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  overlayRef: React.RefObject<HTMLCanvasElement | null>;
  onToggleCamera: () => void;
  onStartSet: () => void;
  onEndSet: () => void;
  onCalibrate: () => void;
  onFlipCamera: () => void;
  onAdjustSet: (delta: number) => void;
  currentFacingMode: CameraFacingMode;
}

function formatStatusLabel(status: string) {
  return status.replace('-', ' ');
}

export function CameraScreen({
  currentSet,
  setActive,
  todayTotal,
  dailyGoal,
  setsDoneToday,
  repsRemaining,
  streak,
  viewState,
  videoRef,
  overlayRef,
  onToggleCamera,
  onStartSet,
  onEndSet,
  onCalibrate,
  onFlipCamera,
  onAdjustSet,
  currentFacingMode
}: CameraScreenProps) {
  const goalProgress = dailyGoal > 0 ? Math.min(1, todayTotal / dailyGoal) : 0;

  return (
    <section className="screen screen--camera">
      <section className="camera-stage panel panel--tight camera-stage--hero">
        <div className="camera-stage__viewport camera-stage__viewport--session">
          <video ref={videoRef} className="camera-stage__video" muted playsInline />
          <canvas ref={overlayRef} className="camera-stage__overlay" />

          <div className="camera-stage__hud">
            <div className="camera-stage__hud-card">
              <span>Today</span>
              <strong>
                {todayTotal}/{dailyGoal}
              </strong>
            </div>
            <p className={`status-pill status-pill--${viewState.status}`}>{formatStatusLabel(viewState.status)}</p>
          </div>

          <div className="camera-stage__footer">
            <span className="inline-badge">Sets {setsDoneToday}</span>
            <span className="inline-badge">Left {Math.max(0, repsRemaining)}</span>
            {streak > 0 ? <span className="inline-badge">Streak {streak}d</span> : null}
          </div>
        </div>

        <div className="camera-stage__meta">
          <p className="camera-stage__guidance">{viewState.guidance}</p>
          {viewState.errorMessage ? <p className="camera-stage__error">{viewState.errorMessage}</p> : null}
        </div>
      </section>

      <section className="panel panel--tight">
        <div className="session-toolbar">
          <div>
            <p className="eyebrow">Session</p>
            <h2>Ready for your next set</h2>
          </div>
          <span className="session-progress__chip">{Math.max(0, repsRemaining)} reps left</span>
        </div>

        <div className="progress-track" aria-hidden="true">
          <span className="progress-track__fill" style={{ width: `${Math.round(goalProgress * 100)}%` }} />
        </div>

        <div className="session-metrics">
          <div className="session-metric">
            <span className="session-metric__label">Sets done</span>
            <strong>{setsDoneToday}</strong>
          </div>
          <div className="session-metric">
            <span className="session-metric__label">Current set</span>
            <strong>{currentSet?.reps ?? 0}</strong>
          </div>
          <div className="session-metric">
            <span className="session-metric__label">Camera</span>
            <strong>{viewState.isCameraRunning ? 'On' : 'Off'}</strong>
          </div>
        </div>

        <div className="button-grid button-grid--session">
          <button className="primary-button" type="button" onClick={onToggleCamera}>
            {viewState.isCameraRunning ? 'Stop camera' : 'Start camera'}
          </button>
          <button className="secondary-button" type="button" onClick={onFlipCamera}>
            {currentFacingMode === 'environment' ? 'Use front camera' : 'Use rear camera'}
          </button>
        </div>

        <div className="button-grid button-grid--session">
          {setActive ? (
            <button className="accent-button" type="button" onClick={onEndSet}>
              End set
            </button>
          ) : (
            <button
              className="accent-button"
              type="button"
              onClick={onStartSet}
              disabled={!viewState.isCameraRunning}
            >
              Start set
            </button>
          )}
          {viewState.isCameraRunning ? (
            <button className="ghost-button" type="button" onClick={onCalibrate}>
              {viewState.calibrationSnapshot ? 'Recalibrate' : 'Calibrate'}
            </button>
          ) : null}
        </div>

        {!viewState.isCameraRunning ? (
          <p className="subtle-copy">
            Place the phone low in front of you, then tap Start camera. Keep both arms and hips visible.
          </p>
        ) : null}

        {setActive ? (
          <div className="button-grid button-grid--compact-two">
            <button className="manual-button" type="button" onClick={() => onAdjustSet(1)}>
              +1 rep
            </button>
            <button className="manual-button" type="button" onClick={() => onAdjustSet(-1)}>
              -1 rep
            </button>
          </div>
        ) : null}
      </section>

      {(viewState.calibrationActive || viewState.calibrationSnapshot) && viewState.isCameraRunning ? (
        <section className="panel panel--tight calibration-panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Calibration</p>
              <h2>Top-position check</h2>
            </div>
            <p className="calibration-panel__value">{Math.round(viewState.calibrationProgress * 100)}%</p>
          </div>
          <div className="progress-track" aria-hidden="true">
            <span
              className="progress-track__fill"
              style={{ width: `${Math.round(viewState.calibrationProgress * 100)}%` }}
            />
          </div>
          <p className="subtle-copy">
            {viewState.calibrationSnapshot
              ? 'Calibration is saved for this camera session.'
              : 'Hold the top push-up position until the bar fills.'}
          </p>
        </section>
      ) : null}

      <details className="panel details-panel">
        <summary>Tracking details</summary>
        <div className="diagnostic-grid">
          <div className="diagnostic-item">
            <span>Phase</span>
            <strong>{PHASE_LABELS[viewState.phase]}</strong>
          </div>
          <div className="diagnostic-item">
            <span>Confidence</span>
            <strong>{Math.round(viewState.confidence * 100)}%</strong>
          </div>
          <div className="diagnostic-item">
            <span>Elbow angle</span>
            <strong>{viewState.smoothedAngle ? `${Math.round(viewState.smoothedAngle)} deg` : '--'}</strong>
          </div>
        </div>
      </details>
    </section>
  );
}
