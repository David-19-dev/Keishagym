# The AI Coach

An optional AI that **designs** your training plan and **revises it from what you actually
log** — running in your own Supabase project, under your own Anthropic account, off until you
deploy it and consent to it.

> The coach worth having is the one that reads what you actually did.

---

## Why it exists

Upstream openGym progresses a plan flawlessly and cannot write one. The engine adjusts weights
inside whatever structure you built, and the effort ratings you log — RIR, RPE — were, by the
app's own admission, read by nothing. Adherence, stalls and muscle gaps were all *displayed* and
never synthesised into a decision.

The Coach does the two jobs the engine deliberately doesn't: it designs plans, and it changes
them when your training says they should change.

## The boundary that makes it safe

The split is the whole design. Judgement and math live in different places, and the AI never
crosses into the math.

| The Coach — where judgement lives | The Engine — where math lives |
| --- | --- |
| Creates weekly routines | Computes tomorrow's bar weight |
| Sets progression policies | Strictly deterministic |
| Reads RPE / RIR | Applies linear / Greyskull progression |
| Interprets plain-text feedback | Tracks strict hit/miss |
| Adds and swaps exercises | Manages `exWeights` |

**The Coach configures the plan. The Engine calculates the load.** If the AI times out or the
provider dies, the engine carries on offline without skipping a beat.

## Principles

- **Your box, your data.** The provider runs locally; openGym ships no bundled API keys.
- **Opt in twice.** An admin enables the feature; each profile consents separately before any of
  its data is used.
- **Approval required.** Proposals are inert until you tap Apply, one change at a time.
- **Nothing is one-way.** Applying snapshots your plan first; one tap reverts it. Reverting never
  touches a logged workout — the log is what happened.
- **Auditable.** Every trigger, payload summary and decision lands in a per-profile Coach log
  that syncs and travels in your JSON backup.
- **Degrade gracefully.** With the Coach off, the app is byte-for-byte what it was before.

---

## The provider

The Coach calls the **Anthropic API** (Claude) over HTTPS from a Supabase Edge Function, with a
key held as a function secret. The app never sees the key, and no user is ever asked for
credentials.

Two settings bound what it can cost you: `COACH_DAILY_CAP` (jobs per profile per day, counted
when a job starts) and the spending limit on your Anthropic account. Set both before inviting
anyone.

Swapping provider means changing one function: everything downstream — payload building,
validation, the apply logic — is provider-agnostic.

---

## Using it

### If you run the instance

1. Apply the migration, deploy the function, set the key: **[docs/COACH_DEPLOY.md](COACH_DEPLOY.md)**.
2. Set `COACH_DAILY_CAP` and a spending limit on your Anthropic account *before* inviting
   people — every plan or review is billed to it.
3. `COACH_ENABLED=0` is the kill switch: the function reports as disabled and the app hides
   the feature everywhere, without removing the key.

### If you train on it

**Journey 1 — get a plan.** A six-screen intake (goal, experience, days, session length,
equipment, limitations, likes and dislikes) produces a complete weekly plan: routines, exercise
selection, sets × reps, supersets, the week schedule, and a progression policy per routine. Every
exercise carries a sentence on why it is there. Don't like it? Say so in plain language — *"swap
the squats for split squats, Mondays are short"* — and the plan comes back revised. Applying it
behaves exactly like importing a plan file.

**Journey 2 — the feedback loop.** On demand, weekly, or after every N sessions, the Coach reads
your recent evidence — sets hit and missed against target, effort trends, stalls and deloads the
engine fired, sessions you keep moving, session length against the time you said you had, body
weight against your goal, and muscle groups that got nothing — and returns a list of **discrete
changes**, each with a before → after and a rationale naming the evidence:

> *"Bench came in at RPE ≥ 9.5 for three sessions and stalled twice; swapping to dumbbell press
> for four weeks."*

Tick the ones you want and hit **Apply & Snapshot**. Advice with no plan change attached goes to a
notes section and applies nothing. A review that finds no reason to change anything says so and
sends no notification. Suggestions you turn down are remembered, so the next review doesn't
re-propose them without new evidence.

---

## What actually leaves your server

`supabase/functions/coach/payload.js` is built as an allowlist: every field is copied in **by name**, nothing is
spread and nothing is passed through, so a field added to the state blob next year cannot ride
along by accident. The five categories it can send — the same list the consent screen renders
from, so the screen cannot drift from the payload — are:

| Category | What it covers |
| --- | --- |
| `plan` | routines, exercises, sets/reps, schedule, progression settings |
| `training` | logged sets, targets, effort ratings, durations, PRs in the review window |
| `bodyweight` | weigh-ins in the window and your goal weight |
| `profile` | the intake answers you gave the Coach, including any limitations |
| `prefs` | unit, language, effort scale |

A review reads a training block, not a training career: the window is capped at **12 weeks or 60
sessions**. Your profile is identified by a stable pseudonym that is never the user id and never
reversible.

Excluded on purpose and permanently: **your e-mail address and account id (a stable pseudonym
stands in), your session and credentials, theme and appearance settings, and every other
profile's everything.** Only the math and the effort leave the box.

## Guardrails

- **Persistent memory.** A stated limitation — *"bad right shoulder"* — persists in the Coach
  profile, and every later proposal respects it.
- **Conservative by design.** If pain shows up in free text the Coach will not diagnose. It
  programs conservatively and points you at a professional.
- **Validated before you see it.** Every answer is checked against a closed list of change types
  and the real exercise library — one repair round, then a clean failure. This validator, not the
  prompt, is the security boundary.
- **Contained.** The function reads exactly two tables and holds one secret, which never
  reaches a browser. A proposal waits in `coach_profile`, which only the function writes and
  only its owner can read — row-level security, not application code, is what enforces that.

## Deliberately out of scope

- No AI overriding a per-session load — the engine owns the math.
- No live mid-workout chat or real-time set advice — sessions stay distraction-free.
- No form-video analysis or biomechanical diagnostics — payloads stay minimal.
- No AI in browser-only guest mode — the zero-telemetry promise holds.

---

## Where the code lives

```
supabase/functions/coach/        the function: payload allowlist, validator, prompts, provider call
supabase/migrations/             coach_profile — running job, pending proposal, decisions
frontend/src/lib/coach.js        plan fingerprint, snapshots, atomic apply, revert, cadence
frontend/src/lib/coach-api.js    calling the function, polling a job
frontend/src/views/Coach*.jsx    hub, intake, proposal review
```

The requirement ids (`FR-xx`) in the code comments come from the original feature's functional
plan, which lived in the upstream fork and is no longer carried here.
