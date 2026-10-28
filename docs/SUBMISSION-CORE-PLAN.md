# MatriSync submission core — 25 October 2026

Submission deadline: **5 November 2026**. This plan prioritizes a complete maternal-care continuity journey over additional modules. Existing records, attachments, UI and secondary features are preserved; further Inventory/distributor/finance expansion is paused.

## Confirmed by the user

- Three priorities: complete referral/handoff, Mother's workspace with an offline companion and organized documents/prescriptions, and Mother–Doctor–Organization profile syncing.
- Build **real encrypted sharing between explicitly approved test accounts**. Public facility verification/onboarding remains deferred. This supersedes the synthetic-only sharing restriction for this controlled submission scope, not for general production use.
- If the physical MatriSync device is unavailable, build a small **BLE-connected software device simulator** that mimics its protocol. Label simulator transport honestly; it cannot prove a physical NFC write or read.
- Offline companion name: **RUHI**, from **R**asheek, r**U**maan, ne**H**a, zuba**I**r. Preserve this exact founder-name origin; do not invent a medical acronym or expansion. MatriSathi remains the containing workspace unless separately changed.

## Essential features and completion checks

### 1. Identity, permissions and real profile syncing

- Distinct approved test accounts for Mother, Doctor and Organization; permissions must be enforced beyond route selection. Provision approval through a controlled mechanism, not a public self-approval switch. No production verification claim.
- Shared patient identity and document references without duplicate profiles. Preserve approved permanent username/code clinician loading and single Mother ownership claim rules; a revoked grant cannot be recreated by reusing the code.
- Organization assigns staff; staff accepts before accessing records. Organization does not own or remove the Mother's profile. Doctor and caregiver privileges remain distinct.
- Encrypt records/files before transfer; the relay stores ciphertext, not private record keys or plaintext clinical content. Define recipient-key authentication, enrollment and recovery before implementing delivery. Do not invent an unreviewed crypto scheme to meet the deadline.
- Offline saved records remain readable; queued edits visibly remain pending until acknowledged. Reconnection must handle retries, duplicates and conflicts without silently overwriting originals. Revocation blocks future fetching/publication while retaining previously saved copies.
- **Done when:** a record or attachment saved under one authorized account is genuinely retrievable under another on a separate browser/device, survives reload, is unavailable to an unrelated account and follows the agreed revocation behavior. A shared in-memory test actor selector does not count.

### 2. Referral creation through acknowledged handoff

- Patient-level referral form: clinician-entered reason, history, relevant original documents and explicitly recorded treatment/instructions. A usable manual form is the fallback if AI is unavailable.
- A separate clinician documentation assistant organizes supplied facts, suggests field placement and flags missing/unclear information with source references. It must not invent diagnoses, medication, urgency or destination. Unknowns stay unknown; optional missing fields must not block emergency referral.
- Doctor reviews/corrects and explicitly approves the draft. Produce a readable, versioned referral document suitable for preview, printing/PDF and recipient review, preserving source attribution and originals. No automatic transmission while drafting.
- Organization initiates the approved version and selects the destination. Recipient acceptance, arrival, handoff acknowledgement and closure remain distinct attributed events, not inferred from delivery or a band write. Non-participating recipients use the original paper/soft-copy pathway without fabricated tracking.
- Compact encrypted handoff: patient/referral identity, approved essential snapshot and authorized retrieval references. Never place the full longitudinal profile, permanent profile code or raw decryption key on the band.
- MatriSync transport adapter handles connect, send, confirmation/read-back, read, integrity/version checks and clear failures. Use the same contract for the BLE simulator; separately label physical-device and simulator results. Confirm peripheral/host BLE capability before choosing the simulator platform.
- Receiving side reads the authorized compact snapshot and resolves the patient identity. Load the full profile only through authorized sharing or an existing local copy; offline reading of a compact handoff does not imply access to unavailable history.
- **Done when:** Mother → Doctor → initiating organization → receiving account completes the journey on separate clients, opens the exact approved document, reads the handoff, resolves the correct profile and records acknowledgement. Test wrong recipients, tampered/stale packets, disconnects and repeat delivery. A UI success message alone is insufficient.

### 3. Mother's workspace and RUHI

- Mother profile, recorded pregnancy stage and existing child profiles remain accessible without an extra routine vault lockscreen.
- Upload prescription/report originals or capture a photo; organize by patient, document type, date and source; list, open and retrieve originals. Mother cannot generate a digital prescription. Automated OCR/extraction is optional after reliable manual organization.
- Show connected care team and actual referral state from shared events, not fabricated progress.
- RUHI runs locally after an explicit initial model download on a supported target device. Use the saved first name and approved dated profile context, respecting opt-out. Clearly handle unsupported hardware, interrupted downloads and unavailable model state.
- Keep the established nonclinical boundary: warm ordinary conversation, no diagnosis, medicine/dose recommendations or report interpretation. Report quotations remain deferred. The clinician documentation assistant is separate from RUHI's Mother-facing permissions. A behavior packet guides inference; it is not model training or a guarantee.
- **Done when:** a Mother saves/reopens documents, sees authorized shared changes and chats with the actual downloaded model while offline on an intended demo device. Include clinical-refusal and context-opt-out checks, not only mocked-worker tests.

## Current baseline

26 October implementation update: the first controlled encrypted-document transport is implemented in a separate local-emulator pilot. See `ENCRYPTED-SHARING-PILOT.md` for protocol, enrollment/recovery boundaries, checks and limits. This is partial progress on the first pillar; full-profile syncing and the complete referral journey remain open.

26 October continuation: the transport now also carries source-scoped profile identities, preserved immutable profile versions and byte-verified original-document references. Shared versions stay read-only and separate from local records. Authoritative clinical identity/claims, patient-directory integration, assignment acceptance, shared editing and automatic synchronization are still pending; the source-scoped hash is not a substitute for those requirements. Technical review is performed by the assistant; the user receives only finished user-facing work for usability review.

27 October continuation: facility offers, named-professional acceptance and revocation now gate real encrypted delivery in the controlled local pilot. Approved scope is limited to one source patient, facility and professional; the server denies pending/revoked transfers and the clients reject other-patient content. Saved copies remain readable after revocation, and independent direct connections remain separate. This completes the pilot acceptance boundary, not public verification, permanent-code profile loading, Mother ownership claims or normal-workspace assignment cards.

- Working locally: encrypted account records, profiles, original document uploads/camera capture, child separation, scoped workspace access, local companion integration and limited profile context, navigation and local Inventory records.
- Synthetic only: cross-account linking/claims/assignment, credential review, referral initiation and retained-copy policy demonstrations.
- Not yet complete: real encrypted multi-account sharing, source-preserving AI referral drafting, final approved referral document generation, BLE handoff/read-back and receiving-profile retrieval.
- Actual-model acceptance passed on the Windows/Edge development machine in the continuation below. Intended-phone acceptance and the complete submission journey remain open.

28 October continuation: authorized saved profile versions now appear in the professional and Organization Patients screens inside the controlled sharing build. Overview, Reports and Prescriptions preserve the explicitly selected version and original-file matching. Receiving-account/workspace separation, unrelated direct URLs, unshared children, separate Organization receipt and retained offline access are covered by browser checks. These are read-only received copies; authoritative identity/claims, shared edits, automatic synchronization and the complete referral journey remain open.

RUHI branding is now implemented, including the confirmed founder-name origin. The actual cached Qwen model passed offline conversation, first-name use, medicine/report refusal, dated profile answers, context opt-out, worker restart and full offline page reload on this Windows/Edge test machine. Testing found and fixed companion/user-name confusion, a load-button/device-check race and an opt-out that previously reset on reload. This is evidence for this machine, not all intended phones or a guarantee of model behavior. Profile context still excludes reports, diagnoses and clinical history.

The user has reaffirmed that the assistant owns all developer checks and should deliver the core product for usability review only after it works end to end. No developer checklist is assigned to the user at this checkpoint.

## Implementation order and target dates

These are planning targets, not completion promises. Reassess against working evidence daily and reduce secondary scope before cutting the three core flows.

1. **25–27 October:** establish the controlled-account permission and encrypted-sharing foundation; prove one document reaches the correct other account on a separate client. Specify the handoff and BLE contract alongside it.
2. **28–30 October:** complete the manual referral/document/recipient flow, then add source-preserving AI assistance. Integrate physical device or BLE simulator against the same contract.
3. **31 October–1 November:** finish Mother document organization, RUHI branding and actual offline-model/device checks. Aim for one complete submission journey by 1 November.
4. **2–3 November:** integrated security, offline/retry/conflict, original-file preservation, mobile and accessibility checks. Fix failures; freeze core features by 3 November if acceptance checks pass.
5. **4 November:** rehearse on the actual presentation devices; prepare a repeatable demonstration, backup recording and an honest capability/limitation sheet.
6. **5 November:** submission buffer and critical fixes only.

Authorization, encryption and source preservation are foundations during implementation, not work postponed until after real sharing. Use fictional clinical data for development and submission testing; technical delivery is not clinical deployment approval.

## Deferred additions

Further Inventory/distributor/refund expansion; broad analytics and administration; public credential onboarding; advanced drug/reference modules; automatic clinical interpretation; broad OCR/voice/translation enhancements; extra cosmetic changes; full standalone digital-prescribing workflow beyond clinician-entered documentation needed for the referral. Preserve existing features, but do not spend core-submission time expanding them.

After every milestone, report working behavior, actual verification, remaining limitations, the user's check list and next steps. Do not substitute more synthetic screens for real multi-client evidence.
