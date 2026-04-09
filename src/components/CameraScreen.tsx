import { PHASE_LABELS } from '../lib/defaults';
import type { CameraFacingMode, PoseSessionViewState, SetRecord } from '../types/app';
import { StatCard } from './StatCard';

interface CameraScreenProps {
  currentSet: SetRecord | null;
  setActive: boolean;
  viewState: PoseSessionViewState;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  overlayRef: React.RefObject<HTMLCanvasElement | null>;
  onStartCamera: () => void;
  onStopCamera: () => void;
  onStartSet: () => void;
  onEndSet: () => void;
  onCalibrate: () => void;
  onFlipCamera: () => void;
  onAdjustSet: (delta: number) => void;
  onResetSet: () => void;
  currentFacingMode: CameraFacingMode;
}

export function CameraScreen({
  currentSet,
  setActive,
  viewState,
  videoRef,
  overlayRef,
  onStartCamera,
  onStopCamera,
  onStartSet,
  onEndSet,
  onCalibrate,
  onFlipCamera,
  onAdjustSet,
  onResetSet,
  currentFacingMode
}: CameraScreenProps) {
  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Camera session</p>
          <h1>Automatic push-up counting</h1>
        </div>
        <p className={`status-pill status-pill--${viewState.status}`}>{viewState.status.replace('-', ' ')}</p>
      </header>

      <section className="camera-stage panel">
        <div className="camera-stage__viewport">
          <video ref={videoRef} className="camera-stage__video" muted playsInline />
          <canvas ref={overlayRef} className="camera-stage__overlay" />
        </div>
        <div className="camera-stage__meta">
          <p className="camera-stage__guidance">{viewState.guidance}</p>
          {viewState.errorMessage ? <p className="camera-stage__error">{viewState.errorMessage}</p> : null}
        </div>
      </section>

      <div className="stats-grid">
        <StatCard label="Current set" value={currentSet?.reps ?? 0} accent="lime" />
        <StatCard
          label="Phase"
          value={PHASE_LABELS[viewState.phase]}
          helper={setActive ? 'Counting live' : 'Preview only'}
        />
        <StatCard
          label="Confidence"
          value={`${Math.round(viewState.confidence * 100)}%`}
          helper={viewState.confidenceLabel}
        />
        <StatCard
          label="Elbow angle"
          value={viewState.smoothedAngle ? `${Math.round(viewState.smoothedAngle)} deg` : '--'}
          helper={viewState.selectedSide ? 'both arms tracked' : 'No pose locked'}
        />
      </div>

      {viewState.calibrationActive || viewState.calibrationSnapshot ? (
        <section className="panel calibration-panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Calibration</p>
              <h2>Top-position baseline</h2>
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
              ? 'Calibration is saved for this session.'
              : 'Hold the top push-up position until the bar fills.'}
          </p>
        </section>
      ) : null}

      <section className="panel">
        <div className="button-grid">
          <button className="primary-button" type="button" onClick={onStartCamera}>
            Start camera
          </button>
          <button className="secondary-button" type="button" onClick={onStopCamera}>
            Stop camera
          </button>
          <button className="secondary-button" type="button" onClick={onCalibrate}>
            Calibrate
          </button>
          <button className="secondary-button" type="button" onClick={onFlipCamera}>
            {currentFacingMode === 'environment' ? 'Use front camera' : 'Use rear camera'}
          </button>
        </div>

        <div className="button-grid">
          {setActive ? (
            <button className="accent-button" type="button" onClick={onEndSet}>
              End set
            </button>
          ) : (
            <button className="accent-button" type="button" onClick={onStartSet}>
              Start set
            </button>
          )}
        </div>

        <div className="button-grid button-grid--compact">
          <button className="manual-button" type="button" onClick={() => onAdjustSet(1)}>
            +1
          </button>
          <button className="manual-button" type="button" onClick={() => onAdjustSet(-1)}>
            -1
          </button>
          <button className="secondary-button" type="button" onClick={onResetSet}>
            Reset current set
          </button>
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">Placement</p>
        <h2>Best camera setup</h2>
        <ul className="instruction-list">
          <li>Place the phone directly in front of you, low to the floor or on a short stand.</li>
          <li>Face the camera so both shoulders, elbows, wrists, and hips stay visible.</li>
          <li>Keep strong lighting on your upper body so both elbows and wrists are clear.</li>
          <li>Only one person should be in frame while counting is active.</li>
          <li>Tap the flip button to swap between the front and rear cameras.</li>
        </ul>
      </section>
    </section>
  );
}
