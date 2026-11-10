# Isolated authenticated recovery import

Later 10 November continuation: read `RECOVERY-EXPORT-2026-11-10.md` first. Read-only source selection/export and actual care-storage compatibility fixtures now pass 168 recovery tests. Received referral snapshots preserve their legitimately unknown server timestamps. The next slice is emulator-only authenticated verifier authorization; public recovery remains unavailable.

Development after the Health-a-thon 2026 submission date. Original repository/main; submitted URL remains https://matrisync-c9de7.web.app. Read this before `RECOVERY-CLOSURE-2026-11-10.md` and older recovery checkpoints.

## Implemented scope

`tests-care/recovery-import.ts` implements an isolated encrypted receiver for selected structured records. It consumes an immutable approved outcome from the existing test verifier. Pending, cancelled and rejected recovery operations cannot start an import. Account, request digest, exact decision digest, original/target fingerprints, target public keys and selected case scope must match. Current source authority and selected-case access are checked during begin/stage/finish and immediately before each changed transaction commits. Sign-in/authority remain trusted synthetic adapters, not production authentication or a deployed service.

A source-device ES256 signature authenticates the complete manifest. Manifest and object envelopes use ECDH-ES/A256GCM to the target device with distinct purpose headers. The receiver enforces the approved limits: 100 selected cases, 1,000 objects, 8 MiB total raw object bytes. Manifest metadata is capped at 1 MiB, manifest envelope at 3 MiB, object envelope at 16 MiB. Empty/duplicate identifiers, duplicate destination slots, unknown fields/kinds, unapproved cases and invalid/overflowing lengths fail closed. Each selected case must have at least one object. A selected manifest is immutable for its operation; exact retries reuse its original signature bytes.

Only `profile`, `outgoing`, `receipt`, `draft` and `pending` structured objects are accepted. Strict readers check their account/patient/storage identities, allowed fields, existing referral/profile fields, contributor roles/identities and recorded timestamps. File/attachment kinds and extra attachment fields are rejected. The receiver does not enumerate or transfer original PDFs/photos, generate missing clinical information, prescribe, or interpret clinical text. This is a structural allowlist, not an assertion that arbitrary text stored by an authorized source has been clinically audited.

Original raw JSON bytes remain unchanged. No whitespace trimming, summary regeneration, packet re-encoding, time replacement or signature replacement occurs. Receipt `snapshotOnly` and verification history are retained; import time is separate. Pending objects must contain the exact original `matrisync-care+jws` signature matching their saved value and original signing identity. They are published only with `quarantined: true`; the model has no send/retry/clinical approval API and never places them into the app's normal pending slot.

## Staging and completion

Received objects remain in a separate encrypted staging session. Each is checked against the manifest's object ID, case, kind, source storage slot, exact byte length and raw SHA-256 digest, then its structured content is validated. Staged records cannot be read through the published-record API. Missing objects prevent completion. Failed validation leaves the already-staged set intact for the same operation.

Before completion, the receiver validates every staged object again and checks all destination slots. Any differing existing record, including a newer draft, causes the entire publication to fail without overwriting or silently merging either version. Identical existing records can be reused. One SQLite transaction publishes all selected records and one immutable completion receipt together; a crash cannot expose some new records without the completion marker. Source records are untouched.

After completion, the target signs an acknowledgement bound to the operation, both fingerprints, manifest digest and exact completion-receipt digest. The signature is verified against the target public key before being stored. Repeated or concurrently requested acknowledgements return the exact original signature. A source-side helper verifies that signature and its bindings; it performs no deletion or retirement. An incomplete transfer cannot be acknowledged. Historical completion/acknowledgement and already-published local records remain readable after revocation, following the existing offline policy; new imports and new staged writes require current authority.

### Frozen candidate encodings

Domain: `matrisync-isolated-recovery-contract-v1:import-v1`. Canonical values use UTF-8 JSON. Manifest case IDs and descriptors are sorted, with descriptors ordered by transport object UUID. Exact stored object bytes are **not** normalized.

```
Manifest signature:
[domain, "manifest", 1, operationId, uid, requestDigest, decisionDigest,
 sourceKeyId, targetKeyId, sortedCaseIds,
 [[objectId, caseId, kind, sourceStorageId, rawByteLength, rawSha256], ...]]

Acknowledgement signature:
[domain, "ack", operationId, uid, sourceKeyId, targetKeyId,
 manifestDigest, completionReceiptDigest]
```

`decisionDigest` and receipt/manifest digests use the verifier's existing JSON-value hashing helper. Object `rawSha256` hashes the actual byte array, not its JSON/base64 representation. Transport object IDs are separate from preserved clinical IDs/revisions. The manifest signature has `typ: <domain>:manifest`; encrypted manifest/object wrappers use `<domain>:manifest-envelope` and `<domain>:object-envelope`; acknowledgement uses `<domain>:ack`. Signature headers are exactly `alg`, `typ`, `kid`. Encrypted headers are exactly `alg`, `enc`, `typ`, `kid`, `epk`; unsupported additional headers fail closed.

Object plaintext wrappers contain only `version`, `id` (recovery operation), `manifestDigest`, `objectId`, and canonical base64url `encoded` raw bytes. Completion receipts contain only `version`, `id`, `uid`, `targetKeyId`, `manifestDigest`, `objectCount`, and `completedAt`. The receipt represents the selected signed set, not a promise that all records ever held on the original browser were selected. The current test signing helper does not enumerate a source browser or prove a user reviewed that selection.

## Storage separation and compatibility

The proven encrypted SQLite transaction implementation is now a reusable generic adapter. Its existing `SqliteRecoveryStore` wrapper retains **exactly approval-store v2**, its AAD and 8 MiB aggregate limit; all 92 prior tests pass. Import uses a separate database and authenticated domain `<import-domain>:sqlite-v1:<storeId>`, with a 32 MiB aggregate cap allowing staging plus published base64 representations of a full 8 MiB transfer. This remains a bounded single-aggregate test model, not production multi-case storage capacity planning. Additional imports can exhaust the aggregate; it fails rather than deleting history automatically.

The approval database, app's legacy IndexedDB slots, Firestore grants and source objects are not migrated or overwritten. Original private keys remain non-extractable. Child-process acceptance tests create disposable extractable **target test keys** only so private fixture inputs can travel through IPC; the worker reimports them non-extractably. No keys are passed on command lines or written to the database/logs. This is not a production key-export/recovery mechanism. Storage-key custody, backups and protection against restoring a valid older database snapshot remain unresolved as documented previously.

## Actual checks on 10 November 2026

- **139 recovery tests passed**: the preceding 92 contract/durability/closure tests plus **47 import tests** with real signatures/encryption and SQLite persistence.
- Import coverage: exact preservation of all five structured kinds; incomplete-set invisibility; closed/unapproved operations; wrong signer/account/device; changed operation/request/decision/key bindings; unknown/excluded fields/kinds; duplicate IDs/slots; unauthorized cases; omitted signed descriptors; tampered object bytes/metadata; wrong record account/patient; extra original-file fields; invalid and substituted pending proofs; newer destination draft conflicts; exact retry and changed-manifest rejection; immutable target acknowledgement and verification; canonical encoding and raw hash fixture; count/size overflow; 1,000-descriptor boundary; actual **8 MiB raw payload encryption, staging, atomic publication and byte-equal read-back**; staged-data revalidation; account/device read isolation; authority/scope/key/clock changes before commit; retained offline reads after revocation.
- Independent child-process checks cover fresh-process begin/stage/finish/acknowledge, abrupt process exits before and after object save/publication/acknowledgement, all-or-none published records, competing completion/acknowledgement processes, lost responses, rollback on injected disk/quota failures and encrypted on-disk content. Quota failure is injected; it is not a browser IndexedDB quota measurement or disk power-loss certification.
- The first full-boundary assertion used a deep equality assertion on an 8 MiB typed array and exhausted the test worker heap. Replacing that assertion with direct `Buffer.equals` byte comparison let the exact same transfer complete under the normal runtime limit. The focused boundary rerun and final full suite passed; no heap-limit increase or payload reduction was used.
- **166 existing application tests / 36 files passed**, plus strict verifier/tests and application TypeScript, lint and production build. Existing large-bundle advisories remain. The production exclusion guard passed.
- Production cache remains `a46bbe8bc699`, main bundle `assets/index-BvlrKePh.js`. **Sixteen live static files and four HTTP route shells matched** the tested build. No redundant Hosting deployment for these isolated non-UI changes. No production records/users/invitations/grants/rules or hardware changed.

The prior continuation's real emulator browser key-preservation and actual public Update now checks remain dated evidence, not new reruns here. No new public authenticated acceptance, care/rules emulator journey or physical BLE/NFC test is claimed. Private evidence: `.local-tools/import-2026-11-10-{tests,unit,build}.log`, `import-boundary-2026-11-10.log`, and `import-2026-11-10-live-verification.json`.

Reproduce: `node node_modules/vitest/vitest.mjs run --config vitest.recovery.config.ts`, then `node node_modules/typescript/bin/tsc -p tests-care/tsconfig.recovery.json`. No new dependencies, credentials or emulators are required. Child workers bundle with the already-installed esbuild. Tests use disposable directories under `.local-tools`; successful runs remove only their own directory.

## Next slice and limits

Next implement a **read-only source selection/export adapter and legacy-format compatibility tests in isolation**. Build manifests from explicitly selected, exact saved structured objects rather than caller-assembled descriptors. Exercise the existing care-storage writers/readers with synthetic records to establish actual legacy shapes, empty optional fields, historical timestamps, receipts, cleared/newer drafts and original pending proofs. Unsupported/ambiguous versions must fail visibly without altering the source. Keep source selection explicit, originals excluded and imported pending operations quarantined. Validate preserved grants/keys as data only; no new clinical authority comes from importing a record.

The current receiver handles synthetic current-shape objects; it is **not yet connected to a real browser export/import UI or proven against the full historical store corpus**. The app's normal `decodePending` remains unchanged and cannot consume quarantined objects as retryable approvals. A separate reviewed migration/read adapter is still necessary before any production integration. Then design/review service authorization and restrictive grant rules, followed by non-production two-browser acceptance. No verifier deployment, production enablement, public facility bootstrap, billing, new navigation/UI, original-file transfer or hardware work is implicitly authorized.
