# Destination referral delivery — 31 October 2026

This extends the approved local test-account protocol. Public verification and production deployment remain deferred. Existing doctor-to-facility envelopes and saved records remain readable without migration.

## Trust boundary

The initiating Organization decrypts its received envelope and retains the doctor's original compact ES256 JWS byte for byte. The original six-field routing context continues to name the doctor and credential-review facility. Its recipient is never rewritten. The Organization signs a new payload containing that original JWS, the immutable initiation receipt and the selected destination's routing context, then encrypts it using ECDH-ES/A256GCM to the destination's approved device. Both layers use the installed JOSE library, with distinct `matrisync-referral-forward+jws` and `+jwe` content types.

The relay stores ciphertext plus nonclinical routing, public doctor-device and exact approval/initiation metadata. On creation and every new ciphertext fetch, rules verify the original doctor, current credential event/category, facility approval, both channels, all enrolled roles/keys and the fixed destination. The copied approval and initiation maps must equal their authoritative immutable documents. The destination verifies the Organization signature, original doctor signature, original context, content digest, complete approval receipt, initiation and destination binding before saving locally. Thus the Organization cannot substitute another version while retaining the doctor's approval.

This still trusts the authenticated controlled relay/operator for enrollment, current authority and receipt provenance. The approval receipt is not a portable certificate. Cached authority metadata supports historical offline reopening; it does not assert current permission. Independent protocol/security review remains a broader-release gate.

## Relay records and queries

- `channels/{destinationChannel}/forwardedReferrals/{approvalId}`: immutable ciphertext, original source channel, exact approval/initiation copies, original public doctor device, sender/recipient keys and server timestamp. Only the initiating Organization can create it. No payload listing, update or deletion is permitted.
- `channels/{destinationChannel}/forwardedReferralIndex/{approvalId}`: immutable ID and timestamp matching its payload through `getAfter`. The app creates both in one transaction. The bounded newest-20 index query reveals no clinical content, doctor identity or ciphertext. Each payload is fetched separately under its full current authority chain. An index entry is discovery, never authorization. Revoked original authority can leave discovery metadata visible while denying ciphertext retrieval.
- `channels/{destinationChannel}/forwardedReferrals/{approvalId}/events/{kind}`: immutable `kind`, receiving `actorUid`, approved `contentHash` and server `createdAt`. Event queries require the parent and current Organization connection and are limited to five.

The separate index avoids relying on a ciphertext query whose resource-dependent authority lookups cannot be established from query constraints. Each individual ciphertext get uses at most ten distinct authority-document reads. This follows the [Firestore access-call limits](https://firebase.google.com/docs/firestore/security/rules-conditions#access_call_limits). Invalid query shapes and public/unrelated access are tested.

## Receiving transitions and retries

Sending records no receiving event. Explicit receive verifies and saves ciphertext, then records `received`. The destination must separately confirm `accepted`, `arrived`, `acknowledged` and `closed`, in that order. Each event requires an already committed predecessor; a batch cannot manufacture the whole journey. Arrival and handoff are attributed confirmations by the receiving Organization, not independent physical observations by the software. No BLE/NFC event is inferred.

Deterministic IDs and read-before-create transactions make repeated sends/receipts/events idempotent without replacing ciphertext, actors or timestamps. Competing differing writes are rejected. If saving succeeds but the receipt request fails, the encrypted copy remains saved and the UI does not claim a confirmed receipt. Receive retry or the saved-receipt action can confirm it later. There is no durable background outbox in this slice.

Events use the current receiving Organization connection and historical approved hash. Original doctor/source revocation blocks future clinical transfers; it does not erase an already received handoff or revoke the receiver's independent authority to report care progress on it. Disabling the Organization-to-Organization connection blocks future event reads/writes as well. Already saved referral/profile/original copies remain readable offline. Event history itself is currently online-only; after reopening, the UI requires an online status check and labels displayed events as last checked.

## Profile and original preservation

Forwarded referrals contain only the exact approved document and references. They include no full profile, original bytes, private permanent code, earlier/later drafts or decryption keys. The profile link preserves the source-scoped identity and referenced revision. If that revision is absent, the screen says so and opens no substitute. Another independently received version can be explicitly selected.

The browser journey verifies that the destination initially has no profile access. A separate approved Mother-to-destination connection then delivers the Mother's own signed profile and original file. The destination resolves the same source identity, explicitly selects the separately received newer revision, and downloads byte-identical original content. Forwarding another source's profile remains disallowed; facility-delegated full-profile distribution is not silently enabled.

The new cache entry uses the existing account-scoped referral database with optional nonclinical forwarding authority. Its ciphertext authenticates the original content and initiation. Earlier entries remain untouched and readable. Source files, patient records and independently granted profile access are not merged or deleted.
