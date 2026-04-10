import { useEffect, useState } from 'react';
import type { AccountSessionState, AppSettings, CameraDeviceOption } from '../types/app';

interface SettingsScreenProps {
  settings: AppSettings;
  cameras: CameraDeviceOption[];
  buildLabel: string;
  account: AccountSessionState;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onSendMagicLink: (email: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onSyncNow: () => Promise<void>;
}

function SliderField({
  label,
  min,
  max,
  step,
  value,
  suffix = '',
  onChange
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  onChange: (nextValue: number) => void;
}) {
  return (
    <label className="field">
      <div className="field__row">
        <span>{label}</span>
        <strong>
          {value}
          {suffix}
        </strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function SettingsScreen({
  settings,
  cameras,
  buildLabel,
  account,
  onSendMagicLink,
  onSignOut,
  onSyncNow,
  onUpdateSettings
}: SettingsScreenProps) {
  const [email, setEmail] = useState(account.userEmail ?? '');
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (account.userEmail) {
      setEmail(account.userEmail);
    }
  }, [account.userEmail]);

  async function handleSendMagicLink() {
    setAuthError(null);
    setAuthNotice(null);

    try {
      await onSendMagicLink(email);
      setAuthNotice('Check your email for the sign-in link.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not send sign-in link.');
    }
  }

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Quick preferences</h1>
        </div>
      </header>

      <section className="panel form-panel">
        <p className="eyebrow">Account</p>

        {account.isConfigured ? (
          account.isSignedIn ? (
            <>
              <div className="account-summary">
                <strong>{account.userEmail ?? 'Signed in'}</strong>
                <span>{account.statusMessage}</span>
              </div>

              <div className="inline-actions">
                <button type="button" className="secondary-button" onClick={() => void onSyncNow()}>
                  Sync now
                </button>
                <button type="button" className="secondary-button" onClick={() => void onSignOut()}>
                  Sign out
                </button>
              </div>

              <p className="subtle-copy">
                Last synced {account.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleString() : 'just now'}.
              </p>
            </>
          ) : (
            <>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>

              <div className="inline-actions">
                <button type="button" className="primary-button" onClick={() => void handleSendMagicLink()}>
                  Send sign-in link
                </button>
              </div>

              <p className="subtle-copy">{account.statusMessage}</p>
            </>
          )
        ) : (
          <p className="subtle-copy">
            Cloud sync is not configured yet. The app still works locally, but you can add Supabase later to let
            multiple people sign in and keep their own progress.
          </p>
        )}

        {authNotice ? <p className="subtle-copy is-success">{authNotice}</p> : null}
        {authError ? <p className="subtle-copy is-error">{authError}</p> : null}
        {account.errorMessage ? <p className="subtle-copy is-error">{account.errorMessage}</p> : null}
      </section>

      <section className="panel form-panel">
        <p className="eyebrow">Essentials</p>

        <label className="field">
          <span>Daily goal</span>
          <input
            type="number"
            min={1}
            step={1}
            value={settings.defaultDailyGoal}
            onChange={(event) =>
              onUpdateSettings({ defaultDailyGoal: Math.max(1, Number(event.target.value) || 1) })
            }
          />
        </label>

        <label className="toggle-field">
          <span>Rep sound</span>
          <input
            type="checkbox"
            checked={settings.soundEnabled}
            onChange={(event) => onUpdateSettings({ soundEnabled: event.target.checked })}
          />
        </label>

        <label className="toggle-field">
          <span>Vibration</span>
          <input
            type="checkbox"
            checked={settings.vibrationEnabled}
            onChange={(event) => onUpdateSettings({ vibrationEnabled: event.target.checked })}
          />
        </label>

        <label className="field">
          <span>Default camera side</span>
          <select
            value={settings.cameraFacingMode}
            onChange={(event) =>
              onUpdateSettings({
                cameraFacingMode: event.target.value === 'user' ? 'user' : 'environment'
              })
            }
          >
            <option value="environment">Rear camera</option>
            <option value="user">Front camera</option>
          </select>
          <small>Used when you tap flip camera on the workout screen.</small>
        </label>

        <label className="field">
          <span>Preferred camera</span>
          <select
            value={settings.preferredCameraId ?? ''}
            onChange={(event) =>
              onUpdateSettings({ preferredCameraId: event.target.value || null })
            }
          >
            <option value="">Auto (use front or rear preference)</option>
            {cameras.map((camera) => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label}
              </option>
            ))}
          </select>
          <small>Only needed if your phone exposes multiple cameras after permission is granted.</small>
        </label>
      </section>

      <section className="panel form-panel details-panel">
        <details>
          <summary className="eyebrow">
            Advanced tuning
          </summary>
          <p className="details-panel__copy">
            Leave these alone unless rep counting feels too strict or too loose.
          </p>

          <div className="details-panel__body">
            <SliderField
              label="Smoothing frames"
              min={2}
              max={10}
              step={1}
              value={settings.smoothingFrames}
              onChange={(nextValue) => onUpdateSettings({ smoothingFrames: nextValue })}
            />

            <SliderField
              label="Top threshold"
              min={145}
              max={175}
              step={1}
              value={settings.topThreshold}
              suffix=" deg"
              onChange={(nextValue) => onUpdateSettings({ topThreshold: nextValue })}
            />

            <SliderField
              label="Bottom threshold"
              min={75}
              max={115}
              step={1}
              value={settings.bottomThreshold}
              suffix=" deg"
              onChange={(nextValue) => onUpdateSettings({ bottomThreshold: nextValue })}
            />

            <SliderField
              label="Minimum landmark visibility"
              min={0.4}
              max={0.9}
              step={0.01}
              value={Number(settings.minLandmarkVisibility.toFixed(2))}
              onChange={(nextValue) => onUpdateSettings({ minLandmarkVisibility: nextValue })}
            />

            <SliderField
              label="Front-view alignment tolerance"
              min={0.05}
              max={0.2}
              step={0.01}
              value={Number(settings.bodyAlignmentTolerance.toFixed(2))}
              onChange={(nextValue) => onUpdateSettings({ bodyAlignmentTolerance: nextValue })}
            />

            <SliderField
              label="Front-view shoulder width"
              min={0.35}
              max={0.85}
              step={0.01}
              value={Number(settings.frontViewMinRatio.toFixed(2))}
              onChange={(nextValue) => onUpdateSettings({ frontViewMinRatio: nextValue })}
            />

            <SliderField
              label="Arm symmetry tolerance"
              min={0.05}
              max={0.3}
              step={0.01}
              value={Number(settings.armSymmetryTolerance.toFixed(2))}
              onChange={(nextValue) => onUpdateSettings({ armSymmetryTolerance: nextValue })}
            />

            <SliderField
              label="Cooldown"
              min={350}
              max={1200}
              step={25}
              value={settings.cooldownMs}
              suffix=" ms"
              onChange={(nextValue) => onUpdateSettings({ cooldownMs: nextValue })}
            />
          </div>
        </details>
      </section>

      <section className="panel panel--tight">
        <p className="eyebrow">App build</p>
        <p className="subtle-copy">Installed build: {buildLabel}</p>
        <p className="subtle-copy">All reps, sets, and form history stay local on this device.</p>
      </section>
    </section>
  );
}
