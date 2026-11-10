# Browser recovery boundary checkpoint — 10 November 2026

Development after the Health-a-thon 2026 submission date.

Source/test commit: `0f4501e6b8d35b65ecd10b789d21663704708c75`. Read this before `RECOVERY-AUTHORIZATION-2026-11-10.md`, then export/import/closure/durability/verifier history. The public application remains at `971e01f759058e8964cacc2b137be0f0a5b67d91`, https://matrisync-c9de7.web.app, cache `a46bbe8bc699`, main bundle `assets/index-BvlrKePh.js`.

## Completed separation

`tests-care/recovery-protocol.ts` now holds the browser-safe canonical claims, byte encoding, hashes and shared types. The original verifier re-exports the existing contract API for server/test compatibility, but the browser entry does not import the verifier. Canonical claim order, scope sorting, domain, purpose bindings and hashes are unchanged. A frozen synthetic fixture captured from pre-separation commit `68436156c88b46df7f5c6d0e25f9d3c1cfacaaea` checks exact request, possession, approval, cancellation and rejection bytes/hashes independently of the extracted implementation. Its placeholder public points are deliberately not usable devices or patient data.

`tests-care/recovery-databases.ts` owns the Node-only `ImportDatabase` and `ExportDatabase` classes. Their encrypted SQLite formats, keys, associated data, schema versions, capacities and decoding are unchanged. Import/export tests and process workers now import persistence from this module explicitly. Do not restore a database re-export from a browser module: it would reconnect the Node dependency graph.

`recovery-import.ts` and `recovery-export.ts` now depend on `RecoveryTransactionStore<Row>` and `RecoveryReconciler` interfaces. The transaction contract requires isolated draft state, serialized conflicting operations, immediate pre-commit checks, atomic publication and rollback on failure. An interface does not itself provide those guarantees. Existing SQLite implementations retain them; a durable browser implementation is still required. No memory-only test store should be presented as durable recovery storage.

`tests-care/recovery-browser.ts` is the explicit entry point for a **future isolated browser fixture**. It exposes protocol helpers, crypto/record validation, import/export engines and read-only source selection. It exposes no verifier, privileged Auth lookup, emulator owner access, SQLite database, initialization command or automatic transfer. Importing the browser bundle does not access a database, enroll keys, initialize Auth or make network calls. The source exporter still requires the current explicit account/source-selection checks when actually called.

The esbuild plugin in `scripts/recovery-browser-boundary.mjs` rejects Node builtins and privileged verifier/database/emulator/worker/identity-service imports, including nested and unused imports, while building that fixture. The new tests build the entire browser entry, inspect its real dependency graph and execute the resulting bundle in a separate JavaScript realm with Web APIs and **without Node globals**. They also build the real public app entry graph and verify that no isolated recovery/test or identity-service modules enter it. The existing production asset verifier continues to exclude the recovery contract marker. Use this plugin when building the later fixture; it is not a replacement for runtime endpoint authorization or deployment review.

## What the bundle tests exercise

- Existing-server/browser claim interoperability and frozen pre-separation canonical bytes/hashes.
- Actual ECDH encryption, ES256 signing, manifest verification, original non-extractable keys and signed completion acknowledgement.
- Partial staging stays invisible; attempting completion while incomplete fails.
- Reopening the receiver against the same **in-memory fixture store**, restaging exact duplicates, an injected pre-commit failure and an explicit retry preserve atomic publication.
- Original formatted JSON, Unicode, whitespace, blank fields, packet strings and pending proof bytes round-trip unchanged. Pending handoffs remain quarantined and are never submitted.
- Account mismatch, corrupted envelopes and changed authority are refused.
- The complete browser bundle imports with no network/database side effects; privileged imports fail at build time; the public app remains separate.

This is browser-targeted bundling and JavaScript-realm execution, **not a rendered browser, browser restart, browser IndexedDB durability, two-device transfer or public recovery acceptance**. Export source/storage compatibility remains covered by the preceding real-crypto/fake-IndexedDB tests. The new realm fixture exercises the import engine, not an authenticated browser export journey.

## Concurrent transaction test correction

The authorization rerun exposed a too-strong test expectation: it required at least one of two simultaneous Firestore approvals to succeed immediately. The emulator can abort **both** with `ABORTED: Transaction lock timeout`. The documented boundary intentionally does not automatically replay ambiguous/conflicting operations. The corrected test accepts only explicit ABORTED failures, reconciles the operation, explicitly retries the same approval if no decision exists, and verifies that all successful calls/retries return the one immutable receipt. Unexpected errors still fail the test. No recovery runtime behavior was weakened or changed for this correction.

## Actual verification

- **181 isolated recovery tests passed**: 168 preceding tests plus **13 browser-boundary tests**. Existing SQLite process-crash/race, import/export and full-payload checks were rerun.
- **37 real Auth/Firestore emulator authorization tests passed** after the concurrency-test correction. Combined current recovery coverage is **218 tests** across two commands.
- **166 application tests / 36 files passed**, strict recovery/application TypeScript, full lint and the documented production build passed. The existing large-bundle advisory remains.
- Sixteen public static files and four HTTP route shells are byte-equal to the tested build. No Hosting redeploy for identical application assets. No production rules, grants, users, records, files or hardware changed.
- Three care integration journeys and 14 care/record rules tests passed in the immediately preceding authorization slice; they were not rerun in this extraction slice. Historical sharing rules on port 8087 and rendered-browser/Update now checks were not rerun here.

Reproduce with `node node_modules/vitest/vitest.mjs run --config vitest.recovery.config.ts`, then with the local demo emulators running `node node_modules/vitest/vitest.mjs run --config vitest.recovery-emulator.config.ts`. Strict types: `node node_modules/typescript/bin/tsc -p tests-care/tsconfig.recovery.json`.

Private evidence: `.local-tools/browser-boundary-2026-11-10-{recovery,authorization-final,unit,build}.log` and `browser-boundary-2026-11-10-live-verification.json`. The earlier failing authorization log is retained separately as `browser-boundary-2026-11-10-authorization.log`. All dependencies were reused.

## Next slice

Implement isolated encrypted browser persistence for the import/export transaction interfaces before the two-browser fixture. Use separately named databases and explicit initialization, account/device/domain binding, bounded encrypted aggregates and conflict detection. Preserve original app databases, original non-extractable keys and exact records. Missing, unsupported, corrupted or conflicting state must fail without replacement/reset. Do not hold an IndexedDB transaction open across arbitrary asynchronous crypto/network work: prepare outside it and atomically compare the saved revision before publication. Verify interrupted writes, quota failures, lost completion responses, reload/restart, conflicting tabs and immutable receipts/acknowledgements. Pending values must stay quarantined in separate storage.

After that, connect an explicit loopback-only fixture transport to the existing emulator authorization adapter, using the browser-boundary build guard. The transport must authenticate from the emulator token rather than a caller-supplied UID, reject unexpected origins/hosts and never expose an owner credential to browser code. Real original-to-new-browser acceptance must cover cancellation, staging/resume, source preservation, account/device isolation and no automatic handoff sending. No production service, public UI, rules/grants/claims changes, billing or bootstrap authority are authorized implicitly.

Remaining boundaries from the authorization checkpoint persist: unsigned emulator tokens do not establish production login authenticity; Auth revocation is not atomic with Firestore; export/import authority callbacks remain synthetic; Mother unrestricted full-case recovery is refused pending narrower object scope. Production identity/revocation, key custody, reviewed grant migration, device retirement, retention and independent protocol review are unresolved. Physical NFC/BLE and flashing remain separate later work.
