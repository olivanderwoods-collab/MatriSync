# Check this build — 25 October 2026

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
- Add persistent inventory refunds/settlements, preserving the decision that financial records stay inside Inventory.
- Build authorized clinician prescription/referral/follow-up records with provenance and correction history; connect organization initiation separately.
- Integrate the MatriSync device only after the BLE/firmware/compact-handoff protocol and read-back checks are available.
- Perform real-phone camera/offline checks, further offline AI quality/safety checks and final removal of all demo fixtures. Do not expand AI to report quotations without a new approved decision.
