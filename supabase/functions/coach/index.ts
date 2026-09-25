/* The AI Coach, as a Supabase Edge Function.
 *
 * It replaces the self-hosted Node service the feature was born in, and keeps that design's
 * two load-bearing decisions:
 *
 *   · the pending proposal lives server-side (coach_profile), not in the synced state
 *     document — a document is last-write-wins, and a proposal written into it would be erased
 *     without trace by the next device to sync an older copy;
 *   · nothing the model says reaches a plan unvalidated. validate.js resolves every exercise
 *     id against the real library and matches every change against a closed list of types. A
 *     hostile note in someone's free text can talk a model into saying anything; it cannot
 *     invent a change type, and a type that is not in that list does nothing.
 *
 * What changed: the provider is the Anthropic API called over HTTPS (one key, held as a
 * function secret) instead of a CLI spawned as an unprivileged user, and a job runs in the
 * background of the request that started it (EdgeRuntime.waitUntil) while the client polls
 * `status`, which is what the client already did.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { build, canonicalPlan, CONTRACT, DATA_CATEGORIES } from './payload.js'
import { extractJSON, validatePlan, validateReview, contractOK } from './validate.js'
import PROMPTS from './prompts.js'
import { hashPlan } from './hash.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 8000
const TIMEOUT_MS = 4 * 60000
const PENDING_DAYS = 14
const HISTORY_MAX = 20

const env = (k: string, dflt = '') => Deno.env.get(k) ?? dflt
const API_KEY = env('ANTHROPIC_API_KEY')
const MODEL = env('COACH_MODEL', DEFAULT_MODEL)
const DAILY_CAP = Number(env('COACH_DAILY_CAP', '5')) || 0
const ENABLED = env('COACH_ENABLED', '1') !== '0' && !!API_KEY

const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/* ------------------------------------------------------------------ store -- */

const EMPTY = { daily: null, current: null, pending: null, history: [] }
const todayISO = () => new Date().toISOString().slice(0, 10)

async function readCoach(uid: string) {
  const { data } = await admin.from('coach_profile').select('data').eq('user_id', uid).maybeSingle()
  return { ...EMPTY, ...((data?.data as Record<string, unknown>) || {}) }
}
async function writeCoach(uid: string, rec: Record<string, unknown>) {
  await admin.from('coach_profile').upsert({ user_id: uid, data: rec })
}
async function patchCoach(uid: string, patch: Record<string, unknown>) {
  const rec = { ...(await readCoach(uid)), ...patch }
  await writeCoach(uid, rec)
  return rec
}
async function readState(uid: string) {
  const { data } = await admin.from('user_state').select('state').eq('user_id', uid).maybeSingle()
  return (data?.state as Record<string, any>) || null
}

/** Stable per-profile pseudonym: never the uid, never reversible, same across jobs. */
async function handleFor(uid: string) {
  const secret = env('COACH_HANDLE_SECRET', env('SUPABASE_SERVICE_ROLE_KEY'))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('coach-handle:' + uid))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 16)
}


/* ---------------------------------------------------------------- provider -- */

/** One call to the model. Returns the text, or an error class the client has wording for. */
async function ask(prompt: string): Promise<{ text?: string; errorClass?: string; detail?: string }> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] }),
    })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) {
      const detail = String(body?.error?.message || r.statusText).slice(0, 300)
      // 401/403 is the instance owner's key, not the user's problem — the wording differs.
      return { errorClass: r.status === 401 || r.status === 403 ? 'auth' : 'provider', detail }
    }
    const text = (body.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
    return text ? { text } : { errorClass: 'unusable', detail: 'empty answer' }
  } catch (e) {
    return { errorClass: (e as Error).name === 'AbortError' ? 'timeout' : 'provider', detail: String(e).slice(0, 300) }
  } finally {
    clearTimeout(timer)
  }
}

function buildPrompt(kind: string, payload: any, repair: { previous: string; errors: string[] } | null) {
  const task = kind === 'review' ? 'review' : payload.refine ? 'refine' : 'create'
  let out = PROMPTS.common + '\n\n---\n\n' + PROMPTS[task] +
    '\n\n---\n\n## Payload\n\n```json\n' + JSON.stringify(payload, null, 1) + '\n```\n'
  if (repair) {
    out += '\n\n---\n\n' + PROMPTS.repair
      .replace('{{PREVIOUS}}', String(repair.previous || '').slice(0, 4000))
      .replace('{{ERRORS}}', repair.errors.map(e => '- ' + e).join('\n'))
  }
  return out
}

/** One attempt: ask, parse, validate. `repair` is the single second round (FR-48). */
async function attempt(kind: string, payload: any, repair: any) {
  const r = await ask(buildPrompt(kind, payload, repair))
  if (r.errorClass) return { ok: false, errorClass: r.errorClass, detail: r.detail }

  const parsed = extractJSON(r.text!)
  const bad = (errors: string[]) => ({ ok: false, repairable: !repair, errors, raw: r.text, errorClass: 'unusable' })
  if (parsed.error) return bad([parsed.error])
  if (!contractOK(parsed.value)) return bad([`coach_contract must be ${CONTRACT}`])

  const v = kind === 'review'
    ? validateReview(parsed.value, payload.plan)
    : validatePlan(parsed.value, { workingWeights: payload.history?.workingWeights, daysPerWeek: payload.coachProfile?.daysPerWeek })

  if (!v.ok) return bad(v.errors)
  if (v.nochange) return { ok: true, nochange: true, reading: v.reading }
  return { ok: true, result: v.proposal ? v.proposal : { bundle: v.bundle, summary: v.bundle.summary } }
}

/* -------------------------------------------------------------------- job -- */

async function finish(uid: string, job: any, patch: Record<string, unknown>) {
  const rec = await readCoach(uid)
  const done = {
    ...rec,
    current: patch.outcome === 'failed'
      ? { id: job.id, kind: job.kind, state: 'failed', startedAt: job.startedAt, error: patch.errorClass }
      : null,
    ...(patch.pending !== undefined ? { pending: patch.pending } : {}),
    history: [...((rec.history as any[]) || []), {
      id: job.id, kind: job.kind, outcome: patch.outcome, at: Date.now(),
      ...(patch.errorClass ? { error: patch.errorClass } : {}),
    }].slice(-HISTORY_MAX),
  }
  await writeCoach(uid, done)
}

async function run(uid: string, job: any) {
  try {
    await patchCoach(uid, { current: { id: job.id, kind: job.kind, state: 'running', startedAt: job.startedAt } })
    const S = await readState(uid)
    if (!S) return await finish(uid, job, { outcome: 'failed', errorClass: 'nostate' })

    const rec = await readCoach(uid)
    const payload = build(S, await handleFor(uid), {
      kind: job.kind,
      intake: job.intake,
      note: job.note,
      refine: job.refine,
      previous: job.refine ? (rec.pending as any)?.bundle || null : null,
    })

    let a: any = await attempt(job.kind, payload, null)
    if (!a.ok && a.repairable) {
      // One repair round, then done: two failures is a provider problem, not a prompting
      // problem, and a retry loop against a paid API is a bad way to find out.
      a = await attempt(job.kind, payload, { previous: a.raw, errors: a.errors })
    }
    if (!a.ok) return await finish(uid, job, { outcome: 'failed', errorClass: a.errorClass || 'unusable' })
    if (a.nochange) return await finish(uid, job, { outcome: 'nochange', pending: null })

    await finish(uid, job, {
      outcome: 'ready',
      pending: {
        id: job.id,
        kind: job.kind,
        createdAt: Date.now(),
        expiresAt: Date.now() + PENDING_DAYS * 86400000,
        planHash: hashPlan(canonicalPlan(S)),
        iteration: job.refine ? ((rec.pending as any)?.iteration || 1) + 1 : 1,
        ...a.result,
      },
    })
  } catch (e) {
    console.error('coach job failed', e)
    await finish(uid, job, { outcome: 'failed', errorClass: 'internal' }).catch(() => {})
  }
}

/* ----------------------------------------------------------------- actions -- */

async function capState(uid: string) {
  const rec = await readCoach(uid)
  const daily = rec.daily as any
  return { used: daily?.date === todayISO() ? daily.count : 0, limit: DAILY_CAP }
}

async function status(uid: string) {
  const rec = await readCoach(uid)
  const pending = rec.pending as any
  if (pending?.expiresAt && pending.expiresAt < Date.now()) {
    await patchCoach(uid, {
      pending: null,
      history: [...((rec.history as any[]) || []), { id: pending.id, kind: pending.kind, outcome: 'expired', at: Date.now() }].slice(-HISTORY_MAX),
    })
    return { enabled: ENABLED, job: null, pending: null, cap: await capState(uid) }
  }
  const cur = rec.current as any
  return {
    enabled: ENABLED,
    job: cur ? { id: cur.id, kind: cur.kind, state: cur.state, startedAt: cur.startedAt, error: cur.error || null } : null,
    pending: pending || null,
    cap: await capState(uid),
  }
}

/** Start a job, or say why not. The codes map to wording the client already carries. */
async function enqueue(uid: string, job: any) {
  if (!ENABLED) return { error: 'off' }
  const rec = await readCoach(uid)
  const cur = rec.current as any
  if (cur && cur.state !== 'failed') return { error: 'busy' }

  const S = await readState(uid)
  // Consent is enforced here, server-side, not by the screen that collects it: a UI-only gate
  // is not a gate.
  if (!S?.coach?.consent?.agreedAt) return { error: 'consent' }

  const { used, limit } = await capState(uid)
  if (limit > 0 && used >= limit) return { error: 'cap' }

  // Counted when the job starts, not when it finishes: the cap bounds what one profile can
  // spend of the instance's provider account, and a job spends it whether or not it completes.
  const d = todayISO()
  const daily = (rec.daily as any)?.date === d ? { date: d, count: (rec.daily as any).count + 1 } : { date: d, count: 1 }
  const started = { ...job, id: crypto.randomUUID().slice(0, 16), startedAt: Date.now() }
  await writeCoach(uid, {
    ...rec, daily,
    current: { id: started.id, kind: started.kind, state: 'queued', startedAt: started.startedAt },
  })

  // The answer goes back now; the model keeps thinking after the response is sent, and the
  // client polls `status` exactly as it did against the old service.
  ;(globalThis as any).EdgeRuntime?.waitUntil
    ? (globalThis as any).EdgeRuntime.waitUntil(run(uid, started))
    : run(uid, started)
  return { job: { id: started.id } }
}

async function resolvePending(uid: string, body: any) {
  const rec = await readCoach(uid)
  const pending = rec.pending as any
  if (!pending) return { ok: true }
  await writeCoach(uid, {
    ...rec,
    pending: null,
    history: [...((rec.history as any[]) || []), {
      id: pending.id, kind: pending.kind,
      outcome: body?.dismissed ? 'dismissed' : 'applied',
      accepted: Array.isArray(body?.accepted) ? body.accepted.length : 0,
      rejected: Array.isArray(body?.rejected) ? body.rejected.length : 0,
      at: Date.now(),
    }].slice(-HISTORY_MAX),
  })
  return { ok: true }
}

const str = (v: unknown, max: number) => (v ? String(v).slice(0, max) : null)

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'POST only' })

  const body = await req.json().catch(() => ({}))
  const action = String(body.action || '')

  // What the consent screen has to disclose, straight from the module that builds payloads, so
  // the screen cannot drift from what actually leaves.
  if (action === 'disclosure') {
    return reply(200, { provider: 'anthropic', providerLabel: 'Claude (Anthropic API)', categories: DATA_CATEGORIES, version: 1 })
  }

  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer /i, '')
  const { data: { user } } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } }
  if (!user) return reply(401, { error: 'not signed in' })

  switch (action) {
    case 'status':
      return reply(200, await status(user.id))
    case 'plan': {
      const r = await enqueue(user.id, { kind: 'create', intake: body.intake || null, refine: str(body.refine, 1000) })
      return r.error ? reply(400, { error: r.error, code: r.error }) : reply(202, r)
    }
    case 'review': {
      const r = await enqueue(user.id, { kind: 'review', note: str(body.note, 1000) })
      return r.error ? reply(400, { error: r.error, code: r.error }) : reply(202, r)
    }
    case 'resolve':
      return reply(200, await resolvePending(user.id, body))
    // Consent withdrawn, or the profile turned the Coach off: drop everything held for them
    // here at once, without waiting for a sync to carry the news.
    case 'forget':
      await admin.from('coach_profile').delete().eq('user_id', user.id)
      return reply(200, { ok: true })
    default:
      return reply(400, { error: 'unknown action' })
  }
})
