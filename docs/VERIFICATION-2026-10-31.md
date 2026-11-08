# MatriSync verification — 31 October 2026

This continuation completes encrypted Doctor → credential-review Organization referral delivery and explicit Organization initiation in the controlled test-account build. Checks ran across 30–31 October. It follows the approved submission core; public facility verification remains deferred. This is an intermediate milestone, not a completed end-to-end handoff or final-product release.

## Working behavior

- A currently approved doctor explicitly sends one exact approved referral version to the named facility. The signed/encrypted package excludes other draft versions, permanent profile codes, full profiles and original attachment bytes. Original-file references, patient/source identity and the selected version number are preserved.
- The receiving Organization checks the sender signature, connection/key binding, content digest and exact authoritative approval receipt before saving ciphertext locally. Reopening and exporting the received copy produces the same HTML as the doctor's approved copy. The copy remains readable offline after connection revocation; future fetching and initiation require current authority.
- The Organization reviews the received version, selects an approved outgoing Organization destination and explicitly records initiation. Changing the destination or its fingerprint clears the review confirmation. Initiation is immutable and bound to the received approval/digest; retries cannot overwrite the destination. Concurrent competing initiation requests produce exactly one winner.
- Initiation does not transmit to the destination or claim acceptance, arrival, handoff or closure. The UI explicitly separates these states. A cached referral does not invent an offline initiation status. Full-profile retrieval uses a separately authorized shared profile; receiving a referral alone does not grant profile access.
- Approved exports now say that delivery status is recorded separately. The earlier “Not initiated or sent” caption would be inaccurate after this milestone. Historical approval remains distinct from current authority or later events.

## Verification

- 84 unit tests passed. The new JOSE/cache test checks selected-version projection, wrong recipients/keys/context, tampering, mismatched content, ciphertext-only storage, idempotent caching and account isolation. Its final targeted rerun also verifies that a compact second-version package retains its original ordinal and produces byte-identical approved HTML while excluding earlier/later private drafts.
- 32 rules tests passed in the complete local emulator run. The referral suite then passed all five tests after adding a simultaneous conflicting-destination case, bringing coverage to 33 unique passing rules tests. Coverage includes valid delivery/initiation, outsider and wrong-facility access, missing/extra/type-invalid/oversized fields, forged hashes/keys/actors/timestamps, orphan paths, bounded queries, immutable updates/deletes, credential/scope/member/connection changes and invalid destination roles/keys. Final runs contain no expression-budget or service-call-limit failures.
- All three sharing browser scenarios passed. The extended five-account scenario passed again after adding explicit destination-confirmation reset, mobile overflow and CSP-header assertions. It covers duplicate send, exact approved export, offline initiation refusal, persisted initiation, retained offline copies after revocation, no implicit destination delivery and no clinical plaintext in relay metadata.
- All 18 account browser scenarios and all 26 general browser scenarios passed. The optional actual-model scenario was skipped; RUHI's prior Windows/Edge actual-model evidence remains unchanged. No new phone, model or hardware acceptance is claimed.
- ESLint, TypeScript, demo build and production build passed. Distribution checks exclude the controlled-sharing UI/client from both normal distributions; production also excludes synthetic assignment and medicine fixtures. The normal preview was restored from a separate verified production snapshot and reloaded successfully in the in-app browser at port 5173.
- The Organization referral screen was inspected at 551 pixels with no horizontal overflow. Evidence: `screenshots/referral-initiation-mobile.png`. No new physical-printer or NFC-device validation was performed.

## Findings resolved

Saved-cache metadata initially entered the envelope-context comparison and prevented reopening. Validation now compares the six defined routing/context fields explicitly. The recipient still checks the signed payload and exact approval digest.

The first initiation rule implementation exceeded the emulator's expression budget by repeating generic channel checks. Purpose-specific checks reuse current member/scope/credential records while preserving the same enabled-role-key and authority requirements. Valid initiation and adversarial cases pass within the limit.

On forced disconnection, Firestore's WebChannel library can attempt a Google connectivity-image probe. The isolated local sharing server now applies a loopback-only image/connect CSP. The test does not silently ignore external traffic: it requires the header on each account page, rejects external responses, and allows a recorded SDK probe attempt only when Chromium reports that exact request blocked by CSP. Unknown external requests still fail. This loopback pilot cannot download an external RUHI model; the normal app/model workflow is unchanged.

## Next work and limits

Next: encrypted forwarding to the selected receiving Organization, distinct acceptance/arrival/acknowledgement/closure events, authorized receiving-profile resolution, then compact handoff transport/read-back using hardware or the explicitly labelled BLE simulator. Source-preserving clinician documentation assistance remains open.

The relay validates an authenticated approval receipt, not a portable independently verifiable approval certificate. Independent security review is still required before broader release. Permanent-code identity/claims remain synthetic; automatic multi-device synchronization, recovery, pagination and larger-attachment handling remain incomplete. No production cloud deployment, public verification or physical NFC success is claimed.

The assistant owns developer checks. The user is not asked to operate the pilot or perform technical acceptance; final usability review follows completion of the core journey.


## Destination continuation — 31 October 2026

The selected receiving Organization now receives the exact original doctor-signed approved referral inside an initiating-Organization signed/encrypted envelope. Receipt, acceptance, arrival confirmation, handoff acknowledgement and closure are distinct immutable receiving-account events. Independently authorized source-to-destination profile/original sharing resolves the patient without granting profile access from referral metadata. An unavailable referenced revision opens no substitute. This supersedes earlier destination/event-missing status in this document. See [protocol](DESTINATION-REFERRAL-PROTOCOL.md) and [verified checkpoint](VERIFICATION-2026-10-31-DESTINATION.md) for trust boundaries, tests and remaining work. The full submission core, BLE transport and final distribution integration remain incomplete.
