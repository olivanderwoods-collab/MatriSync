# Durable compact selection approval — 11 November 2026

Development after the Health-a-thon 2026 submission date.

Read this before `NFC-DICTIONARY-2026-11-10.md`. This slice makes the existing Doctor compact-selection approval durable on the original browser. It does not authorize or implement a new NFC write, cloud referral, offline receiving grant, key migration or physical hardware operation.

## Implemented

- The existing **Approve compact selection** action now saves the exact reviewed selection in a separate encrypted browser store. A new immutable record retains account/patient/proposed-referral IDs, original identity/provenance, the full entered source including explicitly excluded fields, canonical included-field order, exact binary bytes, dictionary version, source and selection SHA-256 digests, device-recorded approval time and previous approval ID.
- Each record is signed with the original enrolled device's ES256 key and encrypted to that device with the existing ECDH-ES/A256GCM helpers. There is no key creation fallback. Source hashing uses a domain-labelled canonical ordered JSON representation, so large excluded source does not need to fit the compact binary limit. Local encrypted records are capped at 1 MiB; included binary remains capped by the existing codec.
- Reload reads and verifies the saved record, signature, identity, digests and reconstructed binary. It never creates a packet, signs, approves, sends, enrolls a key or mutates a source draft automatically. Missing/corrupt rows or missing original keys are errors, not triggers to reset data.
- An atomic IndexedDB transaction appends the encrypted record and advances the account/patient head only if the previous head still matches. Competing tabs cannot overwrite a newer approval. Account/source guards run before and after writes; transaction abort rolls both changes back. Exact retry of the same approval after uncertain completion returns the original unchanged record. A different record under the same ID is refused. Older approvals remain stored; the UI displays the latest saved approval, and the storage reader supports exact historical IDs.
- The existing compact review now contains a **Saved compact approval** disclosure showing original provenance and included/excluded source text. Newer source edits trigger a difference message and remain separate. Preparing another selection uses a new proposed referral ID after an approval or uncertain attempt. No added tabs, roles, clinical inference, auto-send, background sync or file transfer.
- The existing Professional/active-Doctor placement and pending-connected-handoff lock remain. This local signature proves the saved device key signed these bytes; it is **not** server verification of the clinician/facility's current authority. No Firestore rules or production records changed.

## Storage and security boundary

New DB: `matrisync-compact-approvals-v1`, stores `records` keyed by `[uid,patientId,approvalId]` and `heads` keyed by `[uid,patientId]`. Account/patient/approval routing identifiers are plaintext IndexedDB keys, as in existing care storage; clinical source, source hashes and encoded content are inside ciphertext. Existing care/sharing stores and pending approvals are not migrated or rewritten. Private device keys remain in their existing non-extractable storage.

The approval is local documentation. Its proposed ID is not an already-created cloud referral. A saved approval can exceed the verified tag capacity and the UI continues to say so. The head/previous-ID chain is concurrency control, not tamper-proof freshness against an attacker who can roll back all local state. Key loss, browser storage eviction, cross-device recovery, production revocation and trusted clock time remain unresolved. Device-recorded timestamps are not a server timestamp.

No NFC key-provisioning or travel-device custody was added. Physical tag capacity remains 48 verified bytes; A/B/C protocol and measured 168/345-byte synthetic sample sizes are unchanged. No full offline receiving authorization, physical write success, replay prevention or completed MatriVitals logger is claimed. The new saved-approval source/digest schema was not previously released; no existing production record format is migrated.

## Actual verification

- **213 application tests across 38 files passed**: 202 existing plus 11 durable-approval tests. New checks cover encrypted storage, exact reload/retry, immutable prior versions, two-tab serialization, source/binary/hash tampering, account/case/anonymous isolation, missing keys without enrollment, substituted/missing records, transaction rollback on changed source/session, synchronous click snapshot and large excluded Unicode provenance. Existing care retry, codec, legacy BLE and packet suites passed unchanged.
- Application TypeScript, full ESLint and whitespace checks passed. Documented production build and fixture-exclusion checks passed; existing large-bundle advisory remains.
- Actual Edge on isolated `http://127.0.0.1:4189`: explicit synthetic key preparation, exclusion, encrypted approval save, reload/reopen with original ID/time/excluded source, newer source warning with original retained, and second-tab stale approval refusal passed. Real IndexedDB and crypto; account boundary is an explicitly synthetic alias, not Firebase authorization acceptance. The later canonical source-hash change and large-source case passed the final automated suite; the browser run used the preceding digest representation. No new emulator/rules run is claimed for this local-storage change.
- Reproducible developer fixture: `node scripts/nfc-approval-fixture.mjs`. It bundles only the synthetic page with an explicit test Auth alias, serves fixed static assets on loopback port 4189, and blocks network connections with CSP. It has no admin/RPC/cloud/device endpoint and is excluded from the production build. `tests-care/nfc-review-page.tsx` remains a preview-only fixture.
- Private evidence: `.local-tools/compact-approval-2026-11-11-{unit,build}.log` and `compact-approval-reload-2026-11-11.png`. Release/live verification is recorded in the root handoff once publication completes.

## Changed files

`src/nfc/approval.ts`, `approval-storage.ts`, `approval.test.ts`, `compact-review.tsx`; `scripts/nfc-approval-fixture.mjs`; `tests-care/nfc-approval-auth.ts`, `nfc-approval-page.tsx`, `nfc-review-page.tsx`; this document and root continuation guides. The pre-existing five unfinished recovery-journey/transport files remain uncommitted and untouched by this slice.

## Next slice

Define and test an isolated Section C commit/generation/recovery model against every interrupted block write, with independently authenticated A/B and no borrowing of reserved blocks. The model must distinguish a complete old record from proof of the expected new generation and require exact physical readback before reporting write success. In parallel planning, specify authenticated per-referral A/B key provisioning and authoritative receiver/logger grants without a universal key or new bootstrap authority. Keep these isolated until reviewed and hardware memory/protocol evidence is available. Received-section provenance and its public UI come after that binding/freshness contract; do not render a valid old ciphertext as a current verified journey.
