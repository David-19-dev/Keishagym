// Supabase backend — accounts (Supabase Auth) and the synced state document (public.user_state,
// owner-only through row-level security; see supabase/migrations/). Switched on by the two
// build-time variables; without them the app keeps its previous behaviour (self-hosted API,
// demo, or local-only mobile), so nothing changes for a build that doesn't set them.
import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const SUPABASE = !!(URL && KEY)

export const sb = SUPABASE
  ? createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
  : null

// The app's user shape (the passkey server's was {id, name, admin}): the display name is the
// one given at sign-up, or the address's local part for accounts created without one.
export const userFrom = u => u && {
  id: u.id,
  email: u.email || '',
  name: (u.user_metadata && u.user_metadata.name) || (u.email || '').split('@')[0],
}

// Supabase errors carry a message worth showing; network failures surface as a TypeError.
export function sbError(error) {
  const e = new Error(error?.message || String(error))
  e.status = error?.status
  return e
}

// A rejected token (expired early, or signed with a key the server has since rotated) gets one
// session refresh and one retry — the refresh token is opaque and survives a key rotation, so
// the account keeps syncing instead of waiting up to an hour for the scheduled refresh.
const JWT_REJECTED = new Set(['PGRST301', 'PGRST302', 'PGRST303'])
async function withFreshToken(run) {
  let res = await run()
  if (res.error && (res.status === 401 || JWT_REJECTED.has(res.error.code))) {
    const { error } = await sb.auth.refreshSession()
    if (!error) res = await run()
  }
  if (res.error) throw sbError(res.error)
  return res.data
}

export async function pullRemoteState() {
  const data = await withFreshToken(() => sb.from('user_state').select('state').maybeSingle())
  return data ? data.state : null
}

export async function pushRemoteState(userId, state) {
  await withFreshToken(() => sb.from('user_state').upsert({ user_id: userId, state }))
}

/* The Coach runs as an Edge Function (supabase/functions/coach). It is called directly rather
 * than through supabase-js's functions.invoke, because the failure codes matter: the client
 * has wording for 'busy', 'cap', 'consent' and the rest, and invoke() flattens a non-2xx into
 * a generic FunctionsHttpError with the body unread.
 */
export async function callCoach(body) {
  const { data: { session } } = await sb.auth.getSession()
  const r = await fetch(URL.replace(/\/$/, '') + '/functions/v1/coach', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      ...(session ? { Authorization: 'Bearer ' + session.access_token } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = new Error(data.error || 'HTTP ' + r.status)
    e.status = r.status
    e.code = data.code || null
    throw e
  }
  return data
}
