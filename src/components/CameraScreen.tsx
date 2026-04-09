import { PHASE_LABELS } from '../lib/defaults';
import type { CameraFacingMode, PoseSessionViewState, SetRecord } from '../types/app';

interface CameraScreenProps {
  currentSet: SetRecord | null;
  setActive: boolean;
  todayTotal: number;
  dailyGoal: number;
  setsDoneToday: number;
  repsRemaining: number;
  viewState: PoseSessionViewState;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  overlayRef: React.RefObject<HTMLCanvasElement | null>;
  onToggleCamera: () => void;
  onStartWorkout: () => void | Promise<void>;
  onEndSet: () => void;
  onFlipCamera: () => void;
  onAdjustSet: (delta: number) => void;
  savedSetMessage: string | null;
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
  viewState,
  videoRef,
  overlayRef,
  onToggleCamera,
  onStartWorkout,
  onEndSet,
  onFlipCamera,
  onAdjustSet,
  savedSetMessage,
  currentFacingMode
}: CameraScreenProps) {
  const helperMessage =
    savedSetMessage ??
    viewState.errorMessage ??
    (viewState.status !== 'ready' || viewState.calibrationActive ? viewState.guidance : null);
  const helperClassName = savedSetMessage
    ? 'camera-stage__saved'
    : viewState.errorMessage
      ? 'camera-stage__error'
      : 'camera-stage__guidance';

  return (
    <section className="screen screen--camera">
      <section className="panel panel--tight session-card">
        <div className="session-card__split">
          <div className="camera-stage__viewport camera-stage__viewport--session">
            <video ref={videoRef} className="camera-stage__video" muted playsInline />
            <canvas ref={overlayRef} className="camera-stage__overlay" />
          </div>

          <aside className="session-rail" aria-label="Session overview">
            <div className="session-rail__goal">
              <span className="session-rail__label">Today</span>
              <strong className="session-rail__value">
                {todayTotal}
                <span>/{dailyGoal}</span>
              </strong>
              <small className="session-rail__hint">{Math.max(0, repsRemaining)} left today</small>
            </div>

            <div className="session-rail__set">
              <span className="session-rail__label">Current set</span>
              <strong className="session-rail__value">{currentSet?.reps ?? 0}</strong>
              <small className="session-rail__hint">
                {setActive ? PHASE_LABELS[viewState.phase] : 'Ready to start'}
              </small>
            </div>

            <div className="session-rail__chips">
              <span className="inline-badge">Sets {setsDoneToday}</span>
              <span className="inline-badge">Left {Math.max(0, repsRemaining)}</span>
            </div>

            <div className="session-rail__status">
              <p className={`status-pill status-pill--${viewState.status}`}>{formatStatusLabel(viewState.status)}</p>
              <p className="session-rail__camera-mode">
                {currentFacingMode === 'environment' ? 'Rear camera' : 'Front camera'}
              </p>
            </div>
          </aside>
        </div>

        <div className="session-feedback">
          {helperMessage ? <p className={helperClassName}>{helperMessage}</p> : null}
        </div>

        {viewState.calibrationActive ? (
          <div className="progress-track" aria-hidden="true">
            <span
              className="progress-track__fill"
              style={{ width: `${Math.round(viewState.calibrationProgress * 100)}%` }}
            />
          </div>
        ) : null}
      </section>

      <section className="panel panel--tight session-dock">
        <div className="session-dock__controls session-dock__controls--top">
          <button className="primary-button" type="button" onClick={onToggleCamera}>
            {viewState.isCameraRunning ? 'Stop camera' : 'Start camera'}
          </button>
          <button className="secondary-button" type="button" onClick={onFlipCamera}>
            Flip camera
          </button>
        </div>

        <div className="session-dock__controls session-dock__controls--main">
          {setActive ? (
            <button className="accent-button session-dock__primary-action" type="button" onClick={onEndSet}>
              Save set
            </button>
          ) : (
            <button className="accent-button session-dock__primary-action" type="button" onClick={onStartWorkout}>
              Start set
            </button>
          )}
          <button className="manual-button" type="button" onClick={() => onAdjustSet(1)} disabled={!setActive}>
            +1
          </button>
          <button className="manual-button" type="button" onClick={() => onAdjustSet(-1)} disabled={!setActive}>
            -1
          </button>
        </div>
      </section>
    </section>
  );
}
