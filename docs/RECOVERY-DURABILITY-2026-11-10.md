# Isolated recovery durability and browser acceptance

Later 10 November continuation: read `RECOVERY-CLOSURE-2026-11-10.md` first. Signed cancellation/rejection and transaction races are now implemented in isolation (92 recovery tests). SQLite storage advances to v2 and refuses v1 without modification; no migration or public service is enabled. The next slice is authenticated manifest staging/import, not another durability investigation.

Development after the Health-a-thon 2026 submission date. Original repository/main; submitted URL remains https://matrisync-c9de7.web.app. Read this before the earlier `RECOVERY-VERIFIER-2026-11-10.md` checkpoint.

## Implemented scope

The isolated Candidate A verifier now accepts a transaction store. The default memory adapter preserves the existing contract tests; `tests-care/recovery-sqlite.ts` supplies an encrypted local SQLite adapter for synthetic persistence tests. Neither adapter is a public recovery service or part of the browser build. No Firebase tokens, production grants, case imports, device retirement, recovery UI or paid services were introduced.

The adapter stores the request, secret challenge, exact proof bytes, immutable decision and proposed epoch in one authenticated encrypted aggregate. AES-256-GCM uses a fresh nonce per changed aggregate and binds ciphertext to the isolated protocol, storage version and caller-provided store ID. The 32-byte store key is supplied separately, copied on construction and never persisted in the database. Tests provision disposable keys in memory and send synthetic worker inputs through IPC, not command-line arguments or logs. Restart recovery requires the same intact database, store ID and key; production key custody and backup are not implemented.

Creation is explicit and exclusive. Reopening a missing database, missing aggregate, unknown version, invalid ciphertext or wrong key fails without initializing a replacement. The aggregate is limited to 8 MiB. Reads do not rewrite ciphertext. SQLite uses a rollback journal, FULL synchronization and one immediate transaction across reading, verification and updating. Separate processes contend for the same database lock; bounded asynchronous retries cover connection configuration, transaction start and commit. Timeouts tell callers to retry the same operation.

The final synchronous authority/scope/expiry callback runs immediately before each commit attempt, including after the SQL write. A changed synthetic authority rolls the transaction back. The callback remains a trusted test adapter; it is not a cross-service atomic permission check or Firebase authentication implementation. A real service needs an authoritative transaction model before this contract can become a security boundary.

After a commit, a lost response is reconciled from the original operation, decision time, proof bytes and epoch. A repeat with changed proofs conflicts. Equivalent concurrent approvals yield one decision; different operations cannot issue separate epochs for the same account/target key. Existing care packets, draft revisions, receipt snapshots and legacy enrollment records are untouched. The verifier's `counts()` helper is now asynchronous because it reads through the transaction store.

Uses the already-installed Node 24.22.1 runtime and its built-in SQLite module; no dependency was added. API reference: [Node.js SQLite documentation](https://nodejs.org/docs/latest-v24.x/api/sqlite.html). This single encrypted aggregate and test-process architecture is intentionally bounded and not a scalable production backend.

## Actual checks on 10 November 2026

- **48 recovery tests passed:** the existing 26 signature/permission contract cases plus 22 durable cases. Durable tests cover exact request/receipt reopening in another process; thrown errors after SQL writes; abrupt child-process exit before and after commit for both request creation and approval; eight processes released from a common start barrier; different-operation duplicate-epoch prevention; same-request challenge races; independent connections in one event loop; bounded busy failure/retry; revocation/scope/expiry changes between SQL write and commit; encrypted database and rollback-journal contents; wrong key/store binding; corruption, missing state and unsupported versions; exclusive creation; aggregate capacity rollback; account isolation; changed-proof rejection; and revoked authority after restart.
- The first concurrency run found a real gap: connection configuration could return a lock error outside the retry loop. The fix covers configuration and commit as well as BEGIN. Ten targeted repeated race runs then passed; the final full suite also passed with coordinated child-process starts.
- **166 application tests / 36 files passed**. Strict verifier/tests TypeScript, application TypeScript, ESLint and the production build passed. Existing large-bundle advisories remain. The production exclusion guard passed.
- Production output remains byte-identical: cache `a46bbe8bc699`, main bundle `assets/index-BvlrKePh.js`. Sixteen live static files and four route shells matched. No redundant Hosting deployment was made for test-only changes.

These are abrupt process termination and SQLite transaction rollback checks, not physical power-loss, disk-controller failure, malicious database snapshot rollback, lost storage key, filesystem compromise or production failover certification. Encryption detects modification/wrong binding; restoring a valid older database snapshot is not prevented by this adapter. Database and key custody are trusted test infrastructure.

## Previously blocked browser checks completed

Browser access was available in this continuation. The existing `tests-care/device-fixture.html` ran against real local demo-matrisync Auth/Firestore emulators on loopback, using one freshly generated synthetic account and the actual CarePage with no network mocks.

1. The fixture enrolled its original key and the normal care-access refresh completed.
2. Detaching only that synthetic account's key and refreshing showed the original-browser guidance, explicitly stating that recovery is not available and no existing key was replaced.
3. Inspecting after two refresh attempts still reported **Local identity: absent**.
4. Reattaching the same retained original test CryptoKeys removed the warning; refresh completed and inspection reported **Local identity: original**.
5. No warning/error console entries were captured for this fixture or the public page. The test services were stopped afterward.

The actual public app opened from its retained cache and displayed **A new version is ready / Update now**. Clicking Update now reloaded the normal landing page and removed the banner. The resulting DOM loaded the current `assets/index-BvlrKePh.js` bundle. Screenshots captured the missing-key state, restored original identity and updated public app. This closes the prepared enrollment-browser and latest cached-update checks; it is not authenticated public multi-account acceptance or actual cross-device key recovery.

Private evidence: `.local-tools/durable-2026-11-10-{tests,unit,build}.log`, `durable-2026-11-10-live-verification.json`, `durable-device-missing-2026-11-10.jpg`, `durable-device-restored-2026-11-10.jpg`, and `durable-public-updated-2026-11-10.jpg`. No production accounts, patient data, invitations, rules or hardware were changed. The earlier three automated care emulator journeys and 14 rules cases were not rerun for this isolated storage slice; the browser fixture used the real local emulators as described above.

## Reproduce and continue

Run `node node_modules/vitest/vitest.mjs run --config vitest.recovery.config.ts` and `node node_modules/typescript/bin/tsc -p tests-care/tsconfig.recovery.json`. The durability suite bundles its child worker using the existing esbuild dependency into a disposable directory under `.local-tools`; no server or credentials are needed. It removes only its own resolved temporary directory after testing.

Next implement explicit cancellation and terminal rejection semantics in the isolated verifier, including signed original-device authorization, exact-operation reconciliation and cancellation-versus-approval races. Define which failures are terminal and which remain retryable; an unauthenticated or malformed attempt must not be able to cancel another request. Keep completed approval evidence immutable. Then implement authenticated manifest staging/import tests from `DEVICE-MIGRATION-SPEC-2026-11-10.md`, preserving original packets and quarantining pending operations rather than sending or re-signing them.

Public verifier authority/hosting, key custody, grants/rules migration, device retirement, actual two-browser transfer and independent protocol review remain unresolved. Do not deploy the isolated adapter, enable billing, add public recovery controls, mint claims or invent a facility bootstrap authority. Physical BLE/NFC remains a separate later task; only 48 tag bytes have been verified.
