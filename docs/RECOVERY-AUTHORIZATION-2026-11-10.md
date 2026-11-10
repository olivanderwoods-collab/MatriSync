# Isolated recovery authorization checkpoint — 10 November 2026

Development after the Health-a-thon 2026 submission date.

Source/test commit: `7226bcebd377c52520a774ca8a347691c8318405`. Read this before `RECOVERY-EXPORT-2026-11-10.md` and the preceding import/closure/durability/verifier documents. The application remains at `971e01f759058e8964cacc2b137be0f0a5b67d91`, live at https://matrisync-c9de7.web.app, cache `a46bbe8bc699`, bundle `assets/index-BvlrKePh.js`.

## What is implemented

`tests-care/recovery-emulator.ts` adds an isolated adapter around the existing original-device recovery contract. There is no HTTP listener, browser integration or production configuration. All network destinations are fixed to `127.0.0.1`, Auth port 9099 and Firestore port 8086, project `demo-matrisync`. Redirects are refused. It uses existing dependencies and no production credentials. Emulator owner access is only local test infrastructure; it is not a new facility bootstrap authority.

Request, approval, closure and reconciliation now derive the account from the supplied emulator ID token and an actual Auth account lookup, rather than accepting a caller-provided authenticated UID. Checks include the exact project/audience/issuer, password provider, token times, account identity, disabled state and valid-since time. Unknown body role/authority/project fields are rejected by the existing exact schemas. Input is copied before the first asynchronous step. Original-device approval and target-device possession signatures remain mandatory; login alone cannot approve recovery.

**Auth emulator tokens are unsigned.** The tests explicitly demonstrate that a re-encoded unsigned token for an existing account is accepted by the emulator. Account lookup and claim checks therefore do not establish production cryptographic login authenticity. Never expose this adapter as a production service or describe it as production JWT verification. See the [official Auth emulator documentation](https://firebase.google.com/docs/emulator-suite/connect_auth).

The adapter reads `careDevices`, active `careFacilities` / `careStaff`, each selected `careCases` document and its account-specific `careAccess` document from Firestore. Facility assignments and staff roles come from stored authority, not the body. Doctors, nurses and lab staff may recover only currently assigned cases under an active facility; an active facility account also needs its own assignment. The grant identity, case and facility must match. These are recovery/read permissions, not authority to prescribe or create new grants.

Mother full-case recovery is deliberately refused in this adapter: the current case-wide recovery contract cannot express Mother's narrower record-kind permissions. Approving an unrestricted clinical case would exceed her existing prescription/report visibility. A future Mother recovery slice must define and test an explicit restricted object scope before enabling it. This restriction does not change the Mother app, data or existing access rules.

## Atomic authority and durable decisions

Each operation uses one real Firestore read/write transaction. It reads the encrypted account aggregate and required device/facility/staff/case/access documents, runs the unchanged cryptographic verifier, and commits the resulting aggregate in that same transaction. Firestore's transaction read set makes a concurrent change to any read authority document conflict with the decision. Tests actually change staff, facility, assignment and device documents between proof validation and commit; each attempted approval fails and leaves no decision.

The aggregate contains original offers, challenge nonces, proofs and immutable approved/cancelled/rejected outcomes, retaining the same one-target/one-operation semantics. It is AES-256-GCM encrypted with a separate caller-supplied 32-byte test storage key, random nonce and associated data binding the recovery domain, format `emulator-v1`, project and account. The plaintext limit is 512 KiB per account, conservatively below Firestore's document size limit after base64 encoding. This is a new isolated storage format, not an upgrade or replacement of the SQLite v2 stores. Keys are not persisted beside ciphertext; production key custody, retention, capacity management and emulator export/import are not implemented.

Explicit `initialize` is a create-only fixture provisioning step. Normal operations refuse missing, unsupported, damaged or undecryptable state; they do not reset it. Existing client rules deny ordinary client reads and writes to the isolated collection. No rules were changed. No enrolled device, case, access grant, source record or attachment is written by normal recovery operations.

Auth lookup is repeated immediately before commit, but Auth and Firestore are separate services: this does **not** establish atomic account-disable/revocation across them. The atomic claim applies only to Firestore authority and the decision. A production design still needs signed-token verification, a reviewed account/session revocation strategy and server custody/authorization review.

There is no automatic transaction replay. Failures, including ambiguous commits, propagate to the caller, who must reconcile the same operation. An actual successful commit followed by injected transport-response loss was recovered as one immutable receipt, without generating a new challenge/proof/decision. A known aborted operation can be retried explicitly. Exact approved retries after later staff revocation return historical receipts; they do not assert current access or create new authority. Fresh approvals remain permission checked. Concurrent calls may fail with a conflict and require explicit reconciliation; this is intentional.

The REST transaction behavior follows the documented [beginTransaction](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/beginTransaction), [batchGet](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/batchGet) and atomic [commit](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit) contract.

## Actual verification

- **37 new real-emulator authorization tests passed**, with synthetic Auth accounts and authoritative Firestore fixtures. These cover three staff roles, assigned facilities, forged body metadata, invalid token claims, missing original approval, two-account isolation, disabled accounts, revoked/reassigned access, wrong devices, Mother full-case refusal, changes during the decision transaction, last-minute Auth disable, response loss, pre-commit rollback, stable challenges, unassigned scope, duplicate target prevention, concurrent calls, terminal cancellation, wrong storage keys, damaged state, denied client access and the unsigned-token limitation.
- **168 existing recovery tests passed**, including durable process-exit/race tests and exact original data/export/import preservation. Combined recovery coverage is **205 tests**, using separate commands below.
- **166 application tests / 36 files passed**.
- **Three real connected-care integration journeys passed**, including the nine-account journey, Organization/Mother pairing and immutable record review, and missing/different browser-key protection.
- **14 current care/record rules tests passed**. Expected denied writes appear in logs. Historical sharing rules on port 8087 were not run.
- Strict recovery and application TypeScript, full lint and the documented production build passed. The existing large-bundle advisory remains.
- Sixteen live static files and four route shells were byte-equal to the tested build. No Hosting redeploy was needed because application assets are unchanged. No new rendered-browser or cached Update now test is claimed; prior browser evidence remains dated in the durability/record documents.

Private evidence is in `.local-tools/authorization-2026-11-10-{integration,recovery,unit,care,rules,build}.log` and `authorization-2026-11-10-live-verification.json`.

Reproduce with the existing local demo emulators running, then `node node_modules/vitest/vitest.mjs run --config vitest.recovery-emulator.config.ts`. Existing isolated tests use `--config vitest.recovery.config.ts`; strict types use `node node_modules/typescript/bin/tsc -p tests-care/tsconfig.recovery.json`. Run care journeys and rules sequentially because rules fixtures may clear the local test database. No production data is involved.

## Next slice

Separate browser-compatible recovery crypto/record helpers from Node-only SQLite/emulator persistence, without changing claims, canonical bytes, original records or quarantined pending semantics. Add import-boundary tests proving browser entry points do not pull Node modules or the privileged emulator adapter into distributable assets. Then prepare an isolated non-production two-browser fixture with an explicit, loopback-only transport; do not connect public app recovery or deploy a verifier. Actual original-to-new-browser acceptance must include encrypted staging, restart/retry, account isolation, cancellation, original source preservation and pending-handoff quarantine.

The exporter and receiver still receive their own synthetic current-authority callbacks; this slice binds the **verifier** to real emulator account/authority reads. Do not claim that it atomically authorizes export/import or migrates real grants. Connecting those independent boundaries, Mother object scope, production signed identity/revocation, custody, grant migration, device retirement, retention and independent protocol review remain unresolved. No physical NFC/BLE or hardware flashing is part of this slice. Original files stay local; imported pending handoffs must never be automatically sent or re-signed.
