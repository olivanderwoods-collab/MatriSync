# MatriSync
MatriSync software developed by Team UNCODED for the Healthathon 2026

## Phase 1 meeting demo

Responsive React/TypeScript PWA with three role workspaces, read-only synthetic records, separate Guest sessions, and Firebase email/password Authentication. No deployment is configured or performed.

### Run

Requirements: Node 22+ and pnpm. From this repository directory:

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173/. Keep the terminal/server running. For a production PWA preview:

```sh
pnpm build
node scripts/serve.mjs
```

Open http://127.0.0.1:4173/. On the development Windows machine, `Start-MatriSync.ps1` starts the existing production build in the background and opens it. Run it from PowerShell in this folder. It does not install packages or deploy anything. For offline demonstrations use the **production preview**, visit online once, wait for the service worker to install, then reload before disconnecting. Development mode does not install a service worker.

### Account setup

Copy `.env.example` to `.env.local` and fill the four Firebase web configuration variables using the intended project. Restart the dev server or rebuild after changing configuration. Keep `.env.local` ignored. This checkout has the owner-supplied configuration locally; it is not committed. The app imports only `firebase/app` and `firebase/auth`, initialized on account use, with session-scoped Auth persistence. No service-account key belongs in frontend variables.

The supplied project was inspected on 20 October 2026: active, billing disabled, email/password provider enabled. No project settings were changed. Its existing authorized domains include localhost. Successful live signup/login/logout has not yet been verified with a real account. The UI displays useful errors if a request fails; no simulated authentication success is used.

### Demo scope and storage

Choose any role and use **Continue as Guest**. All health content remains synthetic even after account login. Role selection grants no professional or facility privilege. Guest mutable state uses only `matrisync.demo.*` sessionStorage keys and memory. Reset restores defaults; Exit Guest clears all these keys and reloads the public selector, preventing leftover Auth/background state. Account transition clears Guest first. A blocked-storage fallback explicitly warns that reload persistence is unavailable. Normal new tabs are separate; duplicate/restore behavior is browser-dependent.

The public service worker precaches an explicit build-generated asset allowlist. It never caches auth requests, navigation responses, mutable Guest state, or records supplied by a user. Deep links receive the same public static shell. Updates wait until the user selects **Update now**; the next activation removes obsolete MatriSync shell caches.

### Checks

```sh
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

The browser suite uses installed Microsoft Edge. It starts a production preview automatically and checks enabled/disabled account controls according to the build's configuration. Tests never submit live account credentials. Missing-configuration behavior was also tested before local Firebase values were supplied.

Optional Auth emulator suite (prepared, currently unverified): start the official Firebase Auth emulator with project `demo-matrisync`, then run `pnpm exec playwright test --config playwright.auth.config.ts`. The test app overrides all project values in memory and points only to loopback. `firebase.json` configures only this local emulator. The CLI failed to start on the implementation machine due to package-resolution errors, so no emulator pass is claimed.

See [meeting walkthrough](docs/MEETING-WALKTHROUGH.md), [capabilities and deferred roadmap](docs/CAPABILITIES.md), and [verification evidence](docs/VERIFICATION.md). Screenshots are in `docs/screenshots/`.

### Structure and branding

- `src/main.tsx`: shared shell, role flows, screen components, accessible native dialogs.
- `src/data.ts`: synthetic fixtures, role navigation, future-module descriptions; provisional tagline in one place.
- `src/session.ts`: validated session-only Guest store.
- `src/auth.ts`: lazy Auth initialization, session persistence, safe error copy.
- `src/theme.css`: exact supplied Medical Green semantic tokens for light/dark.
- `scripts/build-sw.mjs`: versioned public-shell allowlist.
- `docs/branding/MatriSync-approved-original.png`: supplied artwork, unchanged. PWA derivatives preserve proportions and alpha; maskable image has safe padding.

“Every Mother. Every Step.” remains configurable provisional copy pending final acceptance. Language preferences include English, Bengali, Kannada, Hindi, Marathi; unavailable reviewed translations explicitly fall back to English. No translation service is called.

Reference implementation behavior follows [Firebase session persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence) and [MDN tab storage semantics](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage).
