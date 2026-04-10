# Pushup Counter

Pushup Counter is a React + Vite + TypeScript PWA that counts push-up reps on-device with the browser camera and MediaPipe Pose Landmarker for Web. It runs client-side, stores history locally by default, and can be deployed to GitHub Pages as a static site.

It also has an optional Supabase account/sync layer if you later want user sign-in and per-user cloud backups.

## Features

- On-device push-up counting with the browser camera
- Front-facing and side-facing pose analysis
- Finite-state machine for `top -> descending -> bottom -> ascending -> top`
- Manual `+1` and `-1` correction buttons
- Daily totals, sets, streaks, and local history
- Adjustable goal, smoothing, confidence thresholds, and angle thresholds
- PWA manifest, icons, and offline shell via service worker
- Static deployment workflow for GitHub Pages

## File tree

```text
pushup-counter/
├─ .github/
│  └─ workflows/
│     └─ deploy.yml
├─ public/
│  ├─ apple-touch-icon.png
│  ├─ manifest.webmanifest
│  ├─ sw.js
│  ├─ icons/
│  │  ├─ pwa-192.png
│  │  └─ pwa-512.png
│  ├─ models/
│  │  └─ pose_landmarker_lite.task
│  └─ vendor/
│     └─ mediapipe/
│        └─ wasm/
│           ├─ vision_wasm_internal.js
│           ├─ vision_wasm_internal.wasm
│           ├─ vision_wasm_module_internal.js
│           ├─ vision_wasm_module_internal.wasm
│           ├─ vision_wasm_nosimd_internal.js
│           └─ vision_wasm_nosimd_internal.wasm
├─ src/
│  ├─ components/
│  │  ├─ BottomNav.tsx
│  │  ├─ CameraScreen.tsx
│  │  ├─ HistoryScreen.tsx
│  │  ├─ HomeScreen.tsx
│  │  ├─ SettingsScreen.tsx
│  │  └─ StatCard.tsx
│  ├─ hooks/
│  │  ├─ useAccountSync.ts
│  │  ├─ usePersistentAppState.ts
│  │  └─ usePushupPoseSession.ts
│  ├─ lib/
│  │  ├─ cloudSync.ts
│  │  ├─ dates.ts
│  │  ├─ defaults.ts
│  │  ├─ drawPoseOverlay.ts
│  │  ├─ feedback.ts
│  │  ├─ formInsights.ts
│  │  ├─ pushupCounter.ts
│  │  ├─ storage.ts
│  │  └─ supabase.ts
│  ├─ types/
│  │  └─ app.ts
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ styles.css
│  └─ vite-env.d.ts
├─ supabase/
│  └─ schema.sql
├─ index.html
├─ package.json
├─ tsconfig.app.json
├─ tsconfig.json
├─ tsconfig.node.json
├─ vite.config.ts
└─ README.md
```

## Local setup

### Requirements

- Node.js 22 or newer
- npm 10 or newer

### Install and run

```powershell
cd "C:\Users\61481\Documents\New project\pushup-counter"
npm install
npm run dev
```

### Build and lint

```powershell
cd "C:\Users\61481\Documents\New project\pushup-counter"
npm run lint
npm run build
```

The production build is written to `dist/`.

## GitHub Pages deployment

1. Create a GitHub repository for this project.
2. Push the project to the `main` branch.
3. In GitHub, open `Settings > Pages`.
4. Set the source to `GitHub Actions`.
5. Push again whenever you want a fresh deploy.

### Exact commands to deploy

```powershell
cd "C:\Users\61481\Documents\New project\pushup-counter"
git init
git add .
git commit -m "Initial Pushup Counter PWA"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

After that, GitHub Actions will build `dist/` and publish it to GitHub Pages automatically.

## Testing on iPhone

### Fastest path

Deploy to GitHub Pages first, then open the Pages URL in iPhone Safari. Camera access on iPhone works best over HTTPS, and GitHub Pages gives you that automatically.

### Add to home screen

1. Open the deployed app in Safari.
2. Tap the Share button.
3. Tap `Add to Home Screen`.
4. Launch it from the home screen like an app.

### Camera tips for counting

- Place the phone 2 to 3 meters away.
- Use a side-on profile if possible.
- Keep shoulders, elbows, wrists, hips, knees, and ankles visible.
- Use bright, even lighting.
- Make sure only one person is in frame.

## Threshold tuning

If counting is inaccurate, open the in-app `Settings` screen and tune:

- `Top threshold`: raises or lowers how straight the elbow must be before the top position is accepted.
- `Bottom threshold`: raises or lowers how deep the elbow must bend to register the bottom position.
- `Smoothing frames`: increases stability, but too much makes counting feel delayed.
- `Minimum landmark visibility`: raises the confidence requirement.
- `Front-view alignment tolerance`: tightens or loosens the body alignment check for front-facing use.
- `Front-view shoulder width`: adjusts how much shoulder width is needed for a front-facing rep.
- `Arm symmetry tolerance`: changes how different the two arms can be before the rep is rejected.
- `Cooldown`: increases protection against double-counts from noisy frames.

### Single best place to tweak rep sensitivity later

[`src/lib/pushupCounter.ts`](./src/lib/pushupCounter.ts)

That file contains:

- elbow-angle analysis
- side selection
- confidence gating
- front-view and side-view checks
- smoothing
- hysteresis
- cooldown
- the finite-state machine

## Optional account sync

If you want sign-in and per-user cloud backups later, create a Supabase project and point the app at it with:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then run the SQL in [`supabase/schema.sql`](./supabase/schema.sql) to create the per-user state table and row-level security policies.

The app uses Supabase email sign-in and stores each user's entire app state in one protected row.

## Finite state machine

The rep counter uses a four-phase state machine:

1. `top`: waits until the smoothed elbow angle leaves the top threshold while moving down.
2. `descending`: confirms the user is actually lowering, not just jittering near the top.
3. `bottom`: waits until the elbow is below the bottom threshold and briefly stable.
4. `ascending`: confirms the elbow is extending back toward the top.

A rep is counted only when the full cycle completes:

`top -> descending -> bottom -> ascending -> top`

Extra protection against false counts comes from:

- moving-average smoothing across recent frames
- hysteresis around the angle thresholds
- a cooldown timer after each counted rep
- minimum visibility and framing checks
- side-on and body-straightness checks
- optional session calibration for distance and framing

## MediaPipe running mode note

The current MediaPipe web task package exposes `VIDEO` mode for browser inference. In this app, the camera feed is processed continuously with `detectForVideo(...)`, which is the practical live-stream equivalent for the web.

## Known limitations

- Side-on framing is strongly preferred. Frontal angles are less reliable for elbow-angle counting, although the app now tries to support front-facing use better.
- Very low light, baggy sleeves, or cluttered backgrounds can reduce landmark confidence.
- If the whole body is not visible, counting pauses on purpose.
- iPhone Safari may limit features like vibration, so rep haptics can vary by device.
- This is tuned for push-ups only, not general exercise detection.
- Because everything is local-first, uninstalling the PWA or clearing browser storage removes the saved history unless you enable cloud sync.
