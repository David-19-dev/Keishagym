# Deploying the AI Coach

The Coach runs as a **Supabase Edge Function** (`supabase/functions/coach`), called by the app
with the signed-in person's session. It talks to Anthropic's Claude API with **a key that stays
on your server** — the app never sees it.

With no key, or with `COACH_ENABLED=0`, the function reports itself disabled and **the app hides
the whole feature**: it is exactly the app it was before the Coach existed.

## 1. The database

Apply `supabase/migrations/20260925000000_coach.sql` (Studio → SQL Editor). It creates
`coach_profile`: one row per profile, readable by its owner only, written by the function only.

## 2. The API key

Create one at [console.anthropic.com](https://console.anthropic.com) and **set a spending limit
on the account**. A plan or a review costs a few cents; the limit is the only real protection
against a misconfiguration.

## 3. Install the function

Copy the directory into the self-hosted Supabase install:

```bash
scp -r supabase/functions/coach/ your-nas:/volume2/docker/supabase/docker/volumes/functions/
```

Add the variables to Supabase's `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
COACH_MODEL=claude-sonnet-5
COACH_DAILY_CAP=5
COACH_HANDLE_SECRET=<random string, e.g. openssl rand -base64 32>
```

Pass them to the `functions` service in `docker-compose.yml`:

```yaml
  functions:
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      COACH_MODEL: ${COACH_MODEL}
      COACH_DAILY_CAP: ${COACH_DAILY_CAP}
      COACH_HANDLE_SECRET: ${COACH_HANDLE_SECRET}
```

And restart it:

```bash
docker compose up -d functions
```

On Supabase's hosted platform, `supabase functions deploy coach` and
`supabase secrets set ANTHROPIC_API_KEY=…` do the same job.

## 4. Check it

Signed in, the Coach card appears on the home screen. The app asks the function for its state
once per session; if the function is not deployed, or not configured, nothing shows up.

Server side, the logs say the rest:

```bash
docker compose logs -f functions
```

## Settings

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Without it the Coach is disabled |
| `COACH_MODEL` | `claude-sonnet-5` | The model used |
| `COACH_DAILY_CAP` | `5` | Jobs per profile per day (0 = unlimited) |
| `COACH_ENABLED` | `1` | `0` turns the feature off without removing the key |
| `COACH_HANDLE_SECRET` | the service key | Derives the pseudonym sent to the model |

## What reaches Anthropic, and what does not

The function builds what it sends **field by field** (`payload.js`): the plan, the sessions in
the review window, body weight, the intake answers, unit, language and effort scale. The consent
screen lists those categories, reading them from that same module, so the screen cannot drift
from the payload.

**Never sent:** your e-mail address, your account id (a stable pseudonym stands in), your
credentials, and any other profile's anything.

Nothing the model answers reaches a plan without passing `validate.js`: every exercise it names
must exist in the library, and every change must match a closed list of types. That validator —
not the prompt — is the security boundary of the feature: a hostile note in someone's free text
can talk a model into saying anything, but it cannot invent a change type.

## Regenerating the function's files

`library.json` (the exercise catalogue) and `prompts.js` (the instructions, authored as Markdown
in `prompts/`) are generated and committed:

```bash
node scripts/build-coach-assets.mjs
```

Deploying is then a copy of the directory, nothing more. CI fails if they are stale.
