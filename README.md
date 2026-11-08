# MatriSync — Health-a-thon 2026

Live application: https://matrisync-c9de7.web.app

**DEMO / NOT FOR CLINICAL USE.** MatriSync is a maternal-record and referral-continuity prototype by Team UNCODED. Choose a workspace, then **Continue as Guest** to explore the fictional case without creating an account. Workspace selection does not confer clinical authority.

## Verified public demo

- Three existing role workspaces: Mother, Healthcare Professional and Healthcare Organization.
- Ophelia Frost (`MAT-DEMO-001`) linked to Dr. Olivander Woods (`DOC-DEMO-001`).
- Six read-only medication records with separate prescription/administration times, a separate pending PRBC request and a chronological 15-event timeline.
- Referral status from the supplied fictional case; dynamic structured handoff, downloadable two-page PDF, print view and a framed 2,827-byte `.msht` demo package.
- MatriSathi basic conversations, navigation and exact demo-fact read-back. Scripted replies are explicitly labelled **Not generative AI**. Optional local inference is a separate feature requiring a model download.
- All three investigation references preserve missing-data labels. The source ultrasound and blood reports for Ophelia are unavailable; no results or administering personnel were invented.

## Boundaries

The Guest referral is a supplied event, not confirmed dispatch, clinical approval, patient arrival or receiving-facility acceptance. The demo package is plaintext fictional data; it is not encrypted, has not been written to NFC, and does not fit the user-tested 48-byte tag. The reference firmware is not verified for the user's existing ESP32 WROOM / PN532 V2.2 bridge. Do not flash it as part of software setup.

Guest data remains isolated in the tab. Do not enter real medical information. Signed-in functionality includes prototype encrypted local records and connected structured-care code; the public Guest verification does not certify a live multi-account clinical journey. Original uploaded files remain local in that MVP. Production authorization rules were not changed for this release. Mothers and facility administrators are not given permission to author prescriptions.

Future controls retain **Coming Soon** labels. Inventory and other synthetic previews do not represent real stock, appointments, credentials or service transactions. Public facility verification, recovery, physical NFC/BLE acceptance and clinical validation remain incomplete. Optional model inference and full offline patient workflows were not revalidated on the public site in this release. Vite reports large optional AI/runtime bundles.

## Development and tests

Use Node.js and pnpm. The lockfile pins the existing dependencies.

```sh
pnpm install --frozen-lockfile
# Copy .env.example to .env.local and supply the intended Firebase WEB app config.
pnpm dev
pnpm test
pnpm lint
pnpm build
pnpm preview
```

`pnpm build` (or `npm run build`) now runs TypeScript and the production pipeline with the same `VITE_CARE_ENABLED=1` and `VITE_SHARING_PILOT=0` settings for Vite and the release verifier. It generates `dist` and a content-versioned service worker. Do not publish `build:submission`: that historical script is an emulator-only developer build.

The Firebase web config is client configuration, not a service-account credential. Never put service-account JSON, private keys, provider secrets or CLI refresh tokens in source or any `VITE_*` variable. `.env.local`, local tooling, caches, build output and logs are excluded from Git.

Current release checks: 116 unit tests in 30 files passed; ESLint and production build passed. Public browser checks cover homepage, direct routes for all three roles, medication records, handoff generation, PDF/package downloads and five MatriSathi prompts with no captured browser warnings/errors. The downloaded PDF was parsed and both pages rendered and inspected. See `docs/PUBLIC-RELEASE-2026-11-07.md` for the verification boundary. Historical test documents describe earlier runs, not current certification.

## Update the SAME Firebase Hosting URL

Existing Firebase project/site: `matrisync-c9de7`. Billing was verified disabled during this release. No paid service is required for static Hosting.

```sh
pnpm test
pnpm lint
pnpm build
firebase login:list
firebase deploy --only hosting --project matrisync-c9de7
```

Use an authenticated Firebase CLI with access to the existing project. Do not create a replacement project or deploy Firestore/Storage rules as part of a Hosting update. Verify https://matrisync-c9de7.web.app in a fresh browser, test direct routes and exports, and check the offered **Update now** prompt in an already-open PWA. `index.html` and `sw.js` have no-cache headers; fingerprinted assets and a content-derived shell cache keep releases distinct. Retain the prior working Hosting release if verification fails.

## Source provenance

Development repository: https://github.com/olivanderwoods-collab/MatriSync

Recovered branch: `handoff/matrisync-codex-2026-11-05`, commit `1de3742496d1b0ed9ffb970b1de8f8ce9673be0e`. The original repository and its history are preserved. The verified release continues on the existing development branch in this repository. Local environment files, credentials and development caches are not published.

Current source and submission repository (confirmed 8 November 2026): https://github.com/olivanderwoods-collab/MatriSync

