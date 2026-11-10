# Isolated recovery cancellation and rejection

Later 10 November continuation: read `RECOVERY-IMPORT-2026-11-10.md` first. The isolated manifest receiver, encrypted staging, atomic publication and acknowledgement now pass 139 recovery tests. Next is a read-only source selection/export adapter and actual legacy-format compatibility fixtures; no production recovery is enabled.

Development after the Health-a-thon 2026 submission date. Original repository/main; submitted URL remains https://matrisync-c9de7.web.app. Read this before `RECOVERY-DURABILITY-2026-11-10.md`.

## Implemented contract

The isolated verifier now supports a signed `close` command with either `cancelled` (withdraw this request) or `rejected` (explicitly decline this request). Both require the authenticated account input to match the request and a valid signature from the original enrolled device. A target-device signature or login alone cannot close it. Current original identity, active authority and request lifetime are checked before writing and again immediately before commit. Case scope is not required to decline a request: closing grants no case access and creates no epoch. Authentication/authority inputs remain trusted synthetic adapters, not production Firebase token validation.

Only an explicit valid close command creates a terminal cancellation/rejection. Malformed inputs, bad signatures, foreign accounts, permission failures, expired requests, capacity failures and failed transactions do not create a rejection record or poison another valid request. An expired pending request remains without a committed outcome; its ID cannot be reused to extend its lifetime. A later attempt needs an explicitly created new request. There is no automatic cleanup, cancellation, retirement or administrative override.

| Existing state | Submitted operation | Result |
| --- | --- | --- |
| Pending, live, currently authorized | Valid approval | One immutable approved decision and epoch |
| Pending, live, currently authorized | Original-device cancellation/rejection | One immutable closed receipt; no epoch |
| Approved | Exact approval retry | Original receipt, including after expiry/revocation |
| Approved | Any closure | Refused; approval and grants are not revoked |
| Cancelled/rejected | Exact same close command | Original closed receipt, including after expiry/revocation |
| Cancelled/rejected | Changed proof/status, approval or same-ID request reopening | Refused; terminal evidence remains unchanged |
| Any state | Foreign account | Refused without changing state |

Approval and closure use the same transaction store, so competing processes cannot both commit. The first committed outcome wins; the loser must reconcile the original operation. A failed pre-commit operation leaves it pending. A lost response after commit is recovered using the original command bytes and immutable receipt timestamp. Returning historical receipts does not grant fresh access.

## Exact candidate encoding and storage compatibility

`Closure = {id, status, proof}` contains only those fields. Status is exactly `cancelled` or `rejected`; ID must be a UUID. Maximum command size is 16 KiB; maximum proof size is 8 KiB. The original ES256 proof has exactly the protected headers `alg`, `typ`, `kid`; `typ` is `${RECOVERY_DOMAIN}:${status}` and `kid` is the original fingerprint. Canonical payload bytes are UTF-8 JSON of:

```
[RECOVERY_DOMAIN, "close", 1, operationId, uid, requestDigest,
 originalKeyId, newKeyId, expiresAt, status]
```

The immutable closed receipt contains `version`, `status`, `id`, `uid`, `requestDigest`, `oldKeyId`, `newKeyId`, `decidedAt` and `proofDigest`. As with the prior contract, the proof digest hashes UTF-8 JSON encoding of the exact token string. Original offer, challenge and signed command are retained inside encrypted storage. No clinical packet, snapshot, private device key or original uploaded file is rewritten or transferred.

`reconcile` now returns an approved or closed outcome (or undefined for a known pending request). Callers must narrow by status before reading an approval's epoch/cases. The diagnostic `counts().decisions` still counts approved decisions only; it is not a total terminal-outcome count.

The isolated SQLite format advances to **user_version 2**, with authenticated context `...:sqlite-v2:<storeId>`. The previous adapter requires version 1 and therefore refuses the new store instead of ignoring closure state. The new adapter also refuses version 1 without modification. There is no silent conversion, overwrite or destructive reset. Existing v1 artifacts would require a separately implemented explicit migration; the synthetic tests create disposable v2 stores. Application IndexedDB, Firestore rules and deployed care formats are unchanged. The prior storage-key-custody and malicious-snapshot-rollback limitations still apply.

## Actual verification

- **92 recovery tests passed**: 54 in-memory cryptographic/contract cases and 38 durable cases. This retains the previous 48 tests and adds 44 cancellation/rejection cases.
- New checks cover both closure statuses; account/original-key enforcement; invalid schemas, bounds, purposes, identifiers and signed payloads; replay into another operation; expiry/backwards/invalid time; authority changes before commit; unchanged approvals; exact-byte retries and caller mutation isolation; new requests after closure without reserving an epoch; no-case decline; deterministic ordered races; coordinated independent-process approval/closure and cancellation/rejection races; eight simultaneous same-command closures; actual child-process exits before/after committing each status; SQL rollback; permission/identity/expiry changes after SQL write; encrypted closure storage and refusal of old storage versions.
- **166 existing application tests / 36 files passed**. Strict verifier/tests and application TypeScript, lint and the documented production build passed. Existing large-bundle advisories remain.
- Production output remains cache `a46bbe8bc699`, main bundle `assets/index-BvlrKePh.js`. Sixteen live static files were byte-equal to the tested build and four HTTP route shells matched. The isolated verifier remains excluded from production; no Hosting redeploy is needed for identical assets.

The preceding continuation's real emulator browser missing-key/original-key check and actual public cached Update now pass remain valid dated evidence; they were not rerun for these isolated non-UI changes. No new public authenticated acceptance, care/rules emulator-suite rerun or physical hardware check is claimed. No production users, records, keys, grants, rules, invitations or hardware changed.

Reproduce with `node node_modules/vitest/vitest.mjs run --config vitest.recovery.config.ts` and `node node_modules/typescript/bin/tsc -p tests-care/tsconfig.recovery.json`. Private logs: `.local-tools/closure-2026-11-10-{tests,unit,build}.log` and `closure-2026-11-10-live-verification.json`.

## Next slice

Implement **authenticated manifest validation and durable staging/import tests in isolation**, following `DEVICE-MIGRATION-SPEC-2026-11-10.md`. Bind the manifest to the approved operation, both device identities, selected cases, exact object kinds/IDs, byte lengths and hashes. Reject altered/omitted/duplicate/oversized objects and cancelled/rejected operations. Publish completion only after one atomic complete-import marker. Preserve original clinical packets, proofs, timestamps and newer-draft conflicts. Imported pending handoffs stay quarantined and are never automatically sent or re-signed. Uploaded originals remain excluded. Preserve all source records after acknowledgement.

Keep limits at 100 selected cases, 1,000 objects and 8 MiB per operation unless a later approved specification changes them. Test interruption, restart, rollback, wrong account/patient/device, changed scope, duplicate acknowledgement, pending-proof preservation and original-file exclusion. No public recovery UI, verifier deployment, production grants, billing, bootstrap authority or hardware work is implicitly authorized. Actual two-browser recovery and independent protocol/security review remain incomplete.
