# Encrypted unfinished referral drafts — implemented 8 November; published 9 November 2026

This development update is committed after the Health-a-thon 2026 submission date. It does not represent the application state at submission. The submitted URL remains https://matrisync-c9de7.web.app.

The existing connected-care manual referral form now saves unfinished fields, receiving facility and packet-size limit in encrypted browser storage. Reopening the same patient restores exact input, including whitespace, without creating or sending a handoff. The existing Doctor approval action is still required and backend authorization is unchanged. An unfinished draft suppresses the previous completed handoff preview until the draft is approved.

Each account and patient has a separate encrypted draft. Same-tab writes run in order. An atomic revision comparison rejects competing tab updates with a visible warning and preserves the losing tab's text for copying. After successful creation, cleanup clears only the matching draft revision; an encrypted revision marker prevents stale tabs from resurrecting it. A newer draft from another tab is retained. A failed cleanup is reported as a cleanup problem after creation, not as a reason to submit the handoff again.

Wait for the existing status area to say the draft was saved before leaving. Pending or failed saves request the browser's normal leave-page warning. A conflict requires copying the unsaved edits before reloading the saved version; there is no automatic merge. These drafts remain tied to this browser's account/device keys. Clearing browser storage or losing keys is not recoverable through this feature. Contribution-note fields are outside this draft feature.

## Verified

- 134 unit tests across 32 files passed, including exact encrypted recovery, account/patient separation, rapid sequential edits, competing writes, revision-safe cleanup and stale-tab rejection.
- Ten current care/record Firestore rules tests passed. Historical sharing-pilot suites using port 8087 were not rerun for this release.
- The real nine-account Auth/Firestore emulator journey passed, including draft persistence through a rejected 48-byte packet and cleanup only after successful handoff creation. Draft editing did not append cloud contributions.
- In the browser fixture using real IndexedDB and encryption: multiline text, destination and packet limit survived reload; patient B remained blank; two tabs could not silently overwrite one another; failed packet creation retained the draft; successful approval cleared it while preserving the completed preview after reload. No warnings/errors were captured in the final fixture tab.
- TypeScript, ESLint and the production build passed before publication. The fixture uses mocked cloud/auth; the emulator journey uses real client SDKs and deployed-to-emulator rules, not production identities.

## Remaining boundaries

Public authenticated acceptance, public facility verification, pending-send retry semantics and device/key recovery remain separate work. Draft recovery is not an offline approval queue or an exactly-once cloud submission guarantee. No production accounts, permissions, rules or real patient data are changed by this release. Hardware is untouched; physical BLE/NFC compatibility is not established.
