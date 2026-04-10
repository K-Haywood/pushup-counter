# Pushup Counter

Pushup Counter is a local-first React + Vite + TypeScript PWA that counts push-up reps on-device with the browser camera and MediaPipe Pose Landmarker for Web.

## Safety-first setup

- No backend
- No cloud inference
- No login
- No analytics
- No external database
- All rep history, sessions, and settings stay on the device in browser storage
- Public GitHub Pages deployment has been removed from this repository

## Run locally

```powershell
cd "C:\Users\61481\Documents\New project\pushup-counter"
npm install
npm run dev
```

## Build and lint

```powershell
cd "C:\Users\61481\Documents\New project\pushup-counter"
npm run lint
npm run build
```

## iPhone use

- Open the app in Safari over HTTPS if you want camera access.
- Tap `Start camera`.
- Place the phone 2 to 3 meters away.
- Use a side-on view if possible.
- Add the site to the home screen only if you are comfortable storing local history on that device.

## Local storage

All history is kept locally in `localStorage` with `IndexedDB` as a backup cache. Clearing Safari site data or uninstalling the PWA will remove the saved history.

## Tuning

If counting feels too strict or too loose, the best place to adjust detection is [`src/lib/pushupCounter.ts`](./src/lib/pushupCounter.ts).
