# Confirmed product decisions — 23 October 2026

These direct user decisions supersede the conflicting navigation, vocabulary and workflow details in the v2 guide and resolve D1–D5 of the annotation review. Preserve the approved Medical Green design, existing records and strict zero-cost constraints.

## Roles and authority

- The public patient role is **Mother**, replacing Mother/Caregiver. Children remain separate patient identities under the mother's authorized parental linkage; “caregiver” now describes facility staff, not the mother.
- **Doctor / clinical professional:** authorized clinical work, including digital prescription creation, referral creation/approval and follow-up scheduling.
- **Caregiver:** nurses, ANM, GNM and other non-doctor healthcare workers. Preserve the requested report/procedure editing with attribution, and the restriction against generating/modifying digital prescriptions. The synthetic permission model uses Doctor, Nurse/GNM and ANM test actors. Real professional credentials and privileges are not yet verified.
- **Organization:** assigns/revokes its staff's access to a patient; staff must accept before opening the patient. The organization does not control the mother's account or profile and cannot revoke her ownership. A staff assignment is distinct from a separate connection approved directly by the mother; removing facility access must not silently edit the mother's consent choices.
- Keep cross-role sign-in available for development testing. Before the final build, replace it with enforced account roles, verified memberships and record permissions. A route or role selector is never production authorization.

## Patient navigation and referrals

Professional main navigation is Home, Patients, Follow-ups, More. Referrals live inside the patient profile. Patient views hide the main navigation and show patient-specific Overview, Prescriptions, Reports, Referrals and Follow-ups; the test facility view also has Assigned Staff and attributable Activity. Back returns directly to Patients, not a previous subtab. Synthetic test profiles return to the synthetic patient list.

The doctor creates and clinically approves the referral. The organization initiates it and transfers the approved compact handoff to the band through the MatriSync device. These are separate permissions and events. The doctor does not perform the organization's initiation or band-writing step. AI remains assistive and cannot approve/clinically validate a referral.

Actual BLE/NFC remains unavailable until firmware, pairing, service/characteristic IDs, payload/key protocol and read-back verification are integrated and tested. A disabled transfer control must never claim a successful write. The printed band inventory ID remains separate from patient/referral IDs and the clinical payload.

## Inventory and money records

Keep **Refunds / Settlements inside Inventory**. This area is intended to store band-related refund and settlement records. Do not create a separate Financial Records entry or a Financial Settlements destination in More. Distributor Coordination and MatriSync device management belong in Inventory. Physical stock, returns and existing reconciliation requirements remain part of the plan.

The current implementation moves the navigation and preview. It does not record real refunds, settle money or claim reconciled transactions.

## Records without a routine lockscreen

Patients/mothers and permitted clinical staff should open records normally through their profiles, without a separate record lockscreen. Content must remain encrypted; cloud sharing must eventually keep decryption keys away from the server.

Current device implementation:

- New private records use AES-GCM with a non-extractable, account-scoped device key stored in IndexedDB. Auth ownership is rechecked on open/save/download. No cloud record/file upload is enabled.
- New records reopen automatically on the same browser/device. No setup passphrase, manual lock button or idle lockscreen is presented. Logout/account exit discards in-memory record contents; device ciphertext and its local key remain for the owning account's next sign-in.
- Existing passphrase records are not overwritten. One-time entry of the previous passphrase enables device access using the existing key, preserving the original encrypted records and file bytes. Without that passphrase, existing records cannot be recovered by inventing or replacing a key.
- Browser storage loss still loses local records. A device-stored key is not equivalent to requiring a separate secret each session and is not a claim of hardware-backed isolation. The Web Crypto API supports storing CryptoKey objects through structured cloning; see the [W3C specification](https://www.w3.org/TR/WebCryptoAPI/). Browser/OS compromise or malicious same-origin code is outside this protection.

## Synthetic linking now; end-to-end sharing later

The current test workspace is enabled only in development/demo builds. It uses fixed fictional usernames/profile codes and an in-memory state shared between explicitly selected test actors. Reload/logout discards its requests, assignments, documents and audit events. It never connects real accounts or sends data to a server.

Test sequence: facility or doctor requests a link using both identifiers → mother approves → facility assigns staff → staff accepts → permitted record access. Facility revocation denies its staff grant immediately in the test model; reassignment needs fresh acceptance. Doctor-created referrals become available for organization initiation. Test prescriptions, report copies, follow-ups and actor/time history demonstrate the permission boundaries. These controls are not production authorization or end-to-end encryption.

Final sharing requirements:

1. Remove demonstration data and test actor controls from the final product; ordinary newly registered accounts must remain empty. Development fixtures must not be migrated into real records.
2. Use verified account/device identities, authenticated patient consent and accepted staff assignments. Username/profile code is a matching pair, not a password or standalone access grant.
3. Encrypt patient records and files on authorized devices before upload. The server stores ciphertext and encrypted key envelopes; it must not receive plaintext record keys or a server-held decryption/recovery secret.
4. Establish an authenticated recipient-key distribution protocol, consent-bound sharing, device enrollment, encrypted recovery/backup and loss/revocation behavior. Review the protocol before implementation; local device encryption alone is not this protocol.
5. Revocation removes future access and rotates applicable sharing keys. It cannot make a recipient forget content already viewed, downloaded or decrypted; offline revocation and stale caches require an explicit, tested policy.
6. Verify denied access from unlinked profiles, rejected/unaccepted assignments, revoked staff, wrong accounts, forged roles, stale devices and replayed invitations, alongside successful authorized sharing and conflict recovery.
7. Preserve original documents, actor provenance and version/correction history. Distinguish Mother-uploaded prescription copies from clinician-authored digital prescriptions.

Live sharing, clinical AI processing and band transfer remain disabled. The earlier AI instruction limiting clinical AI tests to synthetic/non-identifiable data still applies.

## Remaining annotation work

This phase establishes the confirmed workflow, navigation, synthetic permissions and seamless local record opening. The expanded Mother profile is now stored encrypted locally, including authenticated-email display, name, recorded pregnancy week/date, blood group, allergies, emergency/guardian contacts, residence, username and local profile code. Username/code uniqueness and cross-account discovery are not live. It does not finish expanded professional/facility profile forms, real child record linking/capture, persistent refund ledger, clinical prescribing, notification delivery, AI-generated referral documents or actual NFC transport. Those require their corresponding record models and acceptance checks; menu placement or a synthetic test is not completion.

## Later AI clarification and standing workflow

The user requires comparing every new instruction with the original build plan and confirmed decisions, asking before implementing a contradiction, and finishing each update with **What to check** and **What's next** lists. This is also recorded in the repository's `AGENTS.md`.

The user initially requested full profile/report-aware offline AI, then explicitly selected **“Profile context only; defer report quotations”** after the conflict with the original nonclinical scope was explained. This resolves that conflict without authorizing report reading or diagnosis quotations.

Current companion context is an explicit local projection of the mother's saved name and dated, recorded pregnancy stage. It is read from the authenticated account's own `self` record at send time. Attachments, report text, diagnoses, freeform clinical history, contact/address details and other patients are excluded. The user can disable profile context in AI settings. No data is sent to an online provider or written into the public model cache. This narrow projection must not be described as access to the entire medical profile.

`src/ai/behavior.ts` is the versioned, bundled behavior instruction packet. It guides inference rather than retraining model weights. Independent routing refuses medicine/dose recommendations and report/diagnostic interpretation before generation. Warmth and encouragement must not become false reassurance or conceal urgent danger. Exact source-linked report quotations remain a future decision; even later readback must never infer a new diagnosis from laboratory values.

Exact questions about the saved name or recorded pregnancy stage use direct local record readback, labelled **Saved profile · Not AI-generated**. The small model failed to reliably answer identity questions in acceptance testing, so it is not asked to reconstruct these facts. Other permitted conversation still uses the model and its output filter; rejected output is labelled **Safety fallback · Not AI-generated**. Passing functional tests does not certify general conversational quality or medical safety.
