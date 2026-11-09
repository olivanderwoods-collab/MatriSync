# Record entry, content-first layout and separate exports

Development **after the Health-a-thon 2026 submission date**. User-approved update on 9 November 2026, continuing original repository main and https://matrisync-c9de7.web.app.

## Implemented

- Demo prescription cards lead with all six medicines, dose (separate from strength), route and supplied administration/initiation time. Unknown doses/times/personnel remain unknown. Prescription history and source attribution follow. Reports lead with references/results availability, then report history.
- Both demo sections and authenticated local-record sections have Add new: manually copy details, upload PDF/JPEG/PNG/WebP, or capture a camera image. Existing CameraCapture and 10 MiB file type/signature validation are reused. Capture is saved only after Save record; there is no OCR or automatic interpretation.
- Manual copying records title, dose, route, administration time as entered, notes, source, date, entry timestamp and actor. This does not issue a prescription, confirm administration or grant Mother/admin clinical privileges. Existing patient access and vault authorization remain enforced. New uploaded account copies also record the account UID; missing historical attribution is not invented.
- Signed-in manual details use the encrypted vault; exact text can be downloaded. Original files remain encrypted local copies. Cloud rules and clinical contribution endpoints are unchanged.
- Guest additions use a separate `matrisync-guest-records-v1` IndexedDB store, never Firebase or live profiles. Guest copies are browser-local, not the encrypted account vault, and remain after Guest exit/reset. Login/privacy copy explains this retention. Existing records are preserved. Demo actor labels identify the selected persona, not authenticated clinical authority.
- Removed repeated fictional/demo words from doctor/medication display values and individual cards. Stable IDs and source facts remain. The existing global demo context and export provenance remain.
- The concise demo handoff contains identity, referral reason/time, blood loss, allergies/group, six short medication tuples with dose/strength/route/time, the separate pending blood request and missing-results status. It omits per-drug prescribing history, duplicate metadata and activity timeline. Demo JSON fell from 2,756 to 1,189 bytes (57% smaller); framed export is 1,260 bytes. It remains unencrypted demonstration data, not the separate connected-care encrypted wire format, and does not fit the verified 48 tag bytes.
- Full PDF/print exports put medications and reports first, then case/referral/blood request, prescribing attribution, added-record provenance and patient/activity history. Added manual copies and local file references are included; original file bytes are not embedded. Added copies are not automatically promoted into the concise clinician snapshot. Existing approved connected-care packets and retry snapshots are unchanged.
- Full exports wait for local additions to load. Multiline manual notes export with line breaks. Unicode is preserved in storage/HTML print; the existing direct-PDF exporter explicitly rejects unsupported non-ASCII characters and directs the user to Print / Save PDF.

## Verified in this continuation

- 155 unit tests in 34 files passed, including five new persistence/permissions/export cases. TypeScript, ESLint and production build passed.
- Tests cover exact uploaded bytes, invalid-file rejection without data loss, Unicode/manual-copy recovery, encrypted storage, workspace isolation, concise/full separation, HTML escaping and multiline PDF text.
- Browser access became available. Real localhost browser: manually saved prescription copy, reload recovery, manually saved multiline report, PDF upload, photo-mode controls and cancel, concise preview, full PDF download containing additions. Synthetic local test data only. Actual camera activation/capture was not tested.
- The browser-downloaded full PDF was parsed, all three pages rendered with Poppler and visually inspected. Its medication/report additions, multiline notes and uploaded-file reference were present; no clipping/overlap observed. Local hot reload produced one React createRoot warning during edits; no production browser errors/warnings were captured.
- Hosting-only deployment succeeded. All 16 static files matched the build byte-for-byte and four HTTP route shells matched. Cache `980d5bfdc502`.
- Real public browser: observed the old cached client, then the new-version notice; clicked Update now, retained Guest session and observed the new medication-first UI. Verified live Add new report options/cancel, concise preview (1,260 bytes) and enabled full-PDF control. No production records were created or changed.
- Physical NFC/BLE, actual camera capture, public authenticated multi-account acceptance and device/key recovery remain unverified/incomplete. Older care rules/emulator results were not rerun for this slice, which changes no rules or connected-care transactions. The earlier approved-operation browser fixture remains a separate pending check.

Evidence in ignored `.local-tools`: `records-unit.log`, `records-final-focused.log`, `records-lint.log`, `records-build.log`, `records-deploy.log`, `records-live-verification.json`, `records-handoff-size.json`, `records-browser-export.pdf`, `records-browser-export.txt`, `records-browser-pdf-*.png`, and `records-live-prescriptions.jpg`.

## Next

Continue the original pending authenticated acceptance/device-key recovery work. Browser access now works: do not assume the previous Work browser block is still active. Finish the approved-operation reload/retry fixture, then authorized authenticated acceptance. Check actual camera capture only with appropriate device access. Obtain bridge source/protocol and full usable tag capacity before any separate hardware changes. No firmware was flashed.
