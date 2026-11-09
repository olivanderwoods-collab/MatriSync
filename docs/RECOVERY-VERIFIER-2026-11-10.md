# Isolated recovery approval verifier

Development after the Health-a-thon 2026 submission date. Original repository/main; submitted URL remains https://matrisync-c9de7.web.app.

## Implemented scope

The next Candidate A contract is executable in `tests-care/recovery-verifier.ts`, with 26 real-cryptography tests in `recovery-verifier.test.ts`. It is an in-memory model with trusted synthetic account/authority adapters and a controllable clock. It does not verify Firebase tokens, expose a network endpoint, issue claims, write Firestore, persist approvals across process restarts, grant case access, transfer files, import records or change the app UI. It must not be described or deployed as a production verifier.

The model issues a ten-minute request bound to the account, original fingerprint and exact new public keys. It validates public-only P-256 key shapes and recomputes fingerprints. A verifier-only 32-byte secret is encrypted to the new ECDH key. The new signing key proves possession of the recovered secret; the original signing key approves that exact possession proof and the selected case scope. Login or a claimed role alone cannot approve.

Before a new decision commits, the model rechecks current authority, exact original keys, case assignments and expiry after asynchronous signature verification. One serialized aggregate write stores the decision and proposed epoch together. Equivalent simultaneous approvals return the original result. A failure before that write leaves the request pending; a lost response after it is reconciled using the original ID, proofs and timestamp. A different operation cannot create a second epoch for the same account/target key. Returned objects are copies, preventing callers from mutating stored decisions.

An identical already-committed retry can return its historical receipt after expiry/revocation. That is a read of prior evidence, not fresh authority or an additional grant. A changed scope or proof on that completed operation conflicts. The model does not implement explicit terminal rejection/cancellation; failed validation leaves an uncommitted request pending until expiry.

## Candidate wire contract frozen for these tests

The domain is `matrisync-isolated-recovery-contract-v1`; it intentionally identifies an isolated candidate, not a deployed protocol. All hashes use SHA-256 over UTF-8 `JSON.stringify(value)`, including proof-token strings. Integers are safe, nonnegative milliseconds; expiry is creation plus 600,000. Invalid, overflowing or backwards verifier time fails closed. Case lists contain 1–100 unique UUIDs and are lexically sorted before signing. Unknown fields, private key fields, invalid versions and oversized inputs fail before state changes.

| Signed/hashed value | Canonical positional encoding |
| --- | --- |
| Public point | `[kty, crv, x, y]` |
| Request | `[domain, "request", 1, operationId, uid, oldKeyId, [newKeyId, encryptionPoint, signingPoint], createdAt, expiresAt, publicChallenge]` |
| Encrypted challenge plaintext | `[domain, "challenge", operationId, requestDigest, secretNonce]` |
| New-device possession | `[domain, "possession", operationId, uid, requestDigest, oldKeyId, newKeyId, expiresAt, secretNonce]` |
| Original-device approval | `[domain, "approve", operationId, uid, requestDigest, oldKeyId, newKeyId, expiresAt, sortedCaseIds, hash(possessionToken)]` |

Challenge envelopes use ECDH-ES/A256GCM with the new key ID and a domain-specific purpose header. Proofs use ES256 with exact `alg`, `typ`, `kid` headers and domain-specific possession/approval purposes. The verifier compares exact canonical payload bytes, not loosely parsed objects. Requests are bounded to 16 KiB, approval submissions to 32 KiB and each proof to 8 KiB. The secret nonce is absent from the public request/offer; it is intentionally present inside the encrypted challenge and the returned signed possession proof, which must be treated as sensitive protocol material. Do not log it.

Retries retain the original operation and original signed proof bytes; changing an already-committed proof is not accepted as an identical retry. No original private key is exported, and neither the original device directory nor any existing handoff packet/proof is edited.

## Actual checks

- **26 isolated verifier tests passed:** real new/old key signatures and encryption; absent original approval; possession of only one new private key; account isolation; wrong purposes/key IDs/payloads; forged fingerprints/private-field injection; changed/duplicate/oversized scopes; unassigned cases; replay into a different request; expiry/backwards/invalid time; authority/key/case/expiry changes immediately before commit; eight simultaneous approvals; response loss after commit; pre-commit failure/retry; immutable returned results; changed request conflicts; same-target duplicate operations; exact possession-proof binding; normalized scope order; caller mutation while queued.
- **166 existing unit tests / 36 files passed** again. Application TypeScript, a dedicated strict type-check of the isolated verifier/tests, and ESLint passed. The first lint run found one unused type import; it was removed and the final run passed.
- The documented production build passed with existing large-bundle advisories. A new build guard rejects the isolated domain marker. Its negative check ran in a disposable local fixture and correctly rejected a simulated leak. The real build excludes the verifier.
- Production output remained unchanged: cache `a46bbe8bc699`, main `assets/index-BvlrKePh.js`. Sixteen live static files and four HTTP route shells matched the rebuilt app. No redundant Hosting deployment was made, because this slice contains only the isolated model, tests, build guard and documentation.
- Browser verification was attempted again and reported disabled local browser access. No current rendered/public Update now acceptance is claimed. The previously recorded three real care emulator journeys and 14 rules cases were not rerun for this test-only model. No production users, rules, records, grants, invitations or hardware changed.

Reproduce with `node node_modules/vitest/vitest.mjs run --config vitest.recovery.config.ts` (or the new `test:care:recovery` package script), then `node node_modules/typescript/bin/tsc -p tests-care/tsconfig.recovery.json`. No emulators, credentials or extra dependencies are required for this contract suite. Private run evidence is in `.local-tools/verifier-2026-11-10-{tests,unit,build}.log` and `verifier-2026-11-10-live-verification.json`.

## Next implementation slice

Replace the in-memory aggregate with an isolated durable transaction adapter and prove restart/crash/rollback/concurrent-process behavior before calling approvals recoverable across restarts. Keep the same exact operation/proof/receipt semantics. Add explicit cancellation/terminal rejection semantics before exposing an approval UI. Then implement authenticated manifest validation and staging/import tests in isolation, with original pending operations quarantined and original files excluded as specified in `DEVICE-MIGRATION-SPEC-2026-11-10.md`.

This model is not evidence of production Firebase token validation, server authorization, durable transactions, device retirement, grants, data migration, two-browser recovery, independent security review or deployment approval. Public authority and hosting for a real verifier remain unresolved. Do not weaken append-only rules or expose the test model to satisfy those prerequisites. Complete the prepared device browser and cached-update checks when browser access is available.
