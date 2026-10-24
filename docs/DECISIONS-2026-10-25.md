# Confirmed changes and implementation — 25 October 2026

This continues the original v2 build, preserving existing records and the Medical Green palette. The user requires a comparison against the original plan before each change, a question before implementing a conflict, and a check/next list after each build. The explicit answers below supersede the corresponding 23 October access rules; other decisions remain in force.

## Explicitly approved access-plan changes

- **Verified clinicians:** permanent username + profile code grants access without a separate Mother approval screen. The user selected this rule after the original identifier-only/approval plan was explained.
- **Mother claiming a clinician-created profile:** the signed-in Mother claims directly with the permanent username + code, without clinician confirmation. A profile already owned by another Mother cannot be claimed again. Concurrent claims will need an authoritative atomic ownership operation before live release.
- **Sync NFC Band:** retain this name and the compact encrypted handoff. The band does not contain the full longitudinal profile. Authorized full-profile retrieval remains a separate sharing operation.
- **AI remains profile-context only.** Report quotations are deferred. The first-name greeting uses the saved first name when profile context is enabled; it does not expand the fields supplied to the offline model.

Current direct-load and claim tests use explicit fictional identities in memory, not real account authorization. An unverified test clinician is denied. A directly revoked clinician grant cannot be restored by entering the same code. Facility assignments still require acceptance and can be revoked. The earlier distinction between facility access and a separately established direct connection remains: revoking a facility assignment does not erase an independent direct grant. This distinction and offline revocation/key rotation must be resolved in the reviewed live sharing protocol.

The organization link-request/Mother-approval sequence is unchanged; the user changed clinician access and Mother ownership claims, not facility onboarding. Real professional verification, account roles, directory uniqueness, abuse controls, recovery, recipient keys and encrypted delivery are not implemented by the synthetic actor selector.

## Browser comments addressed

| Comment | Result |
| --- | --- |
| 1–3 | Emergency contact person label; blood group dropdown preserving older recorded values; green Save Mother profile. |
| 4–6 | Welcome first name is the headline; care phrase is the subheading; large pregnancy week with recorded date; Open MatriSathi button. |
| 7 | Repeated workspace footer removed from all roles. The existing header brand remains. |
| 8–10 | Green Save document; amber Cancel; inline camera preview/capture, release on cancellation/leave, permission-error retry. Capture creates a local file; Save document encrypts it. No automatic upload or interpretation. |
| 11 | Unnecessary Back hidden throughout My Health while its main navigation is visible. Contextual patient/child Back remains. |
| 12 | Ordinary permitted AI replies address the saved first name when context is enabled. Clinical refusals and direct saved-fact readback keep their distinct handling. |
| 13 | Signed-in Mothers can add/edit separate local child profiles, with separately scoped prescription copies and reports. |
| 14–15 | Logout confirmation uses green; Cancel controls use the existing amber tokens. Disabled buttons remain visibly disabled. |
| 16 | Patient search and Add patient align at the input edge, including the reported 551px viewport. |
| 17 | Add patient offers Create patient profile, Load profile, Sync NFC Band. Create saves the shared Mother fields without email and generates local identifiers. Load/claim is explicitly synthetic until E2EE sharing. Device connection is disabled pending hardware integration. Synthetic facility assignments appear on clinician Home; Accept moves them to Patients. |
| 18–19 | Encrypted local professional/facility profile forms, registration/affiliation/contact details and optional original credential documents; save/reload/download. Saving never marks credentials or affiliation verified. |

## Storage and integration limits

Follow-up correction: sharing an authenticated development account between role workspaces is not a patient link. Mother `self` and Mother-created child records must not appear in the clinician directory, counts, searches or direct record routes. The local record service now enforces that boundary on reads, edits and document operations, retaining all existing encrypted records. This repairs behavior against the approved plan; it grants no new sharing authority.

Professional/facility details, child profiles and attachments use the existing account-scoped encrypted device vault. Existing passphrase migration and original document bytes are preserved. Schema additions are optional so existing records still open. These additions are excluded from the disabled cloud-backup projection; no file or record upload is enabled.

Creating a patient locally in a clinician account does not yet make that profile retrievable by another account. The Load profile interface explains that it tests fictional identities only. A local child association is not verified guardianship or a cross-account family link. Facility affiliation is recorded text, not a connected verified directory. Live digital prescribing, refund accounting, referral delivery and device transport remain separate work.

Camera verification uses generated video frames and a mocked permission denial in isolated browser tests. Real phone permissions, rear-camera selection, orientation and repeated capture still require device checks. The implementation follows browser camera permission behavior described in [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

See [manual checks and next steps](CHECK-THIS-BUILD-2026-10-25.md), [verification](VERIFICATION.md) and [release gates](RELEASE-GATES.md).
