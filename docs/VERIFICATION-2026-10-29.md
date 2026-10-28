# Referral drafting checkpoint — 29 October 2026

This is a verified development checkpoint within the submission plan, not the completed end-to-end product. The assistant performed the technical checks; no developer testing is assigned to the user.

## Working behavior

- A locally created patient in the professional workspace now has a working Referrals tab. A manual form records the referral reason, optional history, recorded treatment/instructions and selected original-document references. Optional unknown fields remain blank and render as “Not recorded”. No AI-generated clinical content or inferred urgency is introduced.
- Drafts and their versions use the existing account-scoped encrypted device vault. Each version retains the patient details, field text and document attribution recorded at that save. Editing appends a version. Stale browser-tab writes are rejected without replacing newer work. Earlier patient-name snapshots remain intact after a profile edit.
- A document from another patient cannot be attached. Mother/Organization workspaces and other accounts cannot use this local draft workflow. This is local provenance isolation, not verified doctor authority or cross-account authorization.
- The preview and exports use the explicitly selected saved version. Original downloads preserve the uploaded bytes. Standalone HTML copies and browser printing/Save as PDF retain draft status, identities, source attribution and unknown fields. They do not embed original files, include profile codes, send documents or assert approval.
- Exported text is escaped, scripts/remote resources are blocked, and printing uses an isolated sandboxed document. UI copy distinguishes a print/download request from confirmed printing and explains that exported copies leave the vault's protection.
- The optional schema addition preserves existing records and attachments. Drafts are excluded from the existing cloud-backup projection. No sharing rule, cryptographic primitive, live service or deployment was changed.

## Checks performed

- 78 unit tests passed. New cases cover encrypted persistence/reload, immutable prior versions and patient snapshots, stale writes, account/workspace/patient isolation, original bytes, backup exclusion, missing optional facts, malformed dates and inert export text.
- TypeScript, ESLint, production build and demo build passed. Both distribution checks exclude the controlled sharing pilot.
- 26 normal browser checks passed against the demo build.
- All 18 account browser scenarios passed across the full run and the final targeted referral rerun. The full run passed the 17 existing scenarios; the new test initially used a label selector that did not recognize prefilled text. Its accessible-role selector was corrected and the expanded scenario passed. The optional genuine-model case was skipped in this suite; its prior verified result is documented in `VERIFICATION-2026-10-28.md`, and RUHI code was unchanged here.
- The referral browser scenario creates a synthetic patient, uploads an original, saves/edits offline, selects an older version, downloads that exact version and byte-identical original, checks print dispatch/cleanup, reloads, verifies saved versions, and exports a long note.
- Browser PDF rendering produced a one-page standard draft and a three-page long draft. All rendered pages were visually inspected; text extraction confirms the final source-note line and original references survive. Print-layout review found a split source reference, which was corrected. The print API dispatch is instrumented in the headless test; this does not claim a physical printer test.
- Local emulator services had stopped at the start of this continuation and were restarted. Early selector/print-frame cleanup assertions were corrected without weakening application checks.
- The normal local preview was restarted from a separate verified production snapshot; its landing page opened successfully in the in-app browser. Subsequent development builds do not overwrite that running snapshot.

## Next core work

Connect referral drafting to authenticated shared patient identities and verified doctor approval of an exact version; add source-preserving documentation assistance; deliver the approved version to facility operations; implement initiation and distinct recipient/arrival/acknowledgement events; implement compact encrypted handoff with BLE read-back and authorized receiving-profile retrieval. These remain incomplete. Public facility verification remains deferred, and no physical NFC success is claimed.

The user receives the core product for usability review only after the complete authorized journey passes. Existing patient records remain untouched by the synthetic checks.
