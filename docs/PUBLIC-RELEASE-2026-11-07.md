# Public release verification — 7 November 2026

## Deployment order and preservation

The clean original branch handoff/matrisync-codex-2026-11-05 at 1de3742496d1b0ed9ffb970b1de8f8ce9673be0e matched its tracked remote. No reset, clean, deletion or source-history replacement was performed. Current software was built and deployed before any changes. Firebase CLI confirmed Hosting release success; a fresh in-app browser then loaded the actual public site and its Professional routes. That milestone was reported before release preparation began.

Project/site: matrisync-c9de7. URL: https://matrisync-c9de7.web.app
Existing Firebase authentication worked; the project was ACTIVE and billingEnabled was false. Only Hosting was deployed. No Auth users, clinical records, Firestore collections or Storage files were seeded, deleted or modified, and authorization rules were left intact.

## Release changes

- Fixed the standard production build command: Vite and its release verifier now receive matching care-enabled, legacy-sharing-disabled settings. No application behavior or design was rebuilt.
- Added .firebaserc for the existing project and replaced stale README deployment claims with current setup, scope and limits.
- Retained the existing verified case, exports and MatriSathi implementation.

## Current verification

- 116 unit tests / 30 files passed; ESLint passed.
- pnpm build passed, including TypeScript and build-mode exclusions. Non-blocking bundle-size warnings remain.
- Public homepage and 27 direct route checks across Professional (8 unique non-fragment routes), Mother (11) and Organization (8). Every checked route rendered its intended heading. Browser console warning/error capture was empty.
- All three roles opened the linked Ophelia case. Mother prescriptions displayed exactly six medication cards and a separate unadministered PRBC request. Source data/unit tests verify +05:30 timestamps and chronological timeline.
- Mother and Organization generated the actual handoff summary. The live Download handoff PDF and Export demo package controls produced files. The PDF was parsed for both identities, all six medication IDs, the pending blood request and demo labels, then both pages were rendered and visually inspected without clipping. The package was 2,827 bytes.
- MatriSathi answered Hello, Who is my doctor?, Show my prescriptions, Show my reports and I have heavy bleeding. Replies were explicitly scripted; urgent language directed the user to human care without treatment recommendations.
- The narrow browser layout displayed usable navigation and readable panels. This is not exhaustive device/browser coverage.
- Shell cache cbd2a21d5b5d; the corrected build produced the same public assets as the initial verified deployment. Existing clients of that release therefore need no content update. Earlier-release client upgrade behavior requires a retained old client to exercise; no old browser storage was erased to manufacture a passing result.

The installed headless Edge test process could not start in this execution sandbox. Public verification used the available in-app browser. Historical Playwright suites were not claimed as newly passing. Earlier emulator/rules/model checks remain documented in ACCOUNT1-VERIFICATION-2026-11-07.md; they were not rerun as public live-account acceptance here.

## Remaining limits

Original Ophelia ultrasound/blood report files and results are missing. Patient blood group/allergies and unknown clinical values remain Not recorded. The O-positive PRBC request does not establish patient blood group. No clinical approval or receiving-facility acknowledgement is invented.

Guest referral tracking is the supplied fictional status/timeline. The compact demo package is plaintext and incompatible with the user-tested 48-byte tag. Physical NFC, real BLE transfer, live facility verification, independent security/clinical validation and a full public multi-account care journey remain unverified. Optional generative inference requires a model; only scripted conversations were tested on the public site. Coming Soon controls remain labelled and synthetic inventory/other previews are not real transactions.

## Publication boundary

Final Hosting-only redeployment succeeded at the same URL. A fresh browser rendered the linked doctor's professional profile and retained it across reload without warnings/errors. Public index.html, sw.js and the main JavaScript asset were byte-identical to the tested build; index.html and sw.js returned Cache-Control: no-cache. Credential-pattern scanning found no matches in the 293 previously tracked source files or 666 historical blobs; this targeted scan is not a security certification. New release files were reviewed separately. The original repository history is preserved.

On 8 November 2026 the user selected https://github.com/olivanderwoods-collab/MatriSync as the continuing repository. Publish the reviewed release on handoff/matrisync-codex-2026-11-05, preserving existing commits and all unrelated files. Do not merge or force-push main. Exclude local environment and authentication files, tools, model files, caches, outputs and logs. The app URL remains https://matrisync-c9de7.web.app. Record the published commit only after remote verification.
