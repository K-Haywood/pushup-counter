import type { AppSettings, CameraDeviceOption } from '../types/app';

interface SettingsScreenProps {
  settings: AppSettings;
  cameras: CameraDeviceOption[];
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
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
  onUpdateSettings
}: SettingsScreenProps) {
  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Tuning and preferences</h1>
        </div>
      </header>

      <section className="panel form-panel">
        <label className="field">
          <span>Default daily goal</span>
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
          <small>The flip button on the camera screen uses this front or rear preference.</small>
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
          <small>Camera labels appear after permission. A specific camera overrides front or rear preference.</small>
        </label>
      </section>

      <section className="panel form-panel">
        <p className="eyebrow">Rep sensitivity</p>
        <h2>Push-up thresholds</h2>

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
      </section>
    </section>
  );
}
