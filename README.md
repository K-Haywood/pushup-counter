# Pushup Counter

Pushup Counter is a local-first React + Vite + TypeScript PWA that counts push-up reps on-device with the browser camera and MediaPipe Pose Landmarker for Web.

It now has an optional Supabase-backed account/sync layer so you can keep the app private today and still grow it into a multi-user app later.

## Default setup

- No backend required
- No cloud inference
- No analytics
- All rep history, sessions, and settings stay on the device in browser storage unless you turn on account sync
- Public GitHub Pages deployment has been removed from this repository

## Optional account sync

If you want sign-in and per-user cloud backups later, add a Supabase project and point the app at it with:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then run the SQL in [`supabase/schema.sql`](./supabase/schema.sql) to create the per-user state table and row-level security policies.

The app uses Supabase email sign-in and stores each user's entire app state in one protected row.

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

## Turn on accounts later

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the SQL editor.
3. Create a local `.env` or `.env.local` file with your Supabase URL and anon key.
4. Restart the dev server.
5. Open `Settings` in the app and use the account card to request a sign-in link.

## Local storage

By default, all history is kept locally in `localStorage` with `IndexedDB` as a backup cache. Clearing Safari site data or uninstalling the PWA will remove the saved history unless you have enabled Supabase sync.

## Tuning

If counting feels too strict or too loose, the best place to adjust detection is [`src/lib/pushupCounter.ts`](./src/lib/pushupCounter.ts).
