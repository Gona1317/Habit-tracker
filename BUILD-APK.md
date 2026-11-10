# HabitFlow 2.0 — get the APK

This is a Capacitor project: the app lives in `www/`, wrapped as a native Android app in `android/`.

## Option A — no installs, ~5 min (GitHub builds it for you)
1. Create a new GitHub repo, upload **everything in this folder** (keep `.github/`).
2. Open the repo's **Actions** tab → *Build Android APK* → *Run workflow* (it also runs on every push).
3. When it's green, open the run → **Artifacts → HabitFlow-APK** → download, unzip, send `app-debug.apk` to your phone and install (allow "install unknown apps").

## Option B — Android Studio
1. Install Node 20+ and Android Studio.
2. In this folder: `npm install` then `npx cap sync android` then `npx cap open android`.
3. Build ▸ Build APK(s), or press Run with a phone/emulator connected.

## Editing the app later
Change files in `www/` (app.js, styles.css, index.html) → `npx cap sync android` → rebuild.
The same `www/` folder also works as a website/PWA (Netlify, GitHub Pages).

## Cloud sync
`www/supabase-config.js` already holds your Supabase URL + publishable key. Database setup is in `docs/`.
Same account + same table as the old version, so existing data loads as-is.
