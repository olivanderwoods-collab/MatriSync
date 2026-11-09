# Candidate A: original-browser recovery specification

Later 10 November implementation checkpoint: `RECOVERY-VERIFIER-2026-11-10.md` records the isolated in-memory approval verifier and its actual tests. Production recovery and record transfer remain unavailable; the migration specification below is still the target beyond that limited model.

Development after the Health-a-thon 2026 submission date. This is the next implementation specification for the existing app, not a deployed recovery service. It extends `DEVICE-RECOVERY-2026-11-10.md`. No new public controls, collections, rules, paid services or privileges are enabled by this document.

## Scope and authority

Only an existing authenticated account with its original working browser can approve adding another browser for that same account. The original browser retains its non-extractable keys, records and permissions. Lost-key administrative recovery, recovery through another person's account, staff role changes, original-file transfer and automatic device retirement are excluded. Mother patient-code unlocking remains a separate existing mechanism.

The current rules identify an account by Firebase UID; both browsers have the same UID. Therefore an `approvedBy == request.auth.uid` field does not prove approval by the original browser. A valid-looking hash or a client assertion that a signature was checked is also insufficient. Firebase documents account identity in [Security Rules and Authentication](https://firebase.google.com/docs/rules/rules-and-auth), privileged claim issuance in [Custom Claims](https://firebase.google.com/docs/auth/admin/custom-claims), and hashing operations separately in the [Rules hashing reference](https://firebase.google.com/docs/reference/rules/rules.hashing).

Design inference from those interfaces and the current rules: use a trusted verifier for original-device signature/proof checks and atomic approval, rather than adding an owner-writable approved flag. It must verify Firebase identity, original enrolled keys, challenge freshness, exact scope and current membership itself. Client-side checking remains additional defense. No such verifier exists in the current care client. Production hosting, operational authority and cost approval for it are not established; do not deploy a service, mint device claims or create an administrator implicitly. An isolated local verifier contract/test harness is the next implementation step and confers no production authority.

## Proposed versioned records

Identifiers below are proposed namespaces, not paths the current app may write.

| Record | Fields and invariants |
| --- | --- |
| Existing `careDevices/{uid}` | Immutable legacy/genesis identity; never overwritten, deleted or re-labelled as recovered. Epoch zero is a read adapter, not a migration write. |
| `careRecoveryRequests/{operationId}` | Version 1; account UID; genesis/current approver key ID; new encryption/signing public keys and recomputed fingerprint; 32-byte random challenge; request digest; created/expires server times; requested protocol version. Ten-minute lifetime, one pending target per request, maximum 16 KiB. Contains no clinical data, access codes, case keys or private keys. |
| `careDeviceEpochs/{uid}/epochs/{keyId}` | Immutable verifier-created public identity, parent key ID, request digest, original-device approval proof and activation time. An unapproved request is never a recipient key. Never infer the preferred recipient from highest timestamp or document order. |
| `careRecoveryDecisions/{operationId}` | One immutable terminal result: approved or rejected, exact request digest, approver/new key IDs, authorized scope digest and server decision time. Expiry without a decision is derived from server time. Retrying the identical request returns the same decision; a changed digest conflicts. |
| `careDeviceGrants/{caseId}/recipients/{uid_keyId}` | Append-only, account/case/recipient-device-bound encrypted case-key envelope plus source grant identity, operation ID and approval proof. The verifier must atomically check current source assignment and recipient epoch. A device epoch alone confers no case access or prescribing rights. |

Reject unknown fields, duplicate identifiers, malformed/non-public EC keys, inconsistent fingerprints, unsupported versions and size/count overflow. Names are provisional until the isolated contract tests establish them. Do not add permissive rules for these paths while the verifier is absent.

## Approval and activation sequence

1. **Request:** new browser signs in normally, generates its own non-extractable keys in a separate pending store, and submits a request. It cannot replace the legacy local device slot. The authenticated UID, public keys and bounded schema are validated; no care access is granted.
2. **Possession:** verifier supplies a nonce encrypted to the new encryption key. The new signing key signs the recovered nonce together with the request digest, account, old/new key IDs, purpose and expiry. Both new keys must be usable; possession of only a public key or signing key is insufficient.
3. **Review:** original browser loads the exact request and compares the new fingerprint through a separate trusted channel. It displays account, target browser fingerprint, selected structured case scope and expiry. Explicit approval is mandatory; opening a link, signing in, refreshing access or restoring a draft cannot approve.
4. **Authorize:** original signing key signs a canonical, domain-separated approval over the complete request digest and selected scope. Before accepting it, the verifier checks original identity, all proofs, server time, one-use state and current facility/staff/case permissions. Revoked or changed authority fails closed. Backend verification must not rely on role strings supplied by either client.
5. **Commit:** the verifier atomically creates the immutable decision and device epoch. Independently authorized case grants are appended only for the approved scope. No silent partial grant set is presented as complete. Concurrent equivalent requests are idempotent; a different operation must not overwrite a prior decision or grant.
6. **Stage/import:** selected structured local objects are encrypted to the new device and imported into a separate versioned staging area. Verify each object's kind, account, patient ID, source storage identity, byte length and SHA-256 digest against an authenticated manifest. The manifest is signed by the original device and bound to the exact operation, new device and approved scope. Canonical bytes and domain strings must be frozen by contract tests before implementation. Bounds: at most 100 selected cases, 1,000 objects and 8 MiB per operation; oversize fails visibly, never truncates clinical data.
7. **Acknowledge:** only after every selected object is durably verified may one local transaction publish the completed-import marker. The new browser signs the manifest digest and operation ID. The original browser retains everything regardless of acknowledgement. Interruptions/quota failures retain staged data for same-operation retry and never report completed recovery.

Approval UI belongs within the existing care-access flow. This specification does not authorize a new navigation tab or unrelated section. Implementation must present a concrete review screen and cancellation behavior before exposing it publicly. No clinical export is triggered merely by creating a recovery request.

## Preserve each object's meaning

| Object | Migration behavior |
| --- | --- |
| Full profile and contributions | Transfer only explicitly selected structured data. Preserve actor, role, original/server timestamps and IDs; revalidate present authorization before fetching new data. A snapshot-only receipt cannot become a full authorized profile. |
| Completed outgoing handoff | Preserve exact recipient packet, clinical snapshot, ID and timestamp. Re-encrypt only the outer local storage container. Never regenerate a packet for the new browser. |
| Received handoff | Keep first-received time, original snapshot and historical online-verification time. Import time is separate and does not become a new verification. |
| Unfinished draft | Preserve original revision, text, destination and capacity. An existing destination-side draft conflicts; neither version silently wins. No automatic send or merge. |
| Approved pending operation | Import only as a quarantined reference. Preserve the original proof, sender/recipient keys, approval revision and ciphertext. Reconcile the original operation online. New browser must not call normal creation/retry using a new identity, clear a newer draft or manufacture a replacement signature. |
| Local uploaded originals | Excluded, including attachment bytes in manifests. Explain their absence; no automatic transfer, cloud upload or approval attestation. |

Important compatibility detail: current `decodePending` verifies the saved proof against the local device identity. Simply re-wrapping its envelope for another key would fail verification. A future versioned reader must verify the preserved original proof against the approved historical identity and keep the operation quarantined; it must not alter v1 validation or re-sign the clinical approval. Legacy stores and old-reader behavior remain intact.

## Rollout and failure handling

First build an isolated, deny-by-default verifier model with real signatures, fake time and atomic operation storage; exercise attacks and uncertain outcomes before designing production hosting. Next test versioned readers against legacy fixtures. Then design and review restrictive rules/service authorization. Only then connect a non-production UI and perform actual two-browser acceptance. Production enablement needs an approved verifier deployment and complete acceptance evidence.

Do not route new referrals to a new device automatically. Existing clients continue using the immutable legacy device directory. Add explicit recipient-epoch selection only in a separately reviewed compatible protocol update. Keep dual readers and old device access through rollback; disabling new-device use must not delete original records, keys, grants or already-downloaded offline copies.

Required contract tests: login without original-device proof; wrong account/key/purpose/scope; replay, expiry and clock skew; forged fingerprints; possession of only one new private key; proof substitution; revoked authority before commit; concurrent approvals; response loss after commit; manifest alteration, omission, duplication and overflow; interrupted import; newer-draft conflict; unchanged pending packet/proof; no original files; no secret logs; immutable original enrollments; older-client compatibility. A browser-only verifier or relaxed Firestore rules cannot satisfy this gate.

## This continuation's implemented fix

`unwrapCareBytes` now uses `existingSharingDevice` and fails with original-browser guidance when the local key is absent. Opening existing ciphertext no longer creates a replacement identity, including saved profile/draft/handoff reads and received packet decryption. Wrong existing keys still fail authenticated decryption, and purpose/key-ID checks remain intact. This does not implement the candidate migration above or modify signing/enrollment permissions.

Acceptance: 166 unit tests across 36 files and all three real local Auth/Firestore emulator journeys passed, including missing-key saved-profile/online-load attempts leaving the local identity absent and the original key restoring the unchanged record. TypeScript, lint and the documented production build passed. Existing large-bundle advisories remain. The 14 care/record rules cases passed in the prior safeguard slice; they were not rerun for this decryption-only change, while all current integration journeys exercised the unchanged rules again. No production rules, users, invitations or patient records changed.

Hosting-only deployment succeeded at the same site. Cache `a46bbe8bc699`, main bundle `assets/index-BvlrKePh.js`; 16 public static files were byte-equal and four route shells matched. Evidence is in ignored `.local-tools/read-guard-2026-11-10-{unit,integration,build,deploy}.log` and `read-guard-2026-11-10-live-verification.json`. Browser access was checked again and remains disabled; no new browser or Update now pass is claimed. Physical hardware was untouched.
