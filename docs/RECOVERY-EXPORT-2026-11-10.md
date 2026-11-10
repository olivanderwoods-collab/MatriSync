# Isolated read-only recovery source export

Development after the Health-a-thon 2026 submission date. Original repository/main; submitted URL remains https://matrisync-c9de7.web.app. Read this before `RECOVERY-IMPORT-2026-11-10.md` and earlier recovery checkpoints.

## Implemented

`tests-care/recovery-source.ts` reads explicitly selected slots from the existing `matrisync-care-v1` / `copies` store, scoped to the signed-in account. It reads the original device from the existing sharing database without invoking key enrollment. Both databases must already exist at version 1; missing/unsupported databases are refused, not initialized, upgraded, downgraded or replaced. Every source transaction is readonly. No document/file database is opened.

Source review returns only the selected storage identities and SHA-256 digests of their exact encrypted values. The selection must contain 1–1,000 unique supported slots covering at most 100 cases. Supported slots are the profile UUID, `outgoing:<case>:<handoff>`, `receipt:<case>:<handoff>`, `draft:<case>` and `pending:<case>`. Unknown prefixes, extra metadata, malformed IDs and attachment/file slots fail closed. This is an isolated programmatic selection contract; no public selection/review UI has been introduced.

`tests-care/recovery-export.ts` requires the immutable approved recovery operation, matching original saved device, target keys and selected case scope. Current source identity, active authority, account session and case assignments are rechecked immediately before the separate export-store transaction commits. Pending/rejected operations, wrong/anonymous/signed-out accounts, missing keys and different enrolled keys cannot prepare data. As before, verifier authority is a trusted synthetic adapter and is not yet a production server identity/permission boundary.

All selected encrypted records are captured in one readonly IndexedDB transaction. Sequential request callbacks enforce a 16 MiB aggregate ciphertext limit before accumulating an unbounded set. Each ciphertext must match its reviewed digest; missing, substituted or re-encrypted records require review again, even if the plaintext might be equivalent. The adapter decrypts with the retained original key, checks the existing envelope purpose/device, validates each structured record and preserves the exact plaintext bytes. The total raw payload remains limited to 8 MiB.

The exporter derives object kinds, case IDs, source slots, lengths, hashes and transport UUIDs itself. Callers cannot supply a descriptor claiming another patient or record kind. It then creates the source-signed manifest and target-encrypted envelopes and saves the complete package in a **separate encrypted SQLite export database** before returning any package. The source stores remain unchanged.

One immutable package is retained per recovery operation. Exact selection retries (including reordered selection input) return the same manifest, signature, transport IDs and object ciphertexts from that store. A different selection conflicts. A lost response after commit is recoverable without regenerating signatures. If a draft changes after a package has already been prepared, the original approved package is retained and the newer source draft stays untouched. Before preparation, a changed reviewed source prevents export. Interrupted/pre-commit writes roll back the package without changing source records.

The separate export store uses authenticated context `<import-domain>:export-sqlite-v1:<storeId>`, user version 1 and a 32 MiB encrypted aggregate cap. It reuses the tested SQLite transaction adapter. It does not change the verifier's v2 format or the receiver's separate v1 format. Storage keys remain caller-supplied test infrastructure; no production key-custody, retention or backup service has been introduced. Accumulated packages can exhaust the bounded store; there is no automatic deletion of history.

## Compatibility correction found by examining the existing client

The actual `receiveCareHandoff` implementation deliberately stores `serverAt: ""` for an original referral snapshot because the server timestamp is unknown. The previous isolated import validator rejected all empty server timestamps. It now accepts that exact existing shape only when `snapshotOnly === true`, the entry kind is `referral`, and the entry ID matches the saved handoff ID. The empty value stays empty; no timestamp, clinical fact or verification is invented. A full/non-snapshot profile with an empty server timestamp remains rejected by this reader.

Compatibility fixtures call the **existing care-storage writers/readers**, using real encryption and non-extractable keys with `fake-indexeddb`. Account authentication alone is mocked; these tests do not claim a real Firebase login or browser engine. The fixtures verify:

- Full saved profiles, original outgoing framed recipient packets, received referral snapshots, unfinished drafts and signed pending values round-trip byte-for-byte through source export and isolated receiver.
- Missing profile details and optional referral fields remain absent; blank destination/capacity and original whitespace/Unicode text remain exact.
- Receipt first-received time and a later verified time survive subsequent offline rescans and export.
- A cleared draft revision marker produced by `clearCareDraft` survives; a confirmed pending record produced by `confirmPendingCareHandoff` retains its original proof and is still quarantined at the receiver.
- Current `readCareCopy`, `latestCareHandoff`, `careReceipts`, `readCareDraft` and `readPendingCareHandoff` still read the source unchanged after transfer. The receiver never inserts quarantined values into the normal pending slot.

This covers the recorded current v1 care-storage formats and specific older optional/receipt/draft semantics. It is not certification of every historical database or corrupted real account. Unknown versions/fields and ambiguous or invalid timestamps fail without rewriting the source. Source case-key/grant strings are preserved as data; importing them does not independently create a server grant or prescribing authority.

## Actual checks on 10 November 2026

- **168 recovery tests passed**: the preceding 139 plus **29 source-export/compatibility tests**.
- New checks cover actual writer/reader round trips; exact source ciphertext preservation; original non-extractable keys; receipt rescans and timestamps; cleared/confirmed state; explicit subset selection; changed revisions and ciphertext after review; lost-response recovery and later source edits; pending/rejected recovery operations; account/anonymous/sign-out isolation; absent/different keys; absent source databases; unsupported database versions; readonly transaction instrumentation; excluded slots/duplicate/extra choices; absent records; queued input mutation; substituted patient ciphertext; scope/assignment restrictions; unsupported object version/attachment fields/patient/time; invalid blank timestamp outside a snapshot; account/authority/disk failure before commit; concurrent package preparation and encrypted on-disk content.
- **166 existing application tests / 36 files passed**, strict verifier/tests and application TypeScript, lint and the documented production build passed. A test spy's iterable parameter type needed correction during implementation; the final type check passed. Existing large-bundle advisories remain.
- Public cache remains `a46bbe8bc699`, main bundle `assets/index-BvlrKePh.js`. Sixteen live static files and four HTTP route shells matched the tested build. No redundant Hosting deployment for identical assets. The isolated modules remain excluded from production.
- Existing recovery process-crash/concurrent-process tests were rerun as part of all 168 checks. The new exporter tests use independent SQLite connections and response/write failure injection, not a separate browser/process source-export journey. That distinction remains a later acceptance boundary.

No production users, patient records, invitations, rules, grants or hardware changed. No new real Firebase emulator journey, rendered browser or public Update now rerun is claimed for this isolated non-UI slice; prior browser evidence remains dated. Private logs: `.local-tools/export-2026-11-10-{tests,unit,build}.log` and `export-2026-11-10-live-verification.json`.

Reproduce with `node node_modules/vitest/vitest.mjs run --config vitest.recovery.config.ts` and `node node_modules/typescript/bin/tsc -p tests-care/tsconfig.recovery.json`. Dependencies are reused; no new packages or credentials were required. Synthetic databases and keys are isolated, and successful test cleanup removes only its own generated directory.

## Next slice

Design and implement an **emulator-only authenticated verifier authorization boundary** before exposing any recovery UI. Replace caller-supplied identity/authority assumptions with verified demo Auth identity plus authoritative device, facility/staff and per-case permission reads. Bind permission rechecks and immutable decisions to a concrete transaction strategy, and test revocation/concurrent authority changes, forged IDs/roles, wrong project/audience, wrong device and lost-response recovery. Reuse the original signature and immutable-operation contract; do not relax it for an authenticated UID. Use only the local demo-matrisync emulators and existing dependencies. Do not deploy a service or modify production rules/grants/claims/billing or bootstrap authority.

Before actual two-browser acceptance, split browser-compatible record/crypto helpers from Node-only persistence and connect only an isolated non-production fixture. The current source/export/import modules deliberately live under tests-care; they are not an enabled app workflow or user-ready recovery feature. Production hosting/authority/key custody, reviewed grant migration, device retirement, actual two-browser testing and independent protocol review remain unresolved. Keep original uploads local, original sources intact and pending imports quarantined. No physical hardware work is authorized implicitly.
