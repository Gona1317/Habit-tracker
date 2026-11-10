# HabitFlow — Cloud Login & Sync Setup

HabitFlow now supports email/password login and cloud sync using Supabase. After setup, the same account can be opened on a phone, laptop, or another browser and the same habits, tasks, checks, tracker and history will load.

## 1. Create a Supabase project
1. Create a free Supabase project at https://supabase.com/
2. Open the project dashboard.
3. Go to **SQL Editor** and run **supabase-setup.sql** from this folder.
4. Go to **Project Settings -> API**. Copy the **Project URL** and the browser-safe **Publishable key** (older projects may label this key `anon`).
5. Open **supabase-config.js** and replace the two placeholders:

```js
window.HABITFLOW_CONFIG = {
  url: 'https://YOUR-PROJECT.supabase.co',
  key: 'YOUR_PUBLISHABLE_OR_ANON_KEY'
};
```

**Do not put a `service_role` or secret key in the website.**

## 2. Email confirmation
Supabase may require a user to confirm their email before the first login. That is normal. The app will tell the user to check email after registration.

## 3. Deploy
Upload the contents of the `HabitFlow` folder to GitHub Pages, Netlify, Cloudflare Pages, or another static host. Keep these files together:

- `index.html`
- `supabase-config.js`
- `supabase-setup.sql` (not required by the website, but useful for setup)
- `SUPABASE_SETUP.md`

## 4. How syncing works
- Authentication: Supabase Auth (email + password).
- Data: one JSON document per user in `public.habitflow_data`.
- Security: Postgres Row Level Security means a signed-in user can read/write only their own row.
- The browser may cache a copy in localStorage for speed, but the cloud row is the source of truth after login.
- Checking a habit/task, adding/deleting an item, reset, etc. is automatically uploaded after a short debounce.
- The **Sync** button reloads the current account from the cloud.

## Important
This version is designed for a static frontend. It does not require your own server. Supabase provides the authentication and hosted Postgres database.

For simultaneous edits from two devices, the last successful save wins. For normal use this is fine; a future version can use per-item rows and conflict resolution if needed.
