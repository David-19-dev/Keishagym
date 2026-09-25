// What the app can tell about the device from the browser alone — used for wording, never for
// behaviour. (These lived in lib/api.js, which went away with the self-hosted server.)
export const IS_APPLE = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)
export const IS_ANDROID = /Android/.test(navigator.userAgent)
