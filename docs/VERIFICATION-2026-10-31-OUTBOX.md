# Durable encrypted send outbox — 31 October 2026

Implemented after `ebd1aae` within the existing controlled sharing pilot. The identity protocol remains separate and awaiting independent review. This slice continues the independently approved retry/outbox work; it does not bypass that gate.

## Working behavior

Profile and original-document sends now persist a signed, self-encrypted prepared package before publishing. The package contains the exact recipient ciphertext, immutable transfer context and original content needed to recheck a staff assignment. Local plaintext storage contains only routing/status metadata; names, profile details and original bytes remain sealed to the sender's existing enrolled device. A separate `matrisync-sharing-outbox-v1` IndexedDB database preserves existing vault/inbox schemas and keys.

Publication and retry use the original transfer ID and exact ciphertext. A Firestore transaction either creates the immutable transfer or checks that the existing envelope matches all sender/recipient/key bindings and ciphertext. A subsequent server read supplies the relay timestamp; only then is local acknowledgement recorded. A different envelope under the same ID fails without replacement. A failed/ambiguous acknowledgement retains the queued copy. Successful retries do not make another record, re-encrypt a newer source version or alter the original attachment.

Every retry rechecks the signed-in account, approved workspace/device, current connection/credential/assignment authority, original recipient key and existing trusted fingerprint. Assignment contents are checked against the current approved patient scope. Revocation blocks publication and acknowledgement checks; it does not delete local queued ciphertext or previously received copies. Confirmed timestamps are historical relay storage acknowledgements, not recipient downloads or current grant status.

The sharing page has an encrypted outbox with pending/confirmed status and an explicit Resume / Check delivery action. Queued copies survive reload and remain visible offline to their original account/workspace/device. Offline retries fail promptly. Preparing a new delivery still requires an online authorization check. Resume requires no second source-file selection. Concurrent enqueue cannot replace the first prepared record, and concurrent exact retries converge on the same relay transfer.

## Verification

- 93 unit tests across 22 files. Four new cases cover exact ciphertext/original preservation, absence of plaintext in persisted outbox entries, account/workspace/device isolation, metadata/ciphertext substitution, concurrent enqueue and immutable acknowledgements.
- All five sharing browser journeys passed: both assignment scenarios, original document transfer/revocation, the new outbox recovery scenario, and the full profile/referral/destination journey. The existing journeys now exercise the outbox send path for profiles and originals.
- The new recovery scenario injects a local acknowledgement-write failure after a real relay commit, checks pending state after reload, verifies immediate offline rejection, signs the same account into a second isolated tab, resumes from both tabs and compares the entire relay listing before/after. It independently fetches/downloads the recipient's original and compares exact bytes.
- A second injection stops after durable enqueue but before publication. The relay remains unchanged. Reload retains the queued copy; another workspace/account cannot list it; subsequent connection revocation blocks resume. No uncaught browser errors were observed.
- The pending/confirmed outbox was checked at 390px with no horizontal overflow. Screenshot: `docs/screenshots/encrypted-outbox-mobile.png`.
- ESLint, TypeScript, demo and production builds passed. The normal production cache remains `92e95aac48bc`, asset `index-CgIeYTFk.js`; demo remains `713512e824ac`, asset `index-DQjrZRgx.js`. Explicit exclusion checks cover outbox code/UI. The existing normal snapshot was reopened on 5173 and its actual script asset verified in the in-app browser without clearing any records. No normal-build feature activation, rules change, new dependency or deployment occurred.

The first browser attempt failed at sign-up because the transient local Auth emulator was stopped; restarting the existing emulators resolved it. A test initially assumed shared sign-in across tabs; the corrected test explicitly signs in the second tab, preserving the app's existing session isolation. Failure injection is confined to test pages and does not introduce a product test switch.

Evidence: `src/sharing-outbox.test.ts`, `tests-sharing/documents.spec.ts`, ignored `.local-tools/outbox-*.log`. Earlier identity/rules/account/general test counts belong to their respective dated checkpoints and are not new browser acceptance for identity.

## Remaining scope

This is recoverable explicit profile/document sending, not automatic background synchronization, recipient receipt, shared-edit reconciliation, larger/resumable attachments, multi-device recovery or a referral-send outbox. New sends retain the 256 KiB original-file limit and existing bounded connection/receive queries. Queued history has no pagination or pruning yet and requires the original browser device keys. There is no automatic resend after reconnect. Identity review and encrypted loading/claim integration, acknowledged shared edits, attachment expansion, documentation assistance, actual BLE transport and final core integration remain unfinished. No developer testing is assigned to the user.
