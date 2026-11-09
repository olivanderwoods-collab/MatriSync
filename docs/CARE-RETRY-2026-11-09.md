# Approved handoff recovery and compact transfer — 9 November 2026

This is development **after the Health-a-thon 2026 submission date**. Repository: `olivanderwoods-collab/MatriSync`, branch `main`, same Hosting site `matrisync-c9de7`. The fresh continuation began at documentation commit `1085a62c0064940a8e1cdb73c9b7679bb7e243ae`, whose ancestor is tested application commit `e85eac12a8790d08eaf119f85c78acc219ca6208`. Original checkouts and production records were preserved.

## Implemented recovery

An explicit Doctor approval now has a stable ID derived from account, patient and saved draft revision. Before any cloud write, the app signs and encrypts a durable pending operation containing the original recipient packet, fields, profile snapshot, identity, timestamp, destination and entry/grant ciphertext. IndexedDB compare-and-write prevents another tab from silently replacing it. A local-save failure blocks submission.

The existing approval action checks authoritative server evidence first. An exact immutable handoff/entry match confirms the original operation. Missing-entry evidence permits a transaction only while current permissions, source identity, recipient key and receiving facility still match. Permission-denied and unavailable handoff reads are not treated as proof of absence. The transaction serializes competing tabs and never updates an existing referral/handoff to make a retry work. Existing append-only rules are unchanged.

A lost response followed by unavailable reads leaves the approval pending. Reload only restores it: no automatic send occurs. The same action becomes “Check / retry approved handoff”. Pending fields are locked to the approved snapshot. Confirmed packets and the completed local copy are retained together; if local completion fails, the original pending operation remains recoverable. A newer draft is not cleared by an older approval. A confirmed operation with missing/conflicting server evidence is never recreated.

This is tested idempotent recovery for retained approved operations, not a claim of exactly-once network transport or cross-device disaster recovery. Clearing browser keys/storage can destroy local recovery. A changed recipient/device key or revoked permission can leave an absent operation pending; no automatic replacement, re-encryption or cancellation policy has been added.

## Compact connected-care packet

The Doctor-created connected-care transfer now uses a versioned field-position dictionary and a presence bit mask. Every entered clinical value is preserved; absent optional fields remain absent and explicitly blank fields remain blank. This is structural encoding, not a medical abbreviation dictionary. No findings, diagnoses or medications are inferred or shortened. The printable summary remains readable and complete.

The signed payload uses a fixed v2 field order: patientReference, contact, bloodGroup, pregnancyStage, allergies, usg, bloodSugar, bloodPressure, situation, drugsGiven, remarks, reason, history, treatment, instructions. Metadata and the basic profile use fixed positions. Never change this order without a new wire version.

A compact wrapper retains the ES256 signed payload and P-256 public device key coordinates. Native raw DEFLATE is used only if smaller; otherwise the wrapper remains plain compact JSON. The encrypted plaintext begins with 1 for compressed or 0 for plain. Decoding is bounded to 1 MiB to reject expansion bombs. ECDH-ES/A256GCM recipient encryption, signing-key validation and online authority checks remain intact.

The framed binary body begins `MS3`, followed by 16 ID bytes, a two-byte big-endian protected-header length, the exact decoded JWE protected header, 12 IV bytes, ciphertext and a 16-byte authentication tag. The reader reconstructs the original JWE exactly. The existing `MATRISYNC-HANDOFF/2` header, byte length, CRC32 and `END-MATRISYNC-HANDOFF` footer remain unchanged. CRC is completeness checking, not authentication. Legacy JSON/JWE packets remain readable. Already approved or saved packets are never regenerated during recovery.

Both receiving and sending apps need this update to exchange new compact packets; old clients cannot read MS3. Compression support is needed to decode compressed wrappers. The firmware must treat payload bytes as binary, not a null-terminated string. Compatibility with the user's current V2.2 bridge remains untested.

The final automated synthetic sample measured **2,351 bytes before and 1,104 bytes after** (53% smaller), including all framing and cryptographic overhead. Earlier runs measured 1,109 bytes because generated IDs/signatures/keys affect compression. Actual clinical text changes size. This is not a universal maximum or a claim that a 1K tag fits. Capacity checks reject the entire oversized packet before submission, with the actual byte count; nothing is truncated.

Only 48 tag bytes are verified on the current PN532/MIFARE setup. That is insufficient even for the public framing plus authenticated clinical payload. Full usable capacity must be read-only inspected later; BLE RAM capacity is not NFC capacity. No hardware was flashed, written or tested in this slice.

## Current checks

- 150 unit tests in 33 files passed, including 15 approved-retry failure cases and five compact-codec cases.
- Ten current care/record Firestore rules tests passed; no rule changes.
- One real nine-account `demo-matrisync` Auth/Firestore emulator journey passed with the compact packet, lost commit responses, unavailable reconciliation, concurrent retries, revocation/reinstatement, receiving and original receipt semantics.
- TypeScript, ESLint and documented production build passed. Build excludes test/pilot fixtures. Existing large-chunk warning remains.
- Hosting-only deployment succeeded to https://matrisync-c9de7.web.app. All 16 public static files (15 cached assets plus service worker) matched the build byte-for-byte. Four HTTP route shells also matched; this is not rendered-browser or cached-update acceptance.
- Production build cache: `6f27aa746ef9`; main asset: `assets/index-BLWSUBon.js`.
- Current browser fixture, public rendered app and cached Update now behavior remain unverified: the browser tool repeatedly reports local browser use disabled in Work settings. Do not reuse the November 8 browser pass as evidence for this change.
- Historical sharing suites on port 8087 were not rerun. Public authenticated acceptance, device/key recovery and physical BLE/NFC remain incomplete.

Local evidence is under `.local-tools/compact-unit.log`, `compact-integration.log`, `compact-lint.log`, `compact-build.log`, `handoff-size.json` and `retry-rules.log` in the continuation checkout. Logs and private environment files remain ignored. Publication/HTTP verification is recorded in the current root handoff once completed.

## Continue next

First finish browser-only reload/retry, cross-patient/account and Update now acceptance when browser access is available. Then continue scoped public authenticated acceptance and explicitly designed device/key recovery. Do not invent public facility bootstrap authority. Hardware remains separate: obtain current firmware source/protocol and inspect full tag capacity before adapting binary transfer. Preserve the stable operation, original packets, draft revisions and immutable receipts.
