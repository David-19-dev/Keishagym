// KeishaGym logo and wordmark — drawn from the identity guide's construction, so it stays
// crisp at any size and needs no image request. Geometry in % of the side (viewBox 100):
// corner radius 23.9 · gap 2.8 · bar 25 × 8.5 · large plates 9.7 × 42 · small plates 6.8 × 25.
// The mark keeps its own colours whatever theme the profile has chosen.

export function Logo({ size = 64, title = 'KeishaGym' }) {
  return (
    <svg className="kg-logo" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title} translate="no">
      <rect width="100" height="100" rx="23.9" fill="var(--kg-mint)" />
      <g fill="var(--kg-ink)">
        <rect x="15.4" y="37.5" width="6.8" height="25" rx="1.7" />
        <rect x="25" y="29" width="9.7" height="42" rx="2.3" />
        <rect x="37.5" y="45.75" width="25" height="8.5" />
        <rect x="65.3" y="29" width="9.7" height="42" rx="2.3" />
        <rect x="77.8" y="37.5" width="6.8" height="25" rx="1.7" />
      </g>
    </svg>
  )
}

// KEISHA in the text colour (ink on light, paper on dark), GYM in the accent.
export function Wordmark({ className = '', style }) {
  return <span className={'wordmark ' + className} style={style} translate="no">Keisha<b>Gym</b></span>
}
