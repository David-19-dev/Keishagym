# Contributing to KeishaGym

Thanks for taking a look. KeishaGym is intentionally small and dependency-light, and the goal
is that any part of it can be read in one sitting.

## The layout

```
frontend/              the app — React 19, Zustand, no framework beyond that
  src/lib/             the logic worth testing: progression, history, effort, 1RM, muscles, coach
  src/views/           one file per screen
  android/ ios/        Capacitor projects, committed
supabase/migrations/   the database and its row-level security
supabase/functions/    the AI Coach Edge Function
scripts/               generators (exercise dataset, Coach assets, brand icons)
web/                   Dockerfile + nginx.conf that build and serve the app
```

## Running it

```sh
npm run dev                  # the app, on http://localhost:5173
npm test                     # the whole suite
docker compose up -d --build # app + exercise photos on :8080
```

Without a Supabase configuration the app runs device-only, which is enough for most work. To
test accounts and sync, point `frontend/.env.local` at a Supabase project (see
[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)).

## What tends to get merged

- **A fix with a test that fails without it.** The logic in `src/lib/` is covered; keep it that
  way.
- **Something that makes a screen simpler**, not something that adds a setting.
- **A translation.** `frontend/scripts/check-locales.mjs` enforces that every locale carries the
  same keys, and CI runs it.

New dependencies are a hard sell: the app has five runtime ones, and each is load-bearing.

## Generated files

Some files are generated and committed; edit the source, then run the generator:

| File | Generator |
|---|---|
| `frontend/src/lib/exercises-data.js` | `node scripts/build-exercises.mjs` |
| `supabase/functions/coach/{library.json,prompts.js}` | `node scripts/build-coach-assets.mjs` |
| app icons and splash screens | `node frontend/scripts/brand-icons.mjs` |

CI fails if the Coach assets are stale.

## Style

Match the file you are in. Comments explain *why* something is the way it is — the code already
says what it does. Commit messages: one line saying what changed, then the reasoning if it isn't
obvious.
