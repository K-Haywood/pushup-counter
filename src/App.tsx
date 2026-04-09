import { useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { CameraScreen } from './components/CameraScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { usePersistentAppState } from './hooks/usePersistentAppState';
import { usePushupPoseSession } from './hooks/usePushupPoseSession';
import type { AppTab } from './types/app';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('camera');
  const {
    state,
    today,
    currentSet,
    summary,
    last7Days,
    last30Days,
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

  return (
    <div className="app-shell">
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
            onStartSet={startSet}
            onEndSet={endSet}
            onCalibrate={poseSession.startCalibration}
            onFlipCamera={() =>
              updateSettings({
                preferredCameraId: null,
                cameraFacingMode:
                  state.settings.cameraFacingMode === 'environment' ? 'user' : 'environment'
              })
            }
            onAdjustSet={adjustCurrentSet}
          />
        ) : null}

        {activeTab === 'history' ? (
          <HistoryScreen
            last7Days={last7Days}
            last30Days={last30Days}
            streakSnapshot={state.streakSnapshot}
          />
        ) : null}

        {activeTab === 'settings' ? (
          <SettingsScreen
            settings={state.settings}
            cameras={poseSession.cameraDevices}
            onUpdateSettings={updateSettings}
          />
        ) : null}
      </main>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}
