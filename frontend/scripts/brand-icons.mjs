// Renders every KeishaGym icon the app ships from resources/icon.svg, so the web app, the
// home-screen PWA and the native shells can't drift apart. Run from frontend/:
//   node scripts/brand-icons.mjs && npx @capacitor/assets generate --android --ios
import fs from 'node:fs'
import sharp from 'sharp'

const INK = '#0E0E0C', MINT = '#1FD8A4'
const src = fs.readFileSync('resources/icon.svg', 'utf8')
const dumbbell = src.match(/<g fill="#0E0E0C">[\s\S]*?<\/g>/)[0]
const svg = inner => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">${inner}</svg>`)
const png = (buf, size, out) => sharp(buf, { density: 300 }).resize(size, size).png().toFile(out)

// Android adaptive icons show the middle 72 of a 108 layer, so the mark is scaled by 72/108
// about the centre to look the same as on the full-bleed icon.
const k = 72 / 108, off = 50 * (1 - k)
const fg = svg(`<g transform="translate(${off} ${off}) scale(${k})">${dumbbell}</g>`)
const bg = svg(`<rect width="100" height="100" fill="${MINT}"/>`)
const rounded = svg(`<rect width="100" height="100" rx="23.9" fill="${MINT}"/>${dumbbell}`)

// splash: the rounded mark centred on ink, a quarter of the short side
const splash = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="${INK}"/>
  <g transform="translate(150 150)"><rect width="100" height="100" rx="23.9" fill="${MINT}"/>${dumbbell}</g></svg>`)

await Promise.all([
  png(Buffer.from(src), 1024, 'resources/icon-only.png'),
  png(fg, 1024, 'resources/icon-foreground.png'),
  png(bg, 1024, 'resources/icon-background.png'),
  sharp(splash).png().toFile('resources/splash.png'),
  sharp(splash).png().toFile('resources/splash-dark.png'),
  // web: iOS rounds apple-touch icons itself (so full-bleed); "any" shows as-is (rounded);
  // "maskable" is cropped by the launcher (full-bleed)
  png(Buffer.from(src), 180, 'public/icon-180.png'),
  png(rounded, 512, 'public/icon-512.png'),
  png(Buffer.from(src), 512, 'public/icon-maskable-512.png'),
  png(rounded, 32, 'public/favicon-32.png'),
])
console.log('✓ brand icons rendered')
