# Check this build — 25 October 2026

## New facility verification test to check

1. Open **Organization → More → Professional Verification → Test linking & assignment**. These are fictional actors; no real credential or account becomes verified. Test Doctor, Nurse and ANM start pre-approved to preserve the existing linking checks.
2. Choose **Unverified Test Clinician**, enter a fictional credential reference and submit. Status becomes pending; loading `test.mother` / `TEST-M-001` must still fail. This applicant is a caregiver, not a doctor.
3. Choose **Unverified Test Facility**, enter a review reason for the applicant and record an approval. It must be denied. Choose **Test Facility** and repeat: approval should succeed and decision history should identify the reviewer, time and reason. Rejection allows another submission; suspension does not offer reinstatement yet.
4. Switch to the approved applicant and load the pair. Reports should be available; authoring digital prescriptions and clinically approving referrals must remain unavailable.
5. Choose **Dr. Test Rao**, load the test Mother, add a sample report, then open the patient Overview and **Save test copy for offline reading**. Switch to Test Facility, suspend the Doctor with a reason, then switch back. The accessible-patient link disappears, but Previously saved test records still shows the saved report and last successful test fetch. Fetch latest test copy must fail. Switching to another actor must not show the Doctor's saved copy.
6. Reload to reset the test. All credential decisions, links and saved copies here are memory-only. Existing encrypted real-account profiles, files and Inventory ledger must stay unchanged.

**Next:** the user chose to keep live facility verification deferred. Continue independent local Inventory return and reconciliation workflows, followed by clinical and device stages as their prerequisites are resolved. When live verification is resumed, its facility authority, device enrollment, recovery, recipient-key verification and independent protocol review must be settled before activation. This test does not implement encryption transport, a durable offline sync queue or remote deletion.

## New Inventory step to check

1. Sign in and open **Organization → Inventory → Refunds / Settlements**. Add a fictional pending record, selecting Deposit, Refund or Settlement / reimbursement. Supply a unique record reference, printed Band Inventory ID, facility, amount/currency and date. INR is the default; INR/USD/EUR/GBP are currently supported.
2. Save and reload. The entry should remain **Pending reconciliation**, with the original amount and reference. Try the same reference again, including different letter case; it should be rejected.
3. Open **Void pending record**, enter a reason and confirm. The entry should remain visible as voided. Open Record history and check its original creation plus the correction reason/time; reload again.
4. Try a save while offline after opening this page. Confirm it stays local and does not claim payment, syncing or settlement. Do not use clinical NFC data or patient details in these administrative fields.

The latest sharing decisions are recorded: verified facilities approve clinicians; revocation stops future sharing while saved offline records remain readable. Live verification, E2EE, payment/reconciliation and hardware integration are still pending.

## Latest fix to check: unlinked child visibility

1. Refresh the local preview and accept the app update if prompted. Open **Professional → Patients**: the child created under Mother should no longer appear, including when searched by name or ID. Do not delete the child or clear browser storage.
2. Try the child's old professional record URL: it should show no available record and no edit/upload/document controls. The clinician Home patient count must exclude that child.
3. Return to **Mother → Children**: the existing profile and its original documents should remain, including after reload. Clinician-created patients should still be available in the Professional workspace.

This fixes automatic cross-workspace exposure; it does not activate linking or syncing. Next remains verified roles and reviewed E2EE sharing, followed by the inventory/clinical/device stages listed below.

Use a signed-in account for the saved profile/child/camera checks; Guest remains a fictional preview. The build is local, not deployed. Preserve your existing browser data.

## What to check

1. **Mother → More → Profile:** select blood group, enter Emergency contact person, save, reload. Check the green save button and that your saved details remain.
2. **Mother Home:** check Welcome with your first name, the care subheading, large recorded pregnancy week/date and Open MatriSathi. The repeated bottom footer should be gone.
3. **My Health → Prescriptions:** upload an existing file, then try Take Photo on your intended phone/browser. Allow camera access, frame the document, capture and Save document. Try opening again, Cancel, and denying camera permission. Confirm the camera indicator turns off after capture/cancel/leave. Download and inspect the saved image. No digital prescription is generated.
4. **Navigation and colors:** My Health should not have the unnecessary Back button; patient/child views should return to their parent list. Save actions are green, Cancel amber, logout confirmation green. Disabled actions remain muted.
5. **Children:** add two fictional child profiles, edit one, attach a document to it and reload. The other child's documents must stay separate.
6. **MatriSathi chat:** with saved profile context enabled, send a greeting and check first-name address. Try a medicine or report-interpretation question; it must defer to the physician without giving a medicine or interpreting a report. Report quotations remain disabled.
7. **Professional → Profile:** save details and a fictional credential file; reload. Details and file should remain, with verification still marked unavailable. Check patient search/Add alignment at phone width.
8. **Professional → Add patient:** Create patient profile has Mother details without an email field and produces local username/code. Load profile is labelled synthetic; Sync NFC Band must not claim a connected device or completed transfer.
9. **Test linking & assignment:** as Test Doctor, load `test.mother` / `TEST-M-001`. Try Unverified Test Clinician and confirm denial. Create an unclaimed fictional profile, switch to Test Mother and claim its generated pair; Second Test Mother must be denied. Reload resets all these test changes.
10. **Synthetic assignment:** request a facility link, approve as Test Mother, assign Test Doctor from Assigned Staff, then open Professional Home without reloading. Accept should move the test patient into Patients. Revoke facility access and check that assignment access is removed.
11. **Organization → Facility Profile:** save fictional facility details and optional registration file, reload, and verify persistence. This does not register or verify a real facility.

## What's next

- Define and review the live sharing protocol around the approved permanent-identifier rules: verified clinicians, atomic first ownership claim, unique directory, protected recipient keys, device enrollment/recovery and revocation/offline behavior. Then implement E2EE sharing without exposing record plaintext or keys to the server.
- Connect professional verification and facility affiliations to authoritative roles/memberships; replace temporary cross-role testing before final release.
- Complete inventory reconciliation and verified operational authority around the new persistent pending ledger; cross-facility duplicate detection and payment processing remain disconnected. Keep financial records inside Inventory.
- Build authorized clinician prescription/referral/follow-up records with provenance and correction history; connect organization initiation separately.
- Integrate the MatriSync device only after the BLE/firmware/compact-handoff protocol and read-back checks are available.
- Perform real-phone camera/offline checks, further offline AI quality/safety checks and final removal of all demo fixtures. Do not expand AI to report quotations without a new approved decision.
