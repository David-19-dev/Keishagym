# Hosting KeishaGym

KeishaGym is a static web app plus a Supabase project. Nothing else runs server-side: the app
keeps your training on the device and syncs it to Supabase, which is also where accounts and
(optionally) the AI Coach live.

You need two things:

1. **somewhere to serve the app** — the included `docker compose`, or any static host;
2. **a Supabase project** — [supabase.com](https://supabase.com) or self-hosted.

Skip step 2 and the app still works: it runs device-only, with no accounts and no sync.

## 1. The database

Apply the migrations in `supabase/migrations/`, in filename order, from Studio's SQL editor or
with the Supabase CLI:

```bash
supabase db push --db-url "postgresql://postgres:<password>@<host>:5432/postgres"
```

They create:

- `user_state` — one synced state document per account, readable and writable **only by its
  owner** (row-level security), capped at 5 MB;
- `delete_my_account()` — account deletion from inside the app, as the App Store requires;
- `coach_profile` — the Coach's per-profile state, written only by its Edge Function.

## 2. Authentication

In Supabase, under Authentication:

- **Email** is the provider the app uses today.
- Configure **SMTP**, or new accounts cannot confirm their address. Any transactional provider
  does (Brevo, Resend, SES…). On a test instance you can set `ENABLE_EMAIL_AUTOCONFIRM=true`
  instead — never in production.
- Set the **Site URL** to wherever you serve the app.

## 3. The app

```bash
cp .env.example .env     # WEB_PORT, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
docker compose up -d
```

- The first start downloads the exercise photos (~80 MB) once, into `media/ex`.
- The app is served on `http://localhost:8080` by default.
- The Supabase URL and anon key are **compiled into the app**: both are public by design, and
  row-level security is what protects the data. The `service_role` key never belongs in a build.

To serve it from any static host instead, build it yourself and upload `frontend/dist`:

```bash
cd frontend
VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npm run build
```

The exercise photos then need a home too: either serve them next to the app under `ex/`
(`scripts/fetch-media.sh` downloads them), or point `VITE_EX_BASE` at a CDN.

## 4. HTTPS

Put the web container behind a reverse proxy that terminates TLS — Caddy, Traefik, nginx, or a
tunnel. It matters for more than privacy: service workers, installable PWAs and the wake lock
that keeps the screen on during a workout all require a secure origin.

## 5. The AI Coach (optional)

Off until you deploy it, and per-profile consent is required after that. Key, caps and
deployment: **[COACH_DEPLOY.md](COACH_DEPLOY.md)**.

## 6. Backups

Everything lives in your Supabase project. Back up the database — a scheduled `pg_dump` on
self-hosted, or the platform's backups on the hosted plans — and **test restoring it**.

Every profile can also export its own data as JSON from Settings, which is a decent second line
of defence and travels between instances.

## Updating

```bash
git pull
docker compose up -d --build
```

Check `supabase/migrations/` for new files, and apply them the same way as step 1.
