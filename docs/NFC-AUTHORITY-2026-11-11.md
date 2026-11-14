# Signed NFC completion and receiver freshness — 11 November 2026

Later continuation: `NFC-CLOSURE-2026-11-14.md` supersedes this checkpoint's separate logger-ledger transaction and memory-only receiver history. Atomic journal v2 closure and encrypted historical receiver evidence are now tested in isolation; production authority and physical ownership remain unresolved.

Development after the Health-a-thon 2026 submission date.

Read before `NFC-JOURNAL-2026-11-11.md`. This is a tested, isolated protocol candidate in `tests-care/nfc-commit-authority-{protocol,model}.ts`, not a deployed authority, firmware or offline authorization service. It adds no app UI, public endpoint, enrollment, role, rule, billing or tag write. The five unfinished recovery files remain separate.

## Contract implemented

Three distinct signed objects use the existing `jose` dependency with ES256, pinned keys, exact protected headers, canonical positional JSON and separate `typ` values under `matrisync-isolated-nfc-authority-v1`. Incoming keys or tag metadata cannot supply an authority root. Algorithms and types are checked explicitly; no untrusted key URL is followed. Existing MS3 packets and deployed approvals are unchanged.

1. **Grant:** a synthetic authority signs the account/patient/referral, grant ID, protocol/dictionary version 1, original A packet digest, distinct logger/receiver public devices, positive B-generation range, policy epoch, validity window and exact hashes of three recipient-specific key envelopes. The candidate limits one grant to 24 hours, one logger, one receiver and one terminal completion; these are test policy choices, not an approved clinical operating policy. Unknown versions, out-of-range generations, wrong scope/epoch, stale time and logger-A capability are rejected.
2. **Logger completion:** an enrolled synthetic logger signs the exact grant token digest, both device identities, original A digest, final B generation/packet digest, original pending operation ID/digest and full final-image digest. The helper requires the current journal head to be a completed B operation and reconciles supplied exact readback before signing. A separate encrypted logger ledger retains the exact original token. Reopening/retry does not re-sign it. A second different completion for that grant is refused.
3. **Freshness:** a synthetic authority serializes one terminal logger token per grant, then signs a response binding that exact grant/completion, receiver ID, a newly generated receiver challenge, epoch, issue time and expiry. It issues only to the granted receiver while the explicit trusted authority callback remains enabled and unchanged through the synchronous pre-COMMIT check. A previously finalized conflicting token, revoked epoch, stale clock or unauthenticated caller identity is refused. The callback and caller identities are trusted fixture inputs; they do not authenticate Firebase users or devices.

The receiver constructs a fresh random 32-byte challenge itself. A challenge is valid for less than 60 seconds; a response is at most 60 seconds and cannot outlive the grant. The same challenge retry returns its exact original signed response without extending expiry. After expiry a new challenge is required. Concurrent inspection consumes one challenge for one exact proof; an identical retry is allowed.

Without a freshness response, a valid logger token returns `authenticated-not-fresh`, with no current clinical data. With a matching fresh response, the receiver independently checks the original A ciphertext against the signed grant pin and authenticates B against the signed completion expectation before returning `current-at-authority-check` with the authority's check/expiry times. It never obtains its expected digest/generation from Section C. This means current **at the reported authority check**, not continuously current or physically authentic. The independent existing A reader still works separately if B or this protocol fails.

## Key envelope candidate and exact formats

Fresh independent A/B raw material is created only in synthetic test fixtures. The candidate creates ECDH-ES/A256GCM compact JWE envelopes for logger B, receiver A and receiver B. Each plaintext binds grant, scope, format/dictionary, role, section and recipient fingerprint. The signed grant pins the full randomized JWE tokens, so an attacker able to encrypt to the recipient cannot substitute an envelope. Each protected JWE header contains only `alg`, `enc`, `typ`, `kid`, and `epk`. Import returns non-extractable AES-256-GCM keys; receiver imports expose decrypt only, logger B supports encrypt/decrypt. No A key is given to the logger and no content key to a bridge.

Non-extractability and decrypt-only API usages are local implementation controls, not cryptographic separation of AES readers from writers. A recipient that obtains B material elsewhere can create AES ciphertext; it still cannot forge the separate logger signature. No existing device key is exported. Raw test material exists transiently in the issuer fixture and envelope plaintext; best-effort byte-array wiping cannot erase immutable JS strings or all runtime copies. Production custody/issuance is unresolved.

Version-1 canonical payload arrays, in exact order (domain omitted here for readability but present as element zero on the wire):

| Kind | Fields following domain |
| --- | --- |
| Grant | `"grant",1,id,uid,patientId,referralId,1,1,originalDigest,loggerDevice,receiverDevice,minGeneration,maxGeneration,epoch,notBefore,expiresAt,envelopePins` |
| Key envelope plaintext | `"section-key",grantId,uid,patientId,referralId,1,1,role,section,recipientKeyId,rawKeyHex` |
| Completion | `"completion",1,grantId,grantTokenDigest,uid,patientId,referralId,loggerId,receiverId,originalDigest,generation,packetDigest,operationId,operationDigest,imageDigest` |
| Freshness | `"freshness",1,grantId,grantTokenDigest,completionTokenDigest,receiverId,challenge,epoch,issuedAt,expiresAt` |

Devices encode `[fingerprint, encryptionPublicJwk, signingPublicJwk]`; each public point is EC/P-256 with only `kty,crv,x,y`. Envelope pins encode `[role,section,recipientKeyId,fullJweDigest]` in logger-B, receiver-A, receiver-B order. Digests are full lowercase SHA-256 hex; times are integer Unix milliseconds. Grant/completion/freshness tokens cap at 16,384 characters, verified signed payloads at 8,192 bytes, key envelopes at 8,192 characters. Ledger aggregate plaintext caps at 8 MiB; capacity exhaustion refuses a write without deleting history.

## Persistence and exact retry

Separate explicit logger/authority `ProtocolLedger` stores reuse the encrypted SQLite transaction adapter, with role-separated associated-data domains and `user_version=1`. Original signed tokens are retained encrypted. Terminal authority selection and freshness proof insertion each commit atomically. Existing identical evidence is returned, not regenerated; conflicting terminal evidence is refused. Missing stores/keys, wrong domain or wrong store binding fail without initialization/reset. The existing pending journal is preserved.

The pending journal, logger ledger and authority ledger are separate transactions. The logger's active-head check is a snapshot before signature persistence, **not an atomic lock against another process advancing the pending journal**. This slice does not freeze future physical writes. Authority terminal selection prevents replacing the selected completion under that grant, but cannot stop a device from modifying a tag. A changed tag subsequently fails the receiver's exact expected packet check. Atomic local closure across journal/finalization and a physical writer ownership contract remain necessary before hardware use.

Receiver challenge/accepted-proof state is memory-only. Restart creates a new challenge and cannot restore a previous response as current. Durable received clinical evidence/history is not yet implemented. Local files can still be rolled back together with stale external expectations; there is no rollback-resistant monotonic storage or secure hardware counter.

## Actual measured synthetic budget

Measured with short synthetic account/patient/referral IDs, one UUID grant, full public device keys and a two-character B operation ID. These are actual UTF-8 compact token lengths, including base64url and delimiters, not only raw signature lengths. Arbitrary identities or added grants may be larger. No compact binary optimization or compression of authorization objects is claimed.

| Object / channel requirement | Bytes |
| --- | ---: |
| Signed grant; pre-provisioned authenticated device storage | 2,052 |
| Signed logger completion; end-of-journey out-of-band relay | 1,094 |
| Signed freshness response; online authenticated authority channel | 798 |
| Logger B key envelope; recipient-specific pre-provisioning | 818 |
| Receiver A key envelope; recipient-specific pre-provisioning | 820 |
| Receiver B key envelope; recipient-specific pre-provisioning | 820 |
| All six tokens | 6,402 |
| Framed JSON bundle containing all six | **6,486** |
| Pinned authority public device record | 353 |
| Freshness request payload with grant/completion hashes, receiver and challenge | 368 |
| Sum of above measured payloads | **7,207** |

Each ES256 token carries 64 raw signature bytes (86 base64url characters). Each JWE carries a 12-byte nonce and 16-byte GCM tag, its ephemeral public key within the 295-byte decoded protected header, and an empty encrypted-key segment for ECDH-ES direct agreement. The token sizes count these and all encoded claims. Individual signed protected headers are 138/143/142 decoded bytes for grant/completion/freshness. Private reproducible breakdown: `.local-tools/nfc-authority-2026-11-11-budget.json`; the budget test recreates it.

The all-token bundle is an accounting artifact, **not a broadcast payload to give every device all envelopes**. A real implementation must distribute only each participant's authorized objects. Trust-anchor enrollment, TLS/HTTP authentication headers, certificates, BLE framing and physical-storage overhead remain unimplemented/unmeasured; 7,207 is not a total network or device budget. No channel in this table is implemented by a bridge or production server.

Only 48 actual tag bytes are verified. The hypothetical Classic 1K map has 752 ordinary-data bytes, A=400/B=256/C=96. Both 48-byte descriptors occupy all C, leaving **zero bytes for these proofs**. Do not borrow B/A reservations or describe BLE RAM as persistent authorization storage. This candidate therefore does not deliver tag-only offline authorization or fit on the known tag.

## Verification

- **55 isolated NFC tests passed:** 24 new authority/provisioning/freshness tests, 17 journal tests and 14 Section C tests. The two earlier suites still exercise their related 833 interruption cases; the new protocol is not counted as another physical interruption sweep.
- Real ES256, ECDH-ES and AES-GCM operations; algorithm/type/issuer/scope/device/epoch checks; grant bounds; envelope corruption/substitution and inner-binding rejection; receiver-as-logger forgery; stale/cloned/mixed images; exact retained signatures; logger closure conflicts; two-connection competing terminal commits; freshness expiry, wrong challenge, concurrent consumption and revoked authority before commit.
- Signed-ledger lost-response tests use injected errors before/after COMMIT with reopened SQLite connections and verify no re-signing or clock extension. They are **not abrupt process-kill tests of the new signature ledgers**. The earlier journal suite's actual child-process crash/conflict tests were rerun. Missing/wrong ledger custody, input-copy isolation and incomplete/changed-readback refusal are checked.
- **213 application tests across 38 files passed**, plus strict NFC/application TypeScript, full ESLint, whitespace and the documented production build/fixture-exclusion checks. **16 live static files were byte-equal and four HTTP route shells matched**, evidence `.local-tools/nfc-authority-2026-11-11-live-verification.json`. Application remains `fa50c0c`, cache `66a999f0a90a`, main asset `assets/index-DMm-nUcH.js`. No Hosting deployment or new cached Update now interaction was needed for identical assets. The existing large-bundle advisory remains. No new rendered-browser, emulator, production authority or hardware acceptance is claimed.

Commands remain `node node_modules/vitest/vitest.mjs run --config vitest.nfc-commit.config.ts` and `node node_modules/typescript/bin/tsc -p tests-care/tsconfig.nfc-commit.json`. The production build guard explicitly rejects this authority domain in distributable JS.

Protocol references checked during this slice: [RFC 7518](https://www.rfc-editor.org/rfc/rfc7518.html) for ES256, ECDH-ES and GCM encodings; [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html) for explicit algorithm/type, issuer/audience and cross-protocol validation guidance. These references do not certify this candidate or establish operational authority.

## Next work and unresolved authority

Next isolate atomic logger closure coordinated with the pending journal and durable receiver evidence, with restart/conflict/rollback tests and no automatic send. Establish production issuer/custody/enrollment/current-authority policies before exposing any endpoint. The synchronous fixture authority recheck is not an atomic transaction with future external Auth/Firestore state. No live facility bootstrap is authorized.

This candidate deliberately requires an online challenge for current-at-check status. It does not solve fully offline current-trip discovery, offline revocation, trusted clock rollback or recovery after storage loss. A previously issued response remains evidence only of its reported check time; revocation after that check cannot be learned instantly offline. A valid signature proves possession of a signing key, not genuine sensor observations or a physical NFC write. Logger compromise, secure retirement, independent security review and hardware custody remain open.

Hardware integration still waits for verified WROOM/PN532 V2.2 source/protocol, authorized read-only memory evidence, exclusive same-tag fresh-readback guarantees and a supported persistent out-of-band proof channel. No hardware was flashed or overwritten.
