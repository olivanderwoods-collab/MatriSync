# Completed handoff recovery — 8 November 2026

Continuing source: https://github.com/olivanderwoods-collab/MatriSync, branch `handoff/matrisync-codex-2026-11-05`. Base release commit: `11753f8cba30b14e4883f238c88a02ca2d4158a6`. Keep the submitted app at https://matrisync-c9de7.web.app. Do not merge or force-push main.

## Change

Signed-in connected care previously lost a prepared outgoing handoff after reload and could leave the old patient's form/preview visible after the patient selector changed. Completed outgoing handoffs now retain the original minimal patient snapshot, entered fields, attribution, timestamp, destination and exact framed recipient packet, encrypted with the browser's existing device key. Append-only keys keep outgoing handoffs separate from profile copies and received receipts. Reopening the patient through the existing load/offline controls restores the latest locally saved original. It does not create another cloud entry.

Patient selection clears the old view, draft, recipient, receipt popup, credentials and preview immediately. Account/workspace changes remount the care screen. Reloaded summaries can be printed without refreshing staff membership; creation and BLE controls still require loaded Doctor membership, and backend authorization remains authoritative. Restored output retains its original recorded details rather than applying later profile edits. Offline copies are labelled as potentially out of date.

Local saving occurs only after the atomic cloud batch confirms. If browser storage fails afterward, creation remains reported as successful with a clear offline-recovery warning. Repeating creation is explicitly described as a separate handoff. This is completed-handoff recovery, not a durable pending-send queue or an exactly-once cloud retry protocol.

## Verification and limits

Final checks passed: 125 unit tests across 32 files, ESLint without warnings, TypeScript, production build and build-mode exclusions. Large-bundle advisory warnings remain. The recovery-fixture identifiers are absent from dist. Hosting-only deployment to the unchanged site completed, with shell cache `afd70326ca14`. Public index.html, sw.js, main JavaScript and all three care chunks returned HTTP 200 and matched the tested build byte-for-byte; index and service worker use no-cache.

The public browser loaded the homepage and Professional Guest workspace. A retained service worker offered Update now; accepting it preserved the Guest session and the linked Ophelia profile. The patient overview and timeline rendered correctly afterward, with no captured browser errors or warnings. This confirms that specific retained-client update, not every old-client/device upgrade path. Firebase rules, Auth users and live clinical data were not changed.

Nine added regression tests cover encryption at rest, exact packet recovery, original snapshot retention, account/patient isolation, immutable completed records, substituted storage keys, cloud/local commit ordering, local quota failure, cloud rejection and capacity failure. The isolated browser checks are reproducible in `tests-care/RECOVERY-CHECKS.md`. They use real browser encryption/IndexedDB and a mocked network/auth boundary; no live users, patient data or permissions are changed by the fixture.

This update does not reconstruct handoffs created before it was installed. Recovery requires a successfully saved copy on the same browser/account/device; clearing storage, losing keys or crashing between cloud confirmation and local saving can prevent recovery. Only the latest local completed handoff is exposed in the existing preview; older copies remain stored. Local read access does not prove current facility authorization. Physical BLE/NFC, the 48-byte tag integration and a live authenticated multi-account journey remain unverified. Missing clinical values and original report files remain missing.

The repository's standard build and checks remain unchanged. On this Windows sandbox, pnpm's automatic dependency check attempts a forbidden symlink; direct equivalents are `node node_modules/vitest/vitest.mjs run`, `node node_modules/eslint/bin/eslint.js .`, `node node_modules/typescript/bin/tsc -b`, and `node scripts/build-production.mjs` after the frozen-lockfile dependency installation. No dependency or lockfile change is required.
