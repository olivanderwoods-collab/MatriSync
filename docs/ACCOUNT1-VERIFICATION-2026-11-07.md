# Account 1 verification, 7 November 2026

This records the tested boundary; it is not clinical validation or a hardware acceptance certificate.

## Final source checks

- TypeScript `tsc -b`: passed.
- ESLint: passed.
- Vitest: **116 tests / 30 files passed** in the final run.
- Production Vite build with `VITE_CARE_ENABLED=1`, legacy sharing flag off: passed. Build-mode exclusions passed. Public service worker generated, cache ID `3af23df5fcd6`.
- Non-blocking Vite bundle-size warning remains; optional model runtime is large.
- Generated PDF: two A4 pages, parsed and rendered using PDFium. Ophelia, all six medication IDs and the unadministered blood request verified in extracted text. Both pages visually reviewed with no clipped content. Unsupported PDF characters fail explicitly with a browser-print alternative.

## Current production-preview browser inspection

Used an isolated origin `http://127.0.0.1:5190/`, production assets, and Hosting security headers. Existing localhost:5173 showed stale prior content; no normal browser storage was cleared.

- Professional Guest home showed Ophelia and the five approved navigation tabs. Referral preview expanded the actual fixture. Download handoff PDF saved a real PDF in Downloads. Medication screen contained exactly six cards.
- Mother Guest home showed the same case. MatriSathi responded to `hello`, `show my prescriptions`, `where are my reports`, and `I have heavy bleeding` without installing a model. Scripted replies were explicitly labelled, missing reports stayed unavailable, and urgent help did not supply treatment advice.
- Organization Guest opened the same referral, generated the summary and showed no invented follow-up appointment.
- The production preview announced a new version after the final rebuild; Update now activated it and retained the Guest session. This verifies local update behavior, not the public site's cached clients.
- Final production-preview PDF layout revision was checked by unit-generated PDF parsing/rendering. The browser download was exercised immediately before that pagination-only revision.

## Earlier same-session connected-care checks

These passed before the final MatriSathi/Ophelia changes; they are not a claim that every historical browser assertion was rerun afterward.

- 10 Firestore rules tests in two files passed, including staff-role boundaries and isolation.
- Nine-account care journey passed using real Auth/Firestore emulators and cryptography: two facility admins, six staff, one Mother; manual fields; local upload; non-blocking missing fields; print/PDF; simulated BLE receive; offline first receipt and cold offline reload; online full profile; all six staff contributions; Mother patient-ID/access-code login; exact missing-field read-back. Production run included Hosting CSP.
- 20 ordinary Auth/browser cases passed in the appropriate development harness.
- Actual optional local Qwen inference test passed, including profile behavior, refusal, opt-out, cache restart and offline reload. This was before the visible rename. It is not model training.
- Reference ESP32-S3 firmware compiled (598163 program bytes / 97820 static RAM), never flashed. It does not establish compatibility with the user's standard ESP32 V2.2 bridge.

Ignored local evidence: `.local-tools/account1-final-unit.log`, `account1-final-build.log`, `care-release-e2e.log`, `care-auth-dev.log`, `care-ruhi-final.log`, `ophelia-handoff-check.pdf`, and `ophelia-final-*.png`. These logs/caches are not required or suitable for public source publication.

## Hosting and boundaries

The earlier connected-care build and prototype Firestore rules were deployed to project `matrisync-c9de7`; CLI reported Deploy complete. The public URL is `https://matrisync-c9de7.web.app`. The latest Ophelia/MatriSathi build has **not** been deployed. Public workflows and public stale-service-worker behavior still need Account 2 acceptance.

No live facility invitations were issued. No production patient/demo data was seeded or deleted. Original attachments remain local. Physical BLE/NFC transfer, full tag capacity, current V2.2 source/protocol, clinical accreditation, device recovery and final public submission-repository publication remain unverified/incomplete.
