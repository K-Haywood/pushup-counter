import { useEffect, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { CameraScreen } from './components/CameraScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { usePersistentAppState } from './hooks/usePersistentAppState';
import { usePushupPoseSession } from './hooks/usePushupPoseSession';
import type { AppTab } from './types/app';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('camera');
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [savedSetMessage, setSavedSetMessage] = useState<string | null>(null);
  const buildLabel = new Date(__APP_BUILD__).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
  const {
    state,
    today,
    currentSet,
    summary,
    last7Days,
    last30Days,
    progress,
    storageStatus,
    lastSavedAt,
    startSet,
    endSet,
    addAutoRep,
    adjustCurrentSet,
    updateSettings
  } = usePersistentAppState();

  const poseSession = usePushupPoseSession({
    settings: state.settings,
    setActive: Boolean(currentSet),
    onRepCounted: addAutoRep
  });

  const setsDoneToday = today.sets.filter((set) => set.reps > 0 || Boolean(set.endedAt)).length;

  useEffect(() => {
    const handleUpdateReady = (event: Event) => {
      const customEvent = event as CustomEvent<{ registration: ServiceWorkerRegistration }>;
      if (customEvent.detail?.registration) {
        setUpdateRegistration(customEvent.detail.registration);
        setIsApplyingUpdate(false);
      }
    };

    window.addEventListener('pushup-counter:new-version-available', handleUpdateReady as EventListener);

    return () => {
      window.removeEventListener('pushup-counter:new-version-available', handleUpdateReady as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!savedSetMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSavedSetMessage(null);
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [savedSetMessage]);

  function applyUpdate() {
    if (updateRegistration?.waiting) {
      setIsApplyingUpdate(true);
      updateRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }

    window.location.reload();
  }

  return (
    <div className="app-shell">
      {updateRegistration ? (
        <section className="update-banner" role="status" aria-live="polite">
          <div>
            <p className="eyebrow">Update available</p>
            <strong className="update-banner__title">A newer version is ready to load.</strong>
            <p className="update-banner__copy">Latest build: {buildLabel}</p>
          </div>
          <div className="update-banner__actions">
            <button className="secondary-button" type="button" onClick={() => setUpdateRegistration(null)}>
              Later
            </button>
            <button className="primary-button" type="button" onClick={applyUpdate} disabled={isApplyingUpdate}>
              {isApplyingUpdate ? 'Updating...' : 'Update now'}
            </button>
          </div>
        </section>
      ) : null}

      <main className="app-shell__main">
        {activeTab === 'camera' ? (
          <CameraScreen
            currentSet={currentSet}
            setActive={Boolean(currentSet)}
            currentFacingMode={state.settings.cameraFacingMode}
            todayTotal={today.totalReps}
            dailyGoal={today.dailyGoal}
            setsDoneToday={setsDoneToday}
            repsRemaining={summary.remaining}
            streak={summary.streak}
            viewState={poseSession.viewState}
            videoRef={poseSession.videoRef}
            overlayRef={poseSession.overlayRef}
            onToggleCamera={() => {
              if (poseSession.viewState.isCameraRunning) {
                void poseSession.stopCamera();
              } else {
                void poseSession.startCamera();
              }
            }}
            onStartWorkout={async () => {
              if (!poseSession.viewState.isCameraRunning) {
                await poseSession.startCamera();
              }

              if (!poseSession.viewState.calibrationSnapshot) {
                poseSession.startCalibration();
              }

              startSet();
            }}
            onEndSet={() => {
              const reps = currentSet?.reps ?? 0;
              endSet();
              setSavedSetMessage(reps > 0 ? `Set saved: ${reps} reps` : 'Set saved');
            }}
            onFlipCamera={() =>
              updateSettings({
                preferredCameraId: null,
                cameraFacingMode:
                  state.settings.cameraFacingMode === 'environment' ? 'user' : 'environment'
              })
            }
            onAdjustSet={adjustCurrentSet}
            savedSetMessage={savedSetMessage}
          />
        ) : null}

        {activeTab === 'history' ? (
          <HistoryScreen
            last7Days={last7Days}
            last30Days={last30Days}
            progress={progress}
            streakSnapshot={state.streakSnapshot}
            storageStatus={storageStatus}
            lastSavedAt={lastSavedAt}
          />
        ) : null}

        {activeTab === 'settings' ? (
          <SettingsScreen
            settings={state.settings}
            cameras={poseSession.cameraDevices}
            buildLabel={buildLabel}
            onUpdateSettings={updateSettings}
          />
        ) : null}
      </main>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}
