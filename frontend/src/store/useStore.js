import { create } from 'zustand'
import { api } from '../lib/api.js'
import { localTZ } from '../lib/format.js'
import { LANGS } from '../lib/i18n.js'
import { registerCustom } from '../lib/exercises.js'
import { DEMO, DEMO_SEEDED } from '../lib/demo.js'
import { MOBILE, nativeLoad, nativeSave, syncReminder } from '../lib/mobile.js'
import { SUPABASE, sb, userFrom, sbError, pullRemoteState, pushRemoteState, callCoach } from '../lib/backend.js'

const KEY = 'gym_state_v1'
// A new profile starts in the device's language when the app speaks it — otherwise a French
// phone opens an English app and the browser offers to machine-translate it (brand name included).
const deviceLang = () => {
  try { const l = (navigator.language || '').slice(0, 2).toLowerCase(); return LANGS[l] ? l : 'en' } catch { return 'en' }
}
export const DEF = {
  unit: 'kg', restSec: 90, sound: true, keepAwake: true, lang: deviceLang(),
  theme: 'dark', body: 'male', targetW: null,
  bodyweight: [], routines: [], week: {}, dayPlan: {},
  exWeights: {}, workouts: [], active: null, customEx: [], gifSize: 'full',
  // effort: which per-set effort scale is logged — 'none' | 'rir' | 'rpe'. null, not 'none', so
  // that a profile which never chose (loaded state is overlaid on DEF, on every path: local,
  // server pull, backup import) still falls back to the `showRir` boolean this replaced and
  // keeps the column it had. See effortOf.
  reminder: { on: false, time: '08:00', tz: null }, effort: null,
  // AI Coach (issue: AI enablement). null until the profile opts in — a null namespace is the
  // same app it was before the feature existed, which is what Epic F asks for. Shape and
  // bounds live in lib/coach.js.
  coach: null
}
const clone = o => JSON.parse(JSON.stringify(o))

function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return Object.assign(clone(DEF), JSON.parse(raw))
  } catch (e) { /* ignore */ }
  return clone(DEF)
}

const hasData = st => !!((st.workouts || []).length || (st.routines || []).length || (st.bodyweight || []).length)

export const useStore = create((set, get) => {
  let pushTm = null
  let saveTm = null

  // Mobile build: mirror the state into a file in the app's data directory (survives WebView
  // storage eviction) and keep the native reminder schedule in step with the weekly plan.
  const nativePersist = () => {
    clearTimeout(saveTm)
    saveTm = setTimeout(() => { saveTm = null; nativeSave(get().S); syncReminder(get().S) }, 800)
  }

  const persist = (S, push = true) => {
    S._ts = Date.now()
    registerCustom(S.customEx)
    localStorage.setItem(KEY, JSON.stringify(S))
    set({ S })
    if (MOBILE) nativePersist()
    if (push && get().user) {
      clearTimeout(pushTm)
      pushTm = setTimeout(() => get().pushState(), 1500)
    }
  }

  // A setting changed right before switching away/closing the tab must not get lost mid-debounce
  // (e.g. setting the reminder time then immediately backgrounding to test it). On mobile the
  // same applies to the file mirror — backgrounding is often the last thing before the OS
  // kills the app.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    if (MOBILE && saveTm) {
      clearTimeout(saveTm)
      saveTm = null
      nativeSave(get().S)
    }
    if (pushTm) {
      clearTimeout(pushTm)
      pushTm = null
      get().pushState()
    }
  })

  // Everything a sign-out leaves behind on this device, whichever way it was triggered.
  const clearLocalSession = () => {
    get().setUser(null)
    localStorage.removeItem('gym_guest')
    localStorage.removeItem('gym_dirty')
    localStorage.removeItem(KEY)
    persist(clone(DEF), false)
  }

  return {
    S: (() => { const s = loadState(); registerCustom(s.customEx); return s })(),
    user: (() => { try { return JSON.parse(localStorage.getItem('gym_user')) || null } catch { return null } })(),
    ready: false,
    // Instance capabilities from GET /api/config. `config.coach` is present only when the
    // owner has both enabled the Coach and connected a provider — every Coach entry point in
    // the app hangs off it, so an unconfigured instance renders exactly what it always did.
    config: null,

    // Mutate a draft of S via producer fn, then persist + schedule sync.
    update(mut, push = true) {
      const S = clone(get().S)
      mut(S)
      persist(S, push)
    },
    replaceState(S, push = false) { persist(clone(S), push) },

    isGuest: () => localStorage.getItem('gym_guest') === '1',
    setGuest(v) { if (v) localStorage.setItem('gym_guest', '1'); else localStorage.removeItem('gym_guest'); set({}) },

    setUser(u) {
      if (u) { localStorage.setItem('gym_user', JSON.stringify(u)); localStorage.removeItem('gym_guest') }
      else localStorage.removeItem('gym_user')
      set({ user: u })
    },

    async pushState() {
      if (!get().user) return
      clearTimeout(pushTm)
      try {
        if (SUPABASE) await pushRemoteState(get().user.id, get().S)
        else await api('/api/data', { method: 'PUT', body: JSON.stringify({ state: get().S }) })
        localStorage.removeItem('gym_dirty')
      }
      catch (e) { localStorage.setItem('gym_dirty', '1') }
    },
    async pullState() {
      try {
        const state = SUPABASE ? await pullRemoteState() : (await api('/api/data')).state
        const S = get().S
        const dirty = localStorage.getItem('gym_dirty') === '1'
        if (state && (!hasData(S) || ((state._ts || 0) >= (S._ts || 0) && !dirty))) {
          const active = S.active
          const next = Object.assign(clone(DEF), state)
          if (active) next.active = active
          persist(next, false)
        } else if (hasData(S)) { await get().pushState() }
      } catch (e) { /* offline — keep local */ }
    },

    // Signing out wipes this device's copy, so it refuses while there are changes the server
    // hasn't got (offline, or the push failed): that copy would be the only one. Throws; the
    // caller says so and the user stays signed in.
    async signOut() {
      await get().pushState()
      if (localStorage.getItem('gym_dirty') === '1') throw new Error('unsynced')
      try {
        if (SUPABASE) await sb.auth.signOut({ scope: 'local' })
        else await api('/api/logout', { method: 'POST', body: '{}' })
      } catch (e) { /* */ }
      clearLocalSession()
    },

    // "Sign out everywhere": the server bumps this profile's session version, which kills every
    // session it has on any device — this browser included, so the app has to end up exactly
    // where a normal signOut leaves it. Unlike signOut the request is NOT swallowed: if it fails
    // the sessions elsewhere are all still valid, and wiping this device's copy of the data
    // would sign the user out of the one place the bump didn't reach. Caller reports the error.
    async signOutAll() {
      await get().pushState()   // never throws — stores gym_dirty and moves on when offline
      if (localStorage.getItem('gym_dirty') === '1') throw new Error('unsynced')
      if (SUPABASE) {
        const { error } = await sb.auth.signOut({ scope: 'global' })
        if (error) throw sbError(error)
      } else await api('/api/logout/all', { method: 'POST', body: '{}' })
      clearLocalSession()
    },

    // Supabase accounts only: removes the account and its synced data (delete_my_account() in
    // the migration cascades to user_state), then leaves this device the way a sign-out does.
    // Throws when it didn't happen, so the caller can say so instead of wiping the local copy.
    async deleteAccount() {
      const { error } = await sb.rpc('delete_my_account')
      if (error) throw sbError(error)
      await sb.auth.signOut({ scope: 'local' }).catch(() => {})
      clearLocalSession()
    },

    // Supabase sign-in / sign-up, shared by the login screen. Data already on this device (guest
    // use before signing up) moves into a new account; an existing account is pulled, with the
    // same newest-wins rule as a boot.
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw sbError(error)
      get().setUser(userFrom(data.user))
      await get().pullState()
      return get().user
    },
    // Resolves to the user when signed straight in, or null when the server wants the address
    // confirmed first (no session until the link in the e-mail is followed).
    async signUp(email, password, name) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } })
      if (error) throw sbError(error)
      if (!data.session) return null
      get().setUser(userFrom(data.user))
      if (hasData(get().S)) await get().pushState()
      else await get().pullState()
      return get().user
    },

    // Demo build only: drop the seeded example profile back in (Settings → "Reset demo data").
    // Dynamic import so the generator never ships in a self-hosted bundle.
    async resetDemo() {
      const { buildDemoState } = await import('../lib/demoSeed.js')
      localStorage.removeItem('gym_dirty')
      persist(Object.assign(clone(DEF), buildDemoState()), false)
    },

    // Boot: ask the server who we are, then pull.
    async boot() {
      // Mobile build: restore from the file mirror (the durable copy; localStorage may have been
      // evicted since the last run). Without Supabase there is no backend: go straight in as the
      // local profile. With it, carry on to the account check below.
      if (MOBILE) {
        const saved = await nativeLoad()
        const S = get().S
        if (saved && (!hasData(S) || (saved._ts || 0) >= (S._ts || 0))) {
          persist(Object.assign(clone(DEF), saved), false)
        } else if (hasData(S)) {
          nativeSave(S)   // first run after an update from a file-less version: seed the mirror
        }
        syncReminder(get().S)
        if (!SUPABASE) {
          get().setGuest(true)
          set({ ready: true })
          return
        }
      }
      // Demo build (GitHub Pages): no backend at all — seed once, stay in guest mode.
      if (DEMO) {
        if (!localStorage.getItem(DEMO_SEEDED)) {
          localStorage.setItem(DEMO_SEEDED, '1')
          await get().resetDemo()
        }
        get().setGuest(true)
        set({ ready: true })
        return
      }
      if (SUPABASE) {
        // A session revoked elsewhere ("sign out everywhere", account deleted) ends here on the
        // next token refresh. Only the account link is dropped — the data stays on the device,
        // like the passkey server's 401 path, so nothing unsynced is lost.
        sb.auth.onAuthStateChange(event => {
          if (event === 'SIGNED_OUT' && get().user) get().setUser(null)
        })
        try {
          // Offline, this returns the stored session, so the app opens signed in and syncs later.
          const { data: { session } } = await sb.auth.getSession()
          if (session) {
            get().setUser(userFrom(session.user))
            await get().pullState()
            // Is the Coach deployed and configured on this instance? One call, once per
            // session; every Coach entry point hangs off the answer, so an instance without it
            // renders exactly what it did before the feature existed.
            try {
              const st = await callCoach({ action: 'status' })
              if (st?.enabled) set({ config: { coach: { enabled: true } } })
            } catch (e) { /* not deployed — the feature stays hidden */ }
            const tz = localTZ()
            if (get().S.reminder?.on && get().S.reminder.tz !== tz) {
              get().update(s => { s.reminder = { ...s.reminder, tz } })
            }
          } else if (get().user) get().setUser(null)
        } catch (e) { /* keep local */ }
        set({ ready: true })
        return
      }
      // Instance capabilities are public and needed whether or not anyone is signed in.
      try { set({ config: await api('/api/config') }) } catch (e) { /* offline — assume nothing extra */ }
      try {
        const me = await api('/api/me')
        get().setUser(me.user)
        await get().pullState()
        // Re-stamp the reminder's timezone on every load — keeps it correct if you're travelling,
        // without needing to revisit Settings.
        const tz = localTZ()
        if (get().S.reminder?.on && get().S.reminder.tz !== tz) {
          get().update(s => { s.reminder = { ...s.reminder, tz } })
        }
      } catch (e) {
        if (e.status === 401) get().setUser(null)
      }
      set({ ready: true })
    }
  }
})

export { hasData }
