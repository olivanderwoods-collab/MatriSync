# Sharing access plan — 25 October 2026

This is the next implementation contract, not a claim that live sharing is enabled. It combines the original v2 plan with the user's explicit answers. Clinical content and private decryption keys must stay off the server in plaintext; authorization metadata and record ciphertext are separate concerns.

## Confirmed decisions

- **Latest submission-scope update:** the user now authorizes real encrypted sharing between explicitly approved test accounts while public facility onboarding/verification remains deferred. Follow `SUBMISSION-CORE-PLAN.md` for the 5 November submission. Controlled account approval must be explicit and enforced; it is not public self-verification or permission to expose real clinical data. The earlier synthetic-only milestone below describes the baseline, not the new implementation target.

- Latest continuation answer: **keep live facility verification deferred for now**. Continue independent local/synthetic work. Do not activate live verification or infer a facility bootstrap authority; choosing that authority remains deferred.

- Verified facilities approve their clinicians' credentials. A saved profile or a selected workspace is not verification. Facilities may confirm affiliation and assign/revoke staff patient access; they cannot claim or remove Mother ownership.
- A verified clinician loads a profile directly with its permanent username + profile code, without a second Mother approval prompt. A signed-in Mother directly claims an unclaimed clinician-created profile with the pair. An existing different owner cannot be replaced by repeating it.
- Facility assignments require staff acceptance. Direct clinician connections and facility assignments remain distinct grants with their respective revocation scope.
- Revocation blocks future sharing. Previously saved records remain readable offline. No periodic online revalidation lock is requested. Revocation cannot erase exported copies or stop a disconnected device reading content it already possesses.
- The compact NFC handoff remains separate from full-profile sharing. Use Sync NFC Band; never infer a patient connection from a band inventory ID or workspace selection.

## Required behavior before live activation

1. **Verification:** an authoritative service establishes verified facility identity and permitted approvers. Those approvers review clinician credentials, record attributed decisions and can suspend their verification. Unverified facilities and self-declared Doctors cannot grant clinical authority. Credential categories retain the doctor/non-doctor permission distinction.
2. **Identity and first claim:** distinguish Auth UID, patient ID, username/code and band inventory ID. Allocate unique identities. Check first ownership claims atomically so simultaneous claims cannot both succeed. Failed claims leave the existing owner and records unchanged. The same login opening another workspace is not a patient link.
3. **Access:** check account status, verification, recipient device and grant on each future fetch/publication. Pending assignments cannot retrieve records. A revoked direct grant cannot be recreated with the permanent pair. Facility revocation does not silently erase an independent direct connection.
4. **Encrypted delivery:** independently review the recipient-key and profile-code proof protocol. Never send permanent codes or raw record keys to logs, telemetry or server storage. Specify recovery, first-device enrollment and recipient-key authenticity before connection. Do not replace existing keys or upload original documents as a shortcut.
5. **Offline/revocation:** retain already-downloaded encrypted content and its existing local access. Deny later downloads, new key deliveries and queued edit publication under revoked grants when the service checks a request. Show the last successful sharing time; pending offline edits are not synchronized. Rotate future content keys as required by the reviewed protocol; do not claim this retracts old decrypted bytes. Reassignment needs fresh acceptance and authorization.
6. **Provenance:** preserve originals, attributed edits and conflicts. Mother/child records cannot enter clinician lists before an explicit authorized link. Administrative access is not clinical editing authority.

## Still unresolved before production implementation

- Initial facility verification and bootstrap of approvers; evidence requirements, disputes, suspension and recovery.
- Device enrollment, encrypted recovery, recipient-key authentication and the exact code-proof/key-envelope protocol. Permanent-code access must coexist with verification and revocation; a lookup identifier alone is not a decryption key.
- Multi-facility credential conflicts, reinstatement and secure external referral delivery.
- Independent review of the threat model, key protocol and production access rules. The development role switch is not verified authorization.

## Acceptance checks

Reject unverified facility approvals, forged clinician roles, wrong codes, revoked connections, unaccepted assignments, wrong recipient keys and replayed requests. Test racing ownership claims and preservation of the original owner; accepted assignments; offline reading of old content after revocation; denied future fetch/publication. Inspect storage, logs and network traffic for plaintext records, documents, codes and private keys. Never migrate fixtures into real accounts.

Permanent-code linking and Mother claims remain an isolated in-memory synthetic workflow. The approved-account encrypted pilot now independently implements the staff acceptance boundary described below. Inventory bookkeeping is separate encrypted local storage; it does not activate this service or transfer money.

27 October controlled-pilot update: an explicitly approved patient/facility/staff scope now supports authenticated Organization offers, named-staff acceptance and terminal revocation. Future encrypted transfers are server-gated by accepted status and current approval/device keys; saved copies remain readable offline. This is source-scoped test-account authorization, not public facility verification or final patient identity. See `ENCRYPTED-SHARING-PILOT.md` for constraints and checks. No permanent code is used as a decryption key or sent to the relay by this implementation.

## Implemented local test stage

The synthetic workflow now has credential submission, verified-facility approval/rejection and suspension, with attributed decision history. Test Facility is a fixed fictional verified approver, not a public self-verification control. Doctor/Nurse/ANM remain initially approved fixtures; the unverified applicant has an immutable caregiver category. An unverified facility cannot approve; caregivers cannot acquire doctor-only privileges through approval. Rejected applications can be resubmitted. Suspended reinstatement and multi-facility authority remain unresolved and unavailable.

Current credential checks gate profile loading, patient creation, assignments, acceptance, new document fetches and publication. A separately copied synthetic document snapshot demonstrates retained old reads after credential suspension or grant revocation, while future fetch/publication is denied. Snapshots record the last successful test fetch and are visible only to their test actor. They clear on reload/logout; they are not real downloads, persistent offline storage, key rotation or live encrypted sharing. Production bundles exclude this workflow. Real account profile/credential forms still confer no authority.
