// The Push/Pull/Legs starter plan. Shared by the "Load starter plan" action in Settings
// and by the demo build, which seeds a history on top of exactly these routines.
import { uid } from './format.js'

const SPEC = [
  ['Push Day', 'barbell', [
    ['Barbell_Bench_Press_-_Medium_Grip', 4, 8], ['Incline_Dumbbell_Press', 3, 10],
    ['Barbell_Shoulder_Press', 3, 10], ['Side_Lateral_Raise', 3, 12],
    ['Triceps_Pushdown_-_Rope_Attachment', 3, 12], ['Dips_-_Triceps_Version', 3, 10],
  ]],
  ['Pull Day', 'pullup', [
    ['Pullups', 4, 10], ['Bent_Over_Barbell_Row', 4, 8], ['Wide-Grip_Lat_Pulldown', 3, 10],
    ['Face_Pull', 3, 12], ['Barbell_Curl', 3, 10], ['Hammer_Curls', 3, 12],
  ]],
  ['Leg Day', 'legs', [
    ['Barbell_Squat', 4, 8], ['Romanian_Deadlift', 3, 10], ['Leg_Press', 3, 12],
    ['Seated_Leg_Curl', 3, 12], ['Standing_Calf_Raises', 4, 15], ['Plank', 3, 45, 'time'],
  ]],
]
// Fresh routine objects (new ids) — [push, pull, legs].
export const starterRoutines = () =>
  SPEC.map(([name, emoji, list]) => ({
    id: uid(), name, emoji,
    // a fourth entry sets the logging mode — the plank is held, so its number is seconds,
    // not reps (history.js modeOf / buildSets)
    ex: list.map(([id, sets, n, mode]) => (mode === 'time'
      ? { id, sets, sec: n, weight: 0, mode }
      : { id, sets, reps: n, weight: 0 })),
  }))
