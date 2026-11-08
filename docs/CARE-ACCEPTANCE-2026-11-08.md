# Connected-care acceptance and receipt preservation — 8 November 2026

Base release: `7e5245f64c930ccb575276e76a18a4edeaa9fc99` on `handoff/matrisync-codex-2026-11-05` in https://github.com/olivanderwoods-collab/MatriSync. Keep the submitted application at https://matrisync-c9de7.web.app and preserve main.

## Fixed failure

The new real-emulator journey reproduced a receipt regression: scan a handoff offline, check the same packet online, then rescan offline. Previously, each scan overwrote the receipt, replacing its original receive time and discarding its successful online-verification status.

Receipt storage now keeps the first saved snapshot/time and records a successful online check separately as `verifiedAt`. Later offline scans retain that evidence. A compare-and-write transaction prevents concurrent tabs from losing the check. A repeated handoff ID with different patient details or clinical entries is rejected while the original receipt stays intact. Legacy verified receipts keep their verification without inventing a missing timestamp. Popups and receipt lists describe the check as historical, not current offline authorization. Existing authorization rules and navigation remain unchanged.

## Acceptance

- 128 unit tests / 32 files passed, including concurrent rescans, conflicting receipt content and legacy timestamp preservation.
- 10 current care/record Firestore rules tests / 2 files passed against the emulator. They verify role restrictions, immutable contributions, scoped queries and revocation.
- One nine-account end-to-end client integration journey passed with real Firebase Auth and Firestore emulators, real care-client calls, encryption/signatures and fake-indexeddb persistence. Only the browser online flag/location and IndexedDB environment are substituted; Auth, Firestore, rules and clinical operations are not mocked.
- The journey covers two invited facilities, six assigned staff and one separately registered Mother; prevents duplicate local-profile registration; rejects unassigned staff reads and Mother/admin/non-doctor prescription creation; records all six staff contributions; rejects undersized/corrupt handoffs; preserves encrypted outgoing packets and receipts; opens offline basic details then an authorized full profile; unlocks Mother access with the issued code; rejects the wrong code; blocks revoked staff's new access while retaining previously saved offline data.
- Actual browser fixture uses real IndexedDB/device encryption with mocked account/network calls. Its receipt list and reopened popup retained first-received and checked-online times after an offline rescan, without captured browser warnings/errors. This complements the real-emulator client journey; it is not a nine-browser-account UI test.
- ESLint and TypeScript passed. Production build and build-mode exclusions passed; test identifiers are absent from dist. Existing large-bundle advisory warnings remain.
- Hosting-only deployment succeeded at the unchanged Firebase project/site `matrisync-c9de7`. Shell cache: `06dd3b3027c8`.
- Public index.html, sw.js, main JavaScript and all three care chunks returned HTTP 200 and matched the tested build byte-for-byte. Index and service worker returned no-cache. The retained public Guest client offered Update now; after activation its rendered script was the new `index-BygGRwOn.js`, the Guest session remained, and the existing referral summary generated correctly with no captured browser warnings/errors.

The initial broad rules invocation also selected four historical sharing-pilot suites requiring a separate emulator on port 8087; those suites could not start because that emulator was absent. The supported current care/record suites were then explicitly selected and passed. No claim is made that all historical sharing-pilot suites were rerun successfully.

## Reproduce safely

Use Java 21+ and Firebase CLI. Start only local test services with `firebase emulators:start --only auth,firestore --project demo-matrisync --config firebase.json`; the existing config binds Auth to 127.0.0.1:9099 and Firestore to 127.0.0.1:8086. On this Windows environment, the existing portable Java runtime and `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=` were needed. No new dependencies were installed.

Run `pnpm test:care:integration` and `pnpm test:rules:care`, or their direct Node equivalents from package.json. The integration configuration overrides .env.local with demo-matrisync and loopback endpoints and asserts those settings before signup or invitation seeding. Invitations are seeded with the emulator-only owner authorization; this helper must never be adapted to production. Each run uses randomized synthetic accounts and references. It does not clear live or shared databases or delete real users. Stop the disposable emulator process when done.

For browser reproduction see `tests-care/RECOVERY-CHECKS.md`. The normal production build excludes all fixtures and emulator configuration.

## Remaining boundary

This is a synthetic prototype. No live facility invitation, real patient, Auth user, Firestore rule or Storage resource was changed by this work; deployment was Hosting only. Full authenticated acceptance on the public Firebase service, device/key recovery, an exactly-once pending-send protocol and physical ESP32/PN532 integration remain unverified or unfinished. Earlier missing reports and clinical values remain missing. Preserved receipt verification does not prove current permissions, clinical review, NFC writing or receiving-team acceptance.
