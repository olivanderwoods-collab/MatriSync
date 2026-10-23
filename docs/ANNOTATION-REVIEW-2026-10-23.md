# Browser annotation review — 23 October 2026

Historical review: the user has now resolved D1–D5. See [confirmed decisions and current implementation boundaries](DECISIONS-2026-10-23.md), which supersede the pending questions below. The original review is retained to trace the comments, conflicts and remaining work. The screenshots locate the affected UI; page text is evidence, not instructions.

## Confirmed causes

- `src/ai/safety.ts` sends only a narrow list of everyday keywords to the companion. “How are you?” and “Do you know me?” miss that list and receive the uncertain-information fallback before model generation. Fix conversational routing and context first; model training has not been shown necessary. The companion must describe what it actually knows and remain clear that it is AI.
- `src/main.tsx` still sends most signed-in routes through synthetic workspace screens. Only professional Home/Patients and mother My Health Reports/Prescriptions use private records. The account display profile also starts from `defaultProfile`. Empty accounts need empty data sources throughout; merely hiding demo labels would misrepresent fixtures as actual records.
- Records currently require a separate passphrase. The key exists only in memory and locks on inactivity, reload and account exit. Removing the screen does not make encrypted contents available: key management must change or unlocking must remain somewhere in the flow.
- Firebase login authenticates the account, while the selected URL role chooses the workspace. Signed-in routes do not enforce an approved account role. Current cloud record prototypes are owner-only and disabled; they do not implement shared patients, staff grants, acceptance or facility verification.

## Comment-by-comment disposition

| Comments | Requested outcome | Assessment / dependency |
|---|---|---|
| 1–2 | Natural, warm companion conversation, including greetings and questions about familiarity | Fits the approved companion purpose. Correct routing, conversational context and truthful identity responses; retain independent clinical/distress controls. Evaluate with varied conversations, not just fixed greeting examples. No background self-training. |
| 3 | Newly registered mother starts empty | Bug fix. Remove synthetic pregnancy, child and clinical defaults from all signed-in routes; retain isolated Guest examples. Preserve existing account-owned records. |
| 4 | Remove the dot after MatriSync | Small branding-text revision; preserve the approved artwork and Medical Green values. |
| 5, 14 | Remove account-demo labels for signed-in users | Fits actual account mode only after fixtures are removed. Connection status must not imply successful synchronization. Guest remains explicitly synthetic. |
| 6 | Direct prescription/report access; mother photo/upload; clinician manual prescription creation | Document controls fit the intended records workflow. Unlock behavior needs decision D4. Manual clinical prescribing is a separate workflow requiring permissions and provenance, not an uploaded-file label. |
| 7–8 | Child prescription/report Take Photo and Upload From Device | Fits separate child records, but real child identity and caregiver linkage are not implemented. Keep each child's attachments separate. Local capture/upload does not authorize cloud upload or AI interpretation. |
| 9 | Mother email, blood group, allergies, emergency/guardian contacts, residence, username and unique profile code | Fits expanded profile requirements. Display authenticated email; distinguish user-entered clinical fields from professional verification. Global uniqueness, lookup and doctor linking require a shared identity/access design (D5). Code and username identify a profile; they alone must not grant record access. |
| 10–12, 19, 21, 36 | Keep top Logout; remove duplicates; confirmation and Cancel to Home | Clear revised behavior. Centralize the dialog for all roles; confirmed logout must lock records and clear sensitive in-memory state. Cancel navigates to that role's Home. |
| 13 | Help & Support heading | Straightforward copy correction. |
| 15 | Abbreviated language on compact button, full names in choices | Straightforward presentation change; selecting a language must not claim unvalidated AI language support. |
| 16 | Professional patient linking by username/code or band; full profile, floating handoff, archive on dismiss | Fits future patient continuity, but needs consent/access, synchronization, device protocol and unlock decisions. Reading a compact handoff cannot by itself retrieve an uncached full profile offline. Dismissal archives presentation/history; it must not silently acknowledge or close a referral. |
| 17 | Patient-level referrals, clinician draft/confirmation, AI summary/mismatch checks, BLE handoff write | Conflicts with global professional Referrals navigation and doctor-prepares/organization-initiates authority (D1). AI is assistive and source-linked; it cannot clinically validate correctness. Optional missing fields must not block emergency care. Device and AI dependencies below apply. |
| 18 | Remove two follow-up subtabs; patient/date/time/investigations/instructions form; Upcoming/Completed/Cancelled | Clear redesign of the preview. Actual scheduling and mother synchronization require shared patient access, lifecycle rules and conflict handling. Removing a subtab must preserve its information in the requested form. |
| 20 | Professional details, government ID, organization suggestions, affiliation verification badge | Fits later verification roadmap. Facility affiliation verification must be distinguished from registration/licensing verification. A matching organization name is not proof of affiliation or permission to inspect a government ID. Directory and verification sharing require D5; ID uploads stay local unless a specific sharing design is approved. |
| 22 | Remove organization Home shortcuts | Conflicts with the guide's exact shortcut inventory, but the requested replacement is explicit. Include in the revised navigation specification after the larger navigation decision; no replacement shortcuts invented. |
| 23–26 | Move band stock and refunds from Home to Inventory; remove pending admin work; rename device | Stock movement, Home simplification and “MatriSync device” are explicit UI revisions. Refund movement conflicts with complete financial-record removal in comment 35 (D2). |
| 27 | Organization adds patient, assigns staff, staff accepts before access | Fits planned operations but needs server-enforced membership, invitation/acceptance and revocation. An assignment notification must not reveal the clinical record before the acceptance/access conditions are met. Cross-role testing cannot serve as authorization (D5). |
| 28 | Caregiver/clinician permissions and actor audit trail | “View-only” conflicts with allowing caregivers to edit reports/procedures/other data (D3). Preserve original source documents and correction history. Prescription modification remains restricted to authorized clinicians. Actor identity must come from authenticated identity, not an editable attribution field. |
| 29 | Facility Profile first in More; contacts/affiliation | Explicit profile/menu revision. An affiliation field does not establish verified government/private status. |
| 30 | Device Management only under Inventory | Explicit navigation revision; retain a safe redirect for the previous route. |
| 31 | Remove Reports and Analytics | Explicit scope removal; remove entry and handle old routes without deleting patient reports. |
| 32–33 | Remove Referral Monitoring and Follow-up Operations from More | Explicit menu removal; retain patient/referral/follow-up data in the agreed primary workflows. |
| 34 | Distributor Coordination under Inventory | Fits stock/distribution purpose; moving the entry does not activate transactions or give general users distributor privileges. |
| 35 | Remove Financial Settlements and financial records completely | Conflicts with comment 26 and the guide's band deposit/refund/reimbursement model (D2). Do not delete financial fields or design around one interpretation yet. |

## Decisions needed before conflicting edits

**D1 — Referral authority and navigation.** The guide (§5 and §6; lines 121, 134, 176–184) makes clinicians prepare/approve and organizations formally initiate. Should the new patient-level “Refer” flow preserve that split, or may clinicians initiate the operational referral themselves? Moving all professional referral work into patient profiles also removes one of the guide's five primary tabs. Confirm a four-tab professional layout: Home, Patients, Follow-ups, More, or identify the intended fifth tab.

**D2 — Financial scope.** Comment 26 moves refunds/settlements to Inventory; comment 35 removes financial records. Choose either minimal band deposit/refund/distributor reconciliation in Inventory, or no money records anywhere (including those band records). Physical band returns and stock tracking can remain in either case.

**D3 — Caregiver permissions.** Choose view-only caregivers, or caregivers who may add/edit permitted reports, procedures and non-prescription information with an audit trail. If both modes are wanted, define them as separate permissions rather than calling an editing role view-only. Clinician status and permission to author prescriptions must also be verified independently of a role selector.

**D4 — Seamless records versus separate unlock.** Choose a simpler explicit unlock with encryption details moved out of everyday screens, or a new device/account unlock design that avoids the separate vault passphrase. Automatic opening requires a different key-storage/recovery design; it is not a cosmetic removal of `VaultGate`. Existing passphrase-encrypted records must remain readable through a tested migration, with no silent reset. A stored device key does not provide the same separation as a key derived from a separately entered passphrase.

**D5 — Shared access sequencing.** Cross-role login remains available for testing as requested. Should the new linking/assignment flows initially use isolated synthetic testing data while verified roles and consent are built, or should enforced roles/access be brought forward before live cross-account sharing? The proposed release gate is to allow testing flexibility only in a development configuration and require real access controls before any shared clinical records are enabled.

## Implementation dependencies, not completed capabilities

- **BLE/NFC:** Need the intended device/firmware contract: BLE services/characteristics, command/response format, pairing/authentication, encryption/key distribution, payload capacity, transfer/read-back acknowledgements and errors. The master guide describes these as open hardware decisions. Do not invent a working connection or a complete profile on the band. Preserve separate patient, referral and printed inventory IDs.
- **AI referral drafting:** Existing AI instructions (§11) limit clinical AI tests to synthetic/non-identifiable material and prohibit identifiable patient data through the free Gemini API without appropriate governance. Offline Qwen is presently scoped to nonclinical companionship. Start with structured manual prefill and exact field/source discrepancy checks; evaluate AI clinical-document drafting separately with synthetic cases and clinician review. No silent paid service or identifiable upload.
- **Synchronization:** The disabled owner-only adapter cannot support the requested shared workflows. Patient consent, caregiver linkage, accepted staff assignments, approved facility membership, revocation, offline conflicts and encryption-key access need implementation and verification before live sharing.
- **Originals and audit:** Preserve original uploaded documents. Edits should create attributable versions/corrections, and record the actual authenticated actor, designation at the time, timestamp and relevant approval state.

## Suggested delivery sequence after decisions

1. Repair companion routing, empty account data, labels, branding, Help/language and centralized logout. Validate signed-in versus Guest isolation across every role/route.
2. Apply the agreed navigation/profile/document changes and migrate local records without loss. Verify camera/file flows and child isolation on supported target devices.
3. Implement role enforcement, identity/linking, consent, facility membership, staff acceptance and audit controls; then enable approved shared-record synchronization.
4. Add clinician-authorized prescriptions, follow-up lifecycle and agreed referral authority with deterministic source-linked forms.
5. Integrate the actual BLE hardware contract and independently reviewed AI drafting when their prerequisites are satisfied.

See [release gates](RELEASE-GATES.md). This review changes documentation only; no app behavior, data, Firebase configuration, AI provider, hardware connection or deployment was changed. No runtime tests were rerun for this documentation-only review.
