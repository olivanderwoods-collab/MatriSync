# Isolated encrypted browser storage — 10 November 2026

Development after the Health-a-thon 2026 submission date.

Source/test commit: `79c184ff5cc9066a3b8c4d21e49aa15b543c00a5`. Read this before `RECOVERY-BROWSER-BOUNDARY-2026-11-10.md`, then authorization/export/import history. The deployed application remains `971e01f759058e8964cacc2b137be0f0a5b67d91`, https://matrisync-c9de7.web.app, cache `a46bbe8bc699`, bundle `assets/index-BvlrKePh.js`.

## Implemented

`tests-care/recovery-indexeddb.ts` implements the existing transaction interface with separate `BrowserImportDatabase` and `BrowserExportDatabase` adapters. The browser entry exports them; the public app does not import them. No production UI, verifier, grant migration, network service, clinical workflow or hardware was enabled.

Database names bind kind, account UID, original/target device fingerprint and explicit store UUID: `matrisync-isolated-recovery-<import|export>-v1:<uid>:<deviceKeyId>:<storeId>`. Each contains only `keys` and `state` stores. Explicit initialization creates both stores and their first values in the version-change transaction; concurrent initialization has one winner. Existing initialization is refused. Normal operations require an existing version-1 database with the expected schema and both saved values. Missing, unsupported, damaged or undecryptable state is refused without resetting or replacing keys/data. Source application databases are never opened by these adapters.

The aggregate is AES-256-GCM encrypted with a random 12-byte IV and non-extractable 256-bit Web Crypto key, retained through IndexedDB structured cloning. The key record has its own random UUID. Associated data binds the import domain, browser format, full database name, account, device, store UUID, aggregate revision and key ID. Copying ciphertext **and its key** into another account/device/store/kind fails authentication. The aggregate cap is 32 MiB of UTF-8 plaintext, matching the existing isolated import/export aggregate cap. No history is automatically deleted when the limit is reached.

The locally retained key is not an off-device backup or protection against compromised same-origin JavaScript. A script with access to the origin can use that key; non-extractability does not prevent use. Identifiers/revisions are metadata. Clearing browser storage loses this isolated store and its key; no fallback/replacement/re-enrollment is introduced. Whole-store malicious rollback, backup retention, disk-loss recovery and key custody remain outside this adapter's guarantees.

Each operation reads and closes an IndexedDB snapshot transaction, decrypts/validates and prepares the new aggregate outside that transaction, then opens a short read/write transaction over both stores. It compares the saved key ID, revision, IV and ciphertext to the original snapshot before applying any write. A competing writer causes a conflict, not silent replacement. The caller's guard runs before writing and again after write success; failures abort the transaction. A strict durability hint is requested. The adapter resolves only after `oncomplete`, not after an individual request. It never automatically replays callback work. A lost response after commit is reconciled by reopening the same store/operation.

This follows the IndexedDB transaction-lifetime constraints documented in [IDBTransaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction) and the durability options in [IDBDatabase.transaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction). Browser implementation and operating-system storage guarantees still apply; a strict hint is not a claim of tested power-loss resilience.

Unchanged reads preserve ciphertext and revision. Existing source/export/import engines retain exact original bytes, signatures, packet strings, receipt/acknowledgement semantics, and pending quarantine. The storage binding is not clinical authorization: the engines still require their existing authority checks. Export/import authority callbacks remain synthetic at this stage.

## Verification completed

- **210 isolated recovery tests passed**: the preceding 181 plus **27 storage tests and 2 actual export/import integration tests**. Existing process-crash and full 8 MiB payload tests also passed for their existing SQLite adapters; do not present those as browser power-loss or browser full-payload acceptance.
- New storage tests cover fresh adapter reads with retained non-extractable keys, unchanged reads, missing/replaced/corrupted state, wrong account/device/store/kind binding, initialization races, interruption before commit/after write, simulated quota errors, oversized aggregates, lost completion response, permission guard denial, asynchronous crypto/work, competing writers, explicit retry, no automatic replay and unsupported database versions.
- Actual existing care-storage writers feed the export engine using `BrowserExportDatabase`, with a deliberately lost export response. A fresh adapter returns the identical saved package. `BrowserImportDatabase` then preserves every source record byte, receipt and acknowledgement; pending proofs remain quarantined and the source ciphertext and original device stay unchanged. This integration uses real crypto and fake IndexedDB with mocked account auth, not real login.
- A regression check changes the source account after the browser write request succeeds; the repeated guard aborts and leaves no export package. The final 210-test suite includes this guard change.
- **166 application tests / 36 files**, strict recovery/application TypeScript, full lint and the documented production build passed. The existing large-bundle advisory remains.
- Sixteen public static files and four route shells matched the built files byte-for-byte. No Hosting redeployment for identical app assets. No production data, rules, grants, accounts or hardware changed.
- The preceding **37 real-emulator authorization tests**, three care journeys and 14 care/record rules tests were not rerun in this browser-storage slice. They remain dated preceding-slice evidence. Historical sharing suites on port 8087 were not run.

## Actual browser evidence and limits

`node scripts/start-recovery-storage-fixture.mjs` serves a guarded static fixture at `http://127.0.0.1:4191/`, bundled through the browser import guard. It rejects unexpected Host, Origin and non-GET requests; CSP disallows network connections. It exposes no privileged RPC or credentials. All authority and records are explicitly synthetic. Its separate `matrisync-isolated-storage-fixture-v1` database retains synthetic expected values and target keys for comparison after reload; it must never receive real patient information. The fixture is not deployed or linked from the public app.

Real Edge checks passed for run `37e7366d-5cef-46b2-bd9d-121897715fe4`:

1. Prepared an encrypted partial import; no records became visible.
2. Reloaded the page; original non-extractable target keys and staging survived; premature completion was refused.
3. Injected an interruption after the write request; publication rolled back. Injected a lost response after commit; the same completion was recovered with exact bytes and pending quarantine.
4. Reloaded again; saved receipt and signed acknowledgement were unchanged and verified.
5. Used two actual tabs on the same fixture run. One held stale work while the other committed. The stale writer was refused and the winning record remained intact without replay.

No browser warnings/errors were observed. Screenshot `.local-tools/browser-storage-2026-11-10-conflict.jpg` records the actual successful competing-tab result. An initial full-page screenshot timed out; a subsequent viewport capture succeeded. This was page reload and same-browser tab testing, **not a full browser/OS restart, physical device transfer or an authenticated two-browser migration**.

After those browser checks, the final change added a second account/authority guard after write success and two automated engine integrations. The final automated checks passed. An attempted additional browser recheck was refused because browser access had become disabled in Work settings; do not claim that the final extra guard was separately exercised in the rendered browser. Do not repeatedly ask the user to test developer builds. The fixture server was stopped.

Private logs: `.local-tools/browser-storage-2026-11-10-{focused,recovery-final,unit,build}.log`, plus `browser-storage-2026-11-10-live-verification.json` and the screenshot above. Reproduce all isolated tests with `node node_modules/vitest/vitest.mjs run --config vitest.recovery.config.ts`; strict types use `node node_modules/typescript/bin/tsc -p tests-care/tsconfig.recovery.json`.

## Next slice

Connect an explicit loopback-only, non-production fixture transport to the existing emulator authorization adapter and browser persistence. Keep owner access server-side, derive identity from the emulator token, reject unexpected hosts/origins, bound request sizes and use the original recovery operation/proofs. Do not expose an authenticated-UID parameter as authority or trust a caller's roles. Preserve uncertain-outcome reconciliation rather than auto-approval/replay. The transport is only an emulator test harness; unsigned emulator tokens still cannot establish production identity.

Prepare a complete original-to-new-browser fixture with explicit review/approval, cancellation, encrypted source export, staged destination import, interruption/reload, current authority checks and source preservation. Reuse the durable browser stores and import guard. Original uploads remain local; pending values stay in quarantine and never enter the app's normal retry slot. Validate the final repeated guard in a rendered browser when access is available. No browser testing should be delegated to the user.

Production signed identity/revocation, atomic cross-service revocation, actual export/import authority integration, restricted Mother object scope, key custody, reviewed grant migration, device retirement, retention and independent protocol review remain unresolved. No public recovery UI/service, production rules/grants/claims changes, billing, facility bootstrap authority or physical NFC/BLE work is implicitly authorized.
