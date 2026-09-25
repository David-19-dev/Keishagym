import { EXDB } from './exercises-data.js'
import VIDEOS from './exercise-videos.js'
import { t } from './i18n.js'

export { EXDB }
export const EXIDX = {}
EXDB.forEach(e => { EXIDX[e.id] = e })
export const BODYPARTS = [...new Set(EXDB.map(e => e.bp))].sort()

// Equipment options present in a given list of exercises, most common first (issue #6).
// Deriving them from the *already filtered* list keeps the chip row short and means
// every body-part × equipment combination on screen has results behind it.
export function equipmentOf(list) {
  const c = {}
  list.forEach(e => { if (e.eq) c[e.eq] = (c[e.eq] || 0) + 1 })
  return Object.keys(c).sort((a, b) => c[b] - c[a] || (a < b ? -1 : 1))
}

// Custom (user-created) exercises live in synced state S.customEx (issue #11) and are
// merged into the id index here so every EXIDX[id] lookup keeps working unchanged.
let customIds = []
export function registerCustom(list) {
  customIds.forEach(id => delete EXIDX[id])
  customIds = (list || []).map(e => e.id)
  ;(list || []).forEach(e => { EXIDX[e.id] = e })
}
// Full searchable catalogue — customs first so your own exercises are easy to find.
export const allExercises = st => [...(st.customEx || []), ...EXDB]

// Every exercise ships two photos — the start and the end of the movement — which the app
// alternates to show the motion (components/Media.jsx). They normally sit next to the app in
// ex/ (mounted into the web container); a build can point them somewhere else, which is how
// the mobile and demo builds pull them off a CDN instead of shipping ~80 MB.
const EX_BASE = import.meta.env.VITE_EX_BASE || 'ex/'
// [start, end] — empty for a custom exercise, which has no photos by design (issue #11).
export const frames = ex => (ex?.fr || []).map(f => EX_BASE + f)
export const stillSrc = ex => (ex?.fr?.length ? EX_BASE + ex.fr[0] : null)

// A 3D demo video, for the exercises that have one (see exercise-videos.js). Everything else
// keeps the two photos, so the library can gain animations a few at a time.
const VID_BASE = import.meta.env.VITE_VID_BASE || 'vid/'
export const videoSrc = ex => (ex && VIDEOS[ex.id] ? VID_BASE + VIDEOS[ex.id] : null)

// Cardio exercises log time + speed instead of weight × reps.
export const isCardio = idOrEx => (typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx)?.bp === 'cardio'

// An id that resolves to nothing — a plan file built against a different exercise dataset,
// a custom exercise deleted on another device before the sync arrived — still has to
// render. A placeholder keeps it visible (and removable) instead of taking the whole view
// down on the first `ex.n`.
export const exOr = id => EXIDX[id] ||
  { id, n: t('Unknown exercise'), bp: '', tg: '', eq: '', sm: [], st: [], fr: [], missing: true }
