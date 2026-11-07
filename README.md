# MatriSync
MatriSync software developed by Team UNCODED for the Healthathon 2026

## Current submission minimum — 7 November 2026

Start with [the current MVP and presentation guide](docs/SUBMISSION-MVP-2026-11-07.md). Development resumed in Codex: approved pairing codes, manual encrypted profile synchronization, personal care-summary print/PDF and reviewed local PDF read-back in RUHI extend the existing referral/BLE implementation. `Start-MatriSync.cmd` prepares fictional presentation workspaces on the configured Windows computer. Hardware is assembled but remains untouched pending software rehearsal and later integration. Older checkpoints below are retained as history.

## Previous checkpoint — 5 November 2026

**Start with [the complete Codex → GitHub → Bolt handoff](docs/MATRISYNC_CODEX_HANDOFF_2026-11-05.md) and [latest approved requirements](docs/FINAL-REQUIREMENTS-2026-11-05.md).** They supersede conflicting historical status below. Continue on `handoff/matrisync-codex-2026-11-05`; preserve Firebase, records and the existing design. This remains a synthetic-data development prototype, not a clinically deployable system.

The controlled local submission build now combines encrypted profile/original sharing, reviewed printable referrals, destination receiving events and Web Bluetooth handoff. Matching ESP32-S3 firmware compiles; physical BLE and NFC are not verified. Use `pnpm build:submission` for that emulator-bound build. Bolt source preview uses `pnpm dev:bolt`; hosted preview cannot substitute for localhost emulator or hardware tests. Granular healthcare roles, facility device enrollment/PIN sessions, upload acceptance review and clinical AI remain documented work for continuation.

See [verification](docs/VERIFICATION-2026-11-05-HANDOFF.md), [ESP32-S3 protocol](docs/ESP32-S3-BLE-HANDOFF.md), and [new-conversation context](docs/NEW-CHATGPT-CONTEXT-2026-11-05.md). The sections below are historical setup/background and are retained for continuity.

## Phased development · encrypted local records

Responsive React/TypeScript PWA with three role workspaces, separate synthetic Guest sessions and Firebase email/password Authentication. Signed-in professionals can add/edit/search private patient profiles and save encrypted reports and prescription files on the device. Mothers can store their own documents locally. The encrypted Firestore adapter and prototype rules are tested against emulators but not connected to the live app. No deployment has been performed.

The [current phase and test-database update](docs/PHASED-DEVELOPMENT.md) records the latest user-directed changes and remaining stages. The [v2 specification](docs/MatriSync-Master-Development-Guide-v2.txt) controls the UI. Each public workspace has exactly five navigation tabs; organizational Distribution Management is a nested synthetic preview, not another signup role. See [existing-versus-target comparison and conflicts](docs/V2-ALIGNMENT.md). Older branded demo links redirect to their approved functional destinations.

### Run

Requirements: Node 22+ and pnpm. From this repository directory:

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173/. Keep the terminal/server running. For a production PWA preview:

```sh
pnpm build:demo
node scripts/serve.mjs --port 5173
```

Open http://127.0.0.1:5173/. On the development Windows machine, `Start-MatriSync.ps1` starts the existing production build in the background and opens it. Run it from PowerShell in this folder. It does not install packages or deploy anything. For offline demonstrations use the **production preview**, visit online once, wait for the service worker to install, then reload before disconnecting. Development mode does not install a service worker.

Use `pnpm build` for a normal build that excludes the supplied draft databases entirely. `pnpm build:demo` includes them only for local testing; both builds verify this boundary. For development with test lookup, use `pnpm dev:demo`. Nothing is deployed by these commands.

### Account setup

Copy `.env.example` to `.env.local` and fill the four Firebase web configuration variables using the intended project. Restart the dev server or rebuild after changing configuration. Keep `.env.local` ignored. This checkout has the owner-supplied configuration locally; it is not committed. The app initializes Firebase App/Auth on account use, with session-scoped Auth persistence. The separate Firestore adapter is disabled for production; there is no Firebase Storage upload code. No service-account key belongs in frontend variables.

The supplied project was inspected on 20 October 2026: active, billing disabled, email/password provider enabled. No project settings were changed. Its existing authorized domains include localhost. Successful live signup/login/logout has not yet been verified with a real account. The UI displays useful errors if a request fails; no simulated authentication success is used.

### Demo scope and storage

Choose any role and use **Continue as Guest**. Guest records are synthetic. Signed-in professional Home/Patients and mother Reports/Prescriptions use private device records; other workflow previews remain explicitly labelled synthetic or unavailable. The optional testing build separately includes user-supplied, unverified medicine references. Role selection grants no professional or facility privilege. Guest mutable state uses only `matrisync.demo.*` sessionStorage keys and memory. Reset restores defaults; Exit Guest clears all these keys and reloads the public selector, preventing leftover Auth/background state. Account transition clears Guest first. A blocked-storage fallback explicitly warns that reload persistence is unavailable. Normal new tabs are separate; duplicate/restore behavior is browser-dependent.

The public service worker precaches an explicit build-generated asset allowlist. It never caches auth requests, navigation responses, mutable Guest state, or personal records supplied by a user. The explicit testing build also caches the supplied static draft medicine references for offline tests; searches and profile photos are never cached by the service worker. Deep links receive the same public static shell. Updates wait until the user selects **Update now**; the next activation removes obsolete MatriSync shell caches.

### Private local records

Sign in, open Professional > Patients, and set a separate vault passphrase (at least 12 characters). Add a patient, edit their profile, and use their Reports or Prescriptions tab to upload PDF/JPG/PNG/WebP files (up to 10 MB each). Mother > My Health > Reports/Prescriptions uses the account's own local record profile. Documents retain supplied issuer/date metadata and are labelled unverified uploaded copies.

The vault encrypts record data, document metadata and file contents in IndexedDB. It locks on reload/account exit and after five minutes without interaction. The passphrase/key is never saved. **There is currently no passphrase recovery or backup UI.** Clearing browser data or losing the device can permanently remove these documents. Downloads are ordinary decrypted copies. Cloud document/photo uploads remain disabled. See [storage design and limits](docs/FIRESTORE-MODEL.md).

### Checks

```sh
pnpm lint
pnpm test
pnpm build:demo
pnpm test:e2e
```

The browser suite uses installed Microsoft Edge. It starts a production preview automatically and checks enabled/disabled account controls according to the build's configuration. Tests never submit live account credentials. Missing-configuration behavior was also tested before local Firebase values were supplied.

The Auth, local-record and AI-failure tests passed on 22 October 2026 using the official Firebase CLI 15.34.0, installed separately from application dependencies. With that CLI available, run `firebase emulators:exec --only auth --project demo-matrisync "node node_modules/@playwright/test/cli.js test --config playwright.auth.config.ts"`. The test app overrides all project values in memory and points only to loopback. `firebase.json` also configures the local Firestore emulator and undeployed prototype rules. No live accounts or project settings are changed. Run this suite separately from the production browser suite because both use Playwright's default results directory.

See [meeting walkthrough](docs/MEETING-WALKTHROUGH.md), [capabilities and deferred roadmap](docs/CAPABILITIES.md), and [verification evidence](docs/VERIFICATION.md). Screenshots are in `docs/screenshots/`.

### Structure and branding

- `src/main.tsx`: existing Auth/Guest integration, shared shell, preferences, accessible native dialogs.
- `src/data.ts`: preserved synthetic fixtures, exact five-tab role navigation, configurable provisional tagline.
- `src/workspace.tsx`: v2 read-only screens, contextual navigation and compatibility redirects.
- `src/workspace-spec.ts`: exact v2 internal sections, More menus and future-action inventories.
- `src/session.ts`: validated session-only Guest store.
- `src/auth.ts`: lazy Auth initialization, session persistence, safe error copy.
- `src/theme.css`: exact supplied Medical Green semantic tokens for light/dark.
- `scripts/build-sw.mjs`: versioned public-shell allowlist.
- `docs/branding/MatriSync-approved-original.png`: supplied artwork, unchanged. PWA derivatives preserve proportions and alpha; maskable image has safe padding.

“Every Mother. Every Step.” remains configurable provisional copy pending final acceptance. Language preferences include English, Bengali, Kannada, Hindi, Marathi; unavailable reviewed translations explicitly fall back to English. No translation service is called.

Reference implementation behavior follows [Firebase session persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence) and [MDN tab storage semantics](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage).

### AI foundation

The selected providers and exact zero-cost blockers are documented in [AI integration status](docs/AI-PROVIDER-EVALUATION.md). Mother > MatriSathi > Chat > AI settings contains optional offline installation, preferences and privacy controls. AI usage has separate offline, Gemini and Tavily indicators. Gemini/Tavily remain disabled; there are no paid fallbacks or online uploads.

The public Qwen weights are an optional approximately 620 MB download after confirmation, never part of Git or initial PWA precaching. WebGPU with shader-f16 and sufficient memory are required. English safety checks are conservative development controls, not clinically validated triage. Only synthetic inputs are appropriate for current acceptance tests.

`TEST_OFFLINE_MODEL=1` explicitly opts the Auth Playwright suite into the real download/inference test. Also set `TEST_AI_PRODUCTION=1` to test PWA caching and offline worker restart. The isolated build and synthetic browser profile stay in ignored `.local-tools`; `TEST_AUTH_PORT` can move the ordinary Auth suite to a separate test port. Without it, that large-download test is skipped. Keep Auth emulator tests separate from the regular browser suite. Model inference runs in a worker; Stop terminates it. Loading after Stop reads the installed cache without an automatic online fallback.
