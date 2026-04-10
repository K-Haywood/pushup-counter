import { PHASE_LABELS } from '../lib/defaults';
import { formatAnalysisScore, getFormTakeaway } from '../lib/formInsights';
import type { CameraFacingMode, PoseSessionViewState, RecentSetInsight, SetRecord } from '../types/app';

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
  savedSessionInsight: RecentSetInsight | null;
  currentFacingMode: CameraFacingMode;
}

function formatStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ready: 'Tracking',
    loading: 'Loading',
    'camera-stopped': 'Camera off',
    'camera-error': 'Camera issue',
    'no-person': 'Finding you',
    'multiple-people': 'One person only',
    'low-confidence': 'Hold steady',
    'bad-angle': 'Adjust angle'
  };
  return labels[status] ?? status.replace('-', ' ');
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
  savedSessionInsight,
  currentFacingMode
}: CameraScreenProps) {
  const goalProgress = dailyGoal > 0 ? Math.min(1, todayTotal / dailyGoal) : 0;

  return (
    <section className="screen screen--camera">

      {/* ── LEFT: full-height camera feed ── */}
      <div className="cam-feed">
        <video ref={videoRef} className="cam-feed__video" muted playsInline />
        <canvas ref={overlayRef} className="cam-feed__canvas" />

        {/* Goal ring shown when camera is off */}
        {!viewState.isCameraRunning && (
          <div className="cam-feed__idle">
            <div
              className="cam-ring"
              style={{
                background: `conic-gradient(#ff8c1a ${goalProgress * 360}deg, rgba(255,255,255,0.06) 0deg)`
              }}
              aria-label={`Goal progress ${Math.round(goalProgress * 100)} percent`}
            >
              <div className="cam-ring__inner">
                <span className="cam-ring__value">{todayTotal}</span>
                <span className="cam-ring__label">/{dailyGoal}</span>
              </div>
            </div>
            {streak > 0 && (
              <p className="cam-feed__idle-streak">{streak}d streak 🔥</p>
            )}
            <p className="cam-feed__idle-hint">Start camera to begin</p>
          </div>
        )}

        {/* Rep badge overlaid on feed during a set */}
        {setActive && viewState.isCameraRunning && (
          <div className="cam-feed__rep-badge" aria-live="polite">
            <strong>{currentSet?.reps ?? 0}</strong>
          </div>
        )}

        {/* Bottom bar: status + camera mode */}
        <div className="cam-feed__foot">
          <span className={`cam-chip cam-chip--${viewState.status}`}>
            {formatStatusLabel(viewState.status)}
          </span>
          <span className="cam-feed__mode">
            {currentFacingMode === 'environment' ? 'Rear' : 'Front'}
          </span>
        </div>
      </div>

      {/* ── RIGHT: session controls ── */}
      <aside className="session-panel" aria-label="Session controls">

        {/* Hero count */}
        <div className="session-panel__hero">
          <p className="eyebrow">{setActive ? 'This set' : 'Today'}</p>
          <strong className="session-panel__count">
            {setActive ? (currentSet?.reps ?? 0) : todayTotal}
            {!setActive && (
              <span className="session-panel__count-goal">/{dailyGoal}</span>
            )}
          </strong>
          <div className="session-panel__chips">
            <span className="session-chip">{setsDoneToday} sets</span>
            <span className="session-chip">{Math.max(0, repsRemaining)} left</span>
          </div>
        </div>

        {/* Rep progress */}
        <div className="session-panel__progress">
          <span className="session-panel__phase">
            {setActive ? PHASE_LABELS[viewState.phase] : 'Ready'}
          </span>
          <div className="rep-track">
            <span
              className="rep-track__fill"
              style={{ width: `${Math.round(viewState.repProgress * 100)}%` }}
            />
          </div>
          {viewState.calibrationActive && (
            <div className="rep-track rep-track--calibrate" style={{ marginTop: '5px' }}>
              <span
                className="rep-track__fill"
                style={{ width: `${Math.round(viewState.calibrationProgress * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Feedback / recap */}
        <div className="session-panel__feedback">
          {viewState.errorMessage ? (
            <p className="session-panel__msg session-panel__msg--error">
              {viewState.errorMessage}
            </p>
          ) : !setActive && savedSessionInsight ? (
            <div className="session-recap" aria-live="polite">
              <span className="eyebrow">Set saved</span>
              <strong className="session-recap__summary">
                {savedSessionInsight.reps} reps &middot; {formatAnalysisScore(savedSessionInsight.avgQualityScore)}
              </strong>
              <p className="session-recap__note">{getFormTakeaway(savedSessionInsight)}</p>
            </div>
          ) : viewState.status !== 'ready' && viewState.guidance ? (
            <p className="session-panel__msg">{viewState.guidance}</p>
          ) : null}
        </div>

        {/* Push actions to bottom */}
        <div className="session-panel__spacer" />

        {/* Primary action + corrections */}
        <div className="session-panel__actions">
          {setActive ? (
            <button className="session-cta session-cta--save" type="button" onClick={onEndSet}>
              Save set
            </button>
          ) : (
            <button className="session-cta" type="button" onClick={onStartWorkout}>
              Start set
            </button>
          )}
          <div className="session-nudge">
            <button
              className="session-nudge__btn"
              type="button"
              onClick={() => onAdjustSet(1)}
              disabled={!setActive}
            >
              +1
            </button>
            <button
              className="session-nudge__btn"
              type="button"
              onClick={() => onAdjustSet(-1)}
              disabled={!setActive}
            >
              &minus;1
            </button>
          </div>
        </div>

        {/* Camera controls */}
        <div className="session-cam-row">
          <button className="session-cam-btn" type="button" onClick={onToggleCamera}>
            {viewState.isCameraRunning ? 'Stop' : 'Start camera'}
          </button>
          <button className="session-cam-btn" type="button" onClick={onFlipCamera}>
            Flip
          </button>
        </div>

      </aside>
    </section>
  );
}
