// Exercises that have a 3D demo video, and the file that holds it.
//
// The app ships two photos per exercise (the start and the end of the movement, from the
// public-domain dataset). An exercise listed here shows a looping video instead, and anything
// absent keeps the photos — so animations can be produced a handful at a time, starting with
// the ones people actually train, without a flag day.
//
// Files live next to the app in vid/ (VITE_VID_BASE points elsewhere when they are on a CDN).
// What to produce, per exercise:
//   · 3–5 s seamless loop, no sound, square-ish (720×720 is plenty), h.264 MP4 + WebM/VP9
//   · keep it under ~500 KB: these are watched between sets, often on mobile data
//   · the first frame should match the photo it replaces, so the swap is not jarring
// Add the id exactly as it appears in exercises-data.js:
//   export default { Barbell_Squat: 'Barbell_Squat.webm' }
export default {}
