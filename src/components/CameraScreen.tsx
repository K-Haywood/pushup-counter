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
  streak,
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

          <div className="camera-stage__counter">
            <span className="camera-stage__counter-label">Current set</span>
            <strong>{currentSet?.reps ?? 0}</strong>
            <span className="camera-stage__counter-phase">{PHASE_LABELS[viewState.phase]}</span>
          </div>

          <div className="camera-stage__footer">
            <span className="inline-badge">Sets {setsDoneToday}</span>
            <span className="inline-badge">Left {Math.max(0, repsRemaining)}</span>
            {streak > 0 ? <span className="inline-badge">Streak {streak}d</span> : null}
          </div>
        </div>

        <div className="camera-stage__meta camera-stage__meta--compact">
          {savedSetMessage ? <p className="camera-stage__saved">{savedSetMessage}</p> : null}
          <p className="camera-stage__guidance">{viewState.guidance}</p>
          {viewState.errorMessage ? <p className="camera-stage__error">{viewState.errorMessage}</p> : null}
          {viewState.calibrationActive ? (
            <div className="progress-track" aria-hidden="true">
              <span
                className="progress-track__fill"
                style={{ width: `${Math.round(viewState.calibrationProgress * 100)}%` }}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel panel--tight session-dock">
        <div className="session-dock__controls session-dock__controls--top">
          <button className="primary-button" type="button" onClick={onToggleCamera}>
            {viewState.isCameraRunning ? 'Stop camera' : 'Start camera'}
          </button>
          <button className="secondary-button" type="button" onClick={onFlipCamera}>
            {currentFacingMode === 'environment' ? 'Front camera' : 'Rear camera'}
          </button>
        </div>

        <div className="session-dock__controls session-dock__controls--main">
          {setActive ? (
            <button className="accent-button session-dock__primary-action" type="button" onClick={onEndSet}>
              End set
            </button>
          ) : (
            <button className="accent-button session-dock__primary-action" type="button" onClick={onStartWorkout}>
              Start counting
            </button>
          )}
          <button
            className="manual-button"
            type="button"
            onClick={() => onAdjustSet(1)}
            disabled={!setActive}
          >
            +1
          </button>
          <button
            className="manual-button"
            type="button"
            onClick={() => onAdjustSet(-1)}
            disabled={!setActive}
          >
            -1
          </button>
        </div>
      </section>
    </section>
  );
}
