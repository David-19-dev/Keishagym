import { useEffect, useRef, useState } from 'react'
import { frames, stillSrc, videoSrc } from '../lib/exercises.js'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

// The demo. An exercise with a 3D animation (exercise-videos.js) plays it on a loop; every
// other one alternates its two photos — the start and the end of the movement — which read as
// the motion the way a flip-book does. Both are public domain / our own, so the app can ship
// them, unlike the animated GIFs this replaced.
// Tap toggles back to the still start frame. `compact` shrinks it (superset cards).
// Custom exercises have no media — the panel stays blank by design (issue #11).
// `minimizable` (workout view) adds a persistent minimize/expand control so the demo stops
// eating the screen; the chosen size is saved to settings and carries across exercises and
// future workouts (issue #12).
const FRAME_MS = 850

export default function Media({ ex, id, compact, minimizable }) {
  const [playing, setPlaying] = useState(true)
  const [frame, setFrame] = useState(0)
  const [videoBroken, setVideoBroken] = useState(false)
  const videoRef = useRef(null)
  const gifSize = useStore(s => s.S.gifSize)
  const update = useStore(s => s.update)
  const srcs = frames(ex)
  const vid = videoBroken ? null : videoSrc(ex)

  // Photo demo: one timer per mounted panel, stopped when paused, still frame is the start.
  useEffect(() => {
    if (vid || !playing || srcs.length < 2) { setFrame(0); return }
    const iv = setInterval(() => setFrame(f => (f + 1) % srcs.length), FRAME_MS)
    return () => clearInterval(iv)
  }, [vid, playing, srcs.length, ex?.id])

  // Video demo: the same tap drives it. Autoplay can be refused (Low Power Mode on iOS), and
  // the pause then has to match what is actually on screen rather than what we asked for.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (playing) v.play().catch(() => setPlaying(false))
    else v.pause()
  }, [playing, vid])

  // A video that fails to load (not downloaded yet, codec unsupported) falls back to the photos
  // rather than leaving a black hole where the movement should be.
  useEffect(() => { setVideoBroken(false) }, [ex?.id])

  if (!vid && !srcs.length) return null
  const mini = minimizable && gifSize === 'mini'
  const toggleSize = e => { e.stopPropagation(); update(s => { s.gifSize = mini ? 'full' : 'mini' }) }
  return (
    <div className={'exmedia' + (compact ? ' compact' : '') + (mini ? ' mini' : '')} id={id} onClick={() => setPlaying(p => !p)}>
      {vid ? (
        <video ref={videoRef} src={vid} poster={stillSrc(ex) || undefined}
          autoPlay loop muted playsInline preload="metadata" aria-label={ex.n}
          onError={() => setVideoBroken(true)} />
      ) : (
        /* both frames stay in the DOM: the second is decoded before it is ever shown, so the
           first loop doesn't flash a gap on a slow connection */
        srcs.map((src, i) => (
          <img key={src} decoding="async" src={src} alt={i === 0 ? ex.n : ''} aria-hidden={i > 0 ? 'true' : undefined}
            style={{ display: i === frame ? 'block' : 'none' }} />
        ))
      )}
      {minimizable && (
        <button className="giftoggle" onClick={toggleSize}>
          <Icon name={mini ? 'expand' : 'minimize'} />{mini ? t('Expand') : t('Minimize')}
        </button>
      )}
      {!mini && (
        <span className="gifhint">
          <Icon name={playing ? 'pause' : 'play'} />{playing ? t('tap to pause') : t('tap to play')}
        </span>
      )}
    </div>
  )
}

export function Thumb({ ex }) {
  const src = stillSrc(ex)
  if (!src) return <div className="thumb thumb-x"><Icon name="dumbbell" /></div>
  return <img className="thumb" loading="lazy" decoding="async" src={src} alt="" />
}
