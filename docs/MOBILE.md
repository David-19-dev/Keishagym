# Building the mobile app (iOS / Android)

KeishaGym ships in two flavors from the same codebase:

| | **Web app** (this repo's default) | **Mobile app** (`VITE_MOBILE=1`) |
|---|---|---|
| Runs | in any browser, installable as a PWA | natively on iPhone / Android (Capacitor shell) |
| Accounts | Supabase, e-mail + password | the phone, with Supabase accounts if configured |
| Data | on the device, synced to your Supabase | on the device (file in the app's private storage) |
| Reminders | none yet | native local notifications, no server involved |
| Exercise photos | served next to the app (`ex/`) | loaded from the jsDelivr CDN |

State is mirrored from `localStorage` into `opengym-state.json` in the app's private data
directory on every change (iOS is allowed to evict WebView storage under pressure — the file
mirror is the durable copy and is restored on launch; the filename is kept so an update never
loses an existing install's data). Backups go out through the OS share sheet instead of a
browser download.

## Prerequisites

- Node 20+
- **Android:** Android Studio (bundles the SDK). Java 21 for Gradle.
- **iOS:** a Mac with Xcode 15+ and CocoaPods (`brew install cocoapods`). A free Apple ID
  is enough to run the app on your own iPhone (see below); paid membership is only needed
  for App Store distribution, which openGym doesn't do.

## Build & run

```sh
cd frontend
npm install
npm run build:mobile        # VITE_MOBILE build + `cap sync` into android/ and ios/

npx cap open android        # opens Android Studio → run on emulator or device
npx cap open ios            # opens Xcode (Mac only) → set your signing team, then run
```

`npm run build:mobile` bakes the CDN media base into the bundle and copies the web build
into both native projects — re-run it after every web-code change before building natively.

> **Heads-up:** after `build:mobile`, `frontend/dist` contains the *mobile* bundle.
> Run a plain `npm run build` again before deploying `dist` to a server.

## App icons & splash screens

`frontend/resources/icon.svg` is the 1024×1024 source: the KeishaGym mark (ink dumbbell on
mint), built from the identity guide in `assets/brand/`. One script renders every PNG the web
app and the native generator need (web icons, favicon, adaptive-icon layers, splash), then
Capacitor spreads them over the Android and iOS projects:

```sh
cd frontend
node scripts/brand-icons.mjs
npx @capacitor/assets generate --android --ios --iconBackgroundColor '#1FD8A4' --iconBackgroundColorDark '#1FD8A4' --splashBackgroundColor '#0E0E0C' --splashBackgroundColorDark '#0E0E0C'
```

## Distribution — deliberately no app stores

openGym's mobile app is not on the Play Store or App Store, and that's a choice: no store
accounts, no store rules, no yearly fees between you and an open-source app.

### Android — sideload the APK

The official signed APK is at **[opengym.duarte-santos.ch](https://opengym.duarte-santos.ch)**.
Android asks you to allow installs from the browser the first time — that's standard for any
app outside the Play Store.

To build and sign your own:

```sh
cd frontend && npm run build:mobile
cd android && ./gradlew assembleRelease            # → app/build/outputs/apk/release/app-release-unsigned.apk

# one-time: create a keystore. KEEP IT — updates must be signed with the same key,
# or Android refuses to install the new version over the old one.
keytool -genkeypair -keystore my.keystore -alias opengym -keyalg RSA -validity 10950

# align + sign (zipalign/apksigner ship with the Android SDK build-tools)
zipalign -f -p 4 app-release-unsigned.apk aligned.apk
apksigner sign --ks my.keystore --ks-key-alias opengym --out openGym.apk aligned.apk
```

### iPhone — what's actually possible

Apple does not allow installing apps outside the App Store, so there is no `.ipa` download
that would simply install. Your free options:

- **PWA** (recommended): open the app in Safari → Share → *Add to Home Screen*. Full-screen,
  no expiry, and accounts and sync work exactly as they do in the browser.
- **Xcode free signing:** open `ios/` in Xcode with a free Apple ID as the team and run it
  onto your own iPhone. Apple expires the signature after 7 days; re-run from Xcode to renew.
- **AltStore:** automates that 7-day re-signing over Wi-Fi via a Mac companion app.

### Release notes for maintainers

- Bump `versionName`/`versionCode` in `android/app/build.gradle` per release; keep them in
  step with `frontend/package.json`. `versionCode` must strictly increase or updates won't
  install over an existing APK.
- **License:** openGym is AGPL-3.0, which by itself sits badly with app-store terms of
  service. `NOTICE.md` carries an app-store exception (an additional permission under
  AGPL §7) granted by the copyright holder — relevant only if store distribution ever happens.
- The app requests notification permission only when the workout-day reminder is switched
  on, and (on Android) declares `SCHEDULE_EXACT_ALARM` so the reminder fires to the minute
  where the user allows it.
