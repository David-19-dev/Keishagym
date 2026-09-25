# Security policy

KeishaGym keeps people's training — and, if they log it, their body weight. This file says how
to report something privately, and what the app protects you from and what it doesn't.

## Supported versions

Only the **latest** revision of `main`. There is no LTS or maintenance branch, and older tags
are never patched.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting — repo **Security** tab → **Report a
vulnerability**:

<https://github.com/David-19-dev/Keishagym/security/advisories/new>

> Private reporting has to be switched on in the repository settings for that link to work
> (Settings → Advanced Security → Private vulnerability reporting). If it 404s, open a normal
> issue saying only *"I need a private channel for a security report"* — no details, no
> reproduction — and it will be enabled.

Please don't put a working exploit in a public issue if it can be used against a live instance.
Useful in a report: the commit, whether the instance is hosted or self-hosted Supabase, steps to
reproduce, and what an attacker gets out of it.

## Architecture, in one paragraph

The app is static. It talks to **Supabase** directly with the public anon key, which grants
nothing on its own: every table is protected by row-level security, so the database — not
application code — is what decides that a row belongs to one account. The only server-side code
is the Coach Edge Function, which holds one secret (the provider API key) and reads exactly two
tables.

## In scope

- **Row-level security.** Reading or writing another account's `user_state` or `coach_profile`,
  by any route: a crafted PostgREST query, a forged or replayed token, a policy that can be made
  to pass for the wrong `auth.uid()`.
- **Account deletion.** `delete_my_account()` is `security definer`: making it delete somebody
  else's account, or leave data behind after deleting one.
- **The Coach function.** Getting it to act for another account, to leak its API key, to spend
  without counting against the cap, or to write a proposal into someone else's row.
- **The validator.** Getting something the model produced past
  `supabase/functions/coach/validate.js` and into a plan — an exercise id that does not exist, a
  change type outside the closed list, a change that touches anything but routines and the week.
  Prompt injection that makes the model *say* something is expected; the validator is the
  boundary, and it is what should hold.
- **The client.** Stored XSS through any free-text field (exercise names, notes, intake answers),
  or a state import that escapes JSON parsing.

## Out of scope

- Anything that needs the `service_role` key or physical access to the Supabase host. That key
  bypasses row-level security by design — it is the instance owner's credential, and it must
  never reach a browser or a repository.
- **Instances running default Supabase secrets.** A self-hosted Supabase whose `JWT_SECRET` is
  the one from the documentation is open to anyone who reads that documentation. Rotate it
  before exposing an instance; this is setup, not a vulnerability in the app.
- Instances served over plain `http://`. Unsupported: the service worker, the installable app
  and the wake lock all require a secure origin.
- Someone with your unlocked device, or with your password. There is no second factor yet.
- Rate limits and abuse controls on authentication: those are Supabase's, configured in your
  project.

## What the app does, concretely

- **Accounts are Supabase Auth's.** The app never stores a password, and sees only the session
  token the SDK holds.
- **Data is isolated by policy, not by code.** `user_state` grants `authenticated` the four
  operations, each gated on `(select auth.uid()) = user_id`; `anon` is revoked entirely.
  `coach_profile` grants **read only**, and nothing else can write it but the function.
- **Sign-out everywhere works.** It revokes the account's refresh tokens through Supabase, so
  every device loses access at its next refresh.
- **Signing out refuses to lose data.** If changes have not reached the server, the app keeps
  you signed in and says so, rather than wiping the only copy on the way out.
- **Account deletion is real.** The account row goes, and `user_state` and `coach_profile` go
  with it by cascade.
- **The Coach sends an allowlist.** Every field is copied by name in `payload.js`; a field added
  to the state document next year cannot ride along. Your e-mail and account id never leave — a
  stable pseudonym stands in. See [docs/AI_COACH.md](docs/AI_COACH.md).
- **No telemetry.** The app reports nothing about you to anyone, including us.

## Known limitations, stated plainly

- **The synced state is one document.** Two devices editing offline resolve as last-write-wins:
  the newer copy wins whole. Splitting it into per-record tables is planned.
- **Nothing is end-to-end encrypted.** Whoever administers the Supabase instance can read the
  training data in it. On a self-hosted instance, that is you.
- **No second factor**, and no device list to inspect or revoke individually.
