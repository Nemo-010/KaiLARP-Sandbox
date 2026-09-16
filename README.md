# KaiLARP-Sandbox

The app. Point it at a URL from a JioPhone dump and it runs the app inside
[KaiLARP-core](../KaiLARP-core)'s compatibility layer, on a phone that is not a
JioPhone.

```
paste URL  ->  read update.webapp  ->  host capability check  ->  open application.zip
           ->  boot under KaiLARP-core  ->  summary table
```

If the host cannot honestly provide what the app needs — a secure element, a
DRM licence, a camera when fake capture is off — the run stops before anything
boots and says which capability it refused and why.

## Run it on the desktop (what CI verifies)

```sh
npm install
node scripts/sync-core.mjs --core ../KaiLARP-core
npx expo export --platform web
node scripts/verify-web.mjs
```

`verify-web.mjs` boots the exported build in a real engine, clicks
**bundled demo**, waits for the summary, screenshots it, records the screen and
checks the recording has non-blank frames. It writes
`out/sandbox-verification.{json,md}` and `out/screen/*`.

## Run it on Android

```sh
npm install
node scripts/sync-core.mjs --core ../KaiLARP-core
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

Or with EAS: `eas build --platform android --profile preview` (an APK with
`EXPO_PUBLIC_AUTORUN=demo`).

`.github/workflows/verify.yml` does both: the web job runs the verification
above, and the android job builds the APK, boots an emulator, launches the app
and captures `adb shell screenrecord` video as an artifact.

`EXPO_PUBLIC_AUTORUN=demo` makes the app run the bundled demo on launch, so the
device screencast is reproducible with no tapping.

## How it fits together

| piece | file | note |
| --- | --- | --- |
| URL -> manifest + package | `src/core/source.ts` | GitLab tree/raw or a direct URL; unzips with jszip |
| permission -> capability | `src/core/gate.ts` | mirrors core's gate from one generated table |
| package -> one document | `src/core/inline.ts` | inlines scripts, styles, images and `url()` assets |
| document + shim + bridge | `src/core/runtimeHtml.ts` | the exact string booted in the frame |
| host view | `src/components/RuntimeView.tsx` / `.web.tsx` | WebView on device, iframe on web |
| evidence | `src/record/recorder.ts` / `.web.ts` | see below |

`src/core/generated.ts` is produced by `scripts/sync-core.mjs` from
`KaiLARP-core`: the injected shim, the F491H profile, the capability table and
the permission map. The Sandbox never imports KaiLARP-core at run time, so it
builds on a machine that only has this repository — but the shim cannot drift
from core, because it is generated from it.

## Releases

`.github/workflows/release.yml` publishes to GitHub Releases. Push a tag
(`git tag v0.1.0 && git push --tags`), or run the workflow by hand and give it a
tag. It builds and attaches:

- `kailarp-sandbox-android-<version>.apk` — the device build
- `kailarp-sandbox-web-<version>.zip` — the static web build
- `kailarp-sandbox-device-<version>.mp4` — an emulator screencast of the APK running
- `kailarp-sandbox-web-verification.{json,md}`, the summary screenshot and the
  web screen recordings

The release job runs behind the two build jobs plus an emulator job, so a
release only exists if the app built and ran.

## Screen recording, honestly

- **Web build.** `verify-web.mjs` records the page with the engine itself and
  checks frame count and brightness. `recorder.web.ts` can also capture with
  `getDisplayMedia` in a normal browser tab.
- **Android.** The recording is produced by the CI harness with
  `adb shell screenrecord`; the app reports that rather than pretending it
  captured something. Wiring in MediaProjection is the one extension point:
  implement `start()` in `src/record/recorder.ts` and the rest of the flow
  already consumes it.

## Serving model

The app package is folded into a single self-contained document and booted in a
WebView (`source={{ html }}`) or an iframe (`srcDoc`). No local server, no
CORS, no filesystem permissions — which is what lets the same runtime work on
desktop web and on a phone.

On the desktop web build, fetching a dump URL is subject to browser CORS and
will fail for most dump hosts; on Android the fetch runs in the app's own
network stack, so the URLs work there. That difference is shown in the UI
rather than hidden.
