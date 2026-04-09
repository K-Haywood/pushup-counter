import { useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { CameraScreen } from './components/CameraScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { HomeScreen } from './components/HomeScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { usePersistentAppState } from './hooks/usePersistentAppState';
import { usePushupPoseSession } from './hooks/usePushupPoseSession';
import type { AppTab } from './types/app';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const {
    state,
    today,
    currentSet,
    summary,
    last7Days,
    last30Days,
    setTodayGoal,
    startSet,
    endSet,
    addAutoRep,
    adjustCurrentSet,
    resetCurrentSet,
    updateSettings
  } = usePersistentAppState();

  const poseSession = usePushupPoseSession({
    settings: state.settings,
    setActive: Boolean(currentSet),
    onRepCounted: addAutoRep
  });

  return (
    <div className="app-shell">
      <main className="app-shell__main">
        {activeTab === 'home' ? (
          <HomeScreen
            summary={summary}
            today={today}
            currentSet={currentSet}
            onSaveGoal={setTodayGoal}
          />
        ) : null}

        {activeTab === 'camera' ? (
          <CameraScreen
            currentSet={currentSet}
            setActive={Boolean(currentSet)}
            viewState={poseSession.viewState}
            videoRef={poseSession.videoRef}
            overlayRef={poseSession.overlayRef}
            onStartCamera={() => void poseSession.startCamera()}
            onStopCamera={() => void poseSession.stopCamera()}
            onStartSet={startSet}
            onEndSet={endSet}
            onCalibrate={poseSession.startCalibration}
            onAdjustSet={adjustCurrentSet}
            onResetSet={resetCurrentSet}
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
