# Isolated connected-care recovery checks

## Pending approval recovery (completed in the browser, 10 November)

The updated fixture deliberately fails the first approval after saving the real encrypted pending operation. For either historical creation step below, expect that first failure, then use the same existing button (now **Check / retry approved handoff**) to finish.

1. Create an approval for A and observe the synthetic uncertain-outcome error. Its fields and destination must become read-only.
2. Reload and open A's saved copy. The same approved fields must return; no automatic submission or completed preview may occur.
3. Use Check / retry approved handoff. Verify the original ID, recorded time and fields in the completed summary.
4. Switch to B and then to the other fixture account: A's pending/completed data must not appear.
5. Repeat the old completed-recovery and draft-conflict checks below, accounting for the new deliberate first-attempt failure.

These checks now passed in the real in-app browser on 10 November. See `docs/RECOVERY-BROWSER-2026-11-10.md` for the exact results and the completed-summary/newer-draft display bug found and fixed. The fixture uses mocked network calls; the November 9 real emulator journey remains separate evidence. Use **Inspect saved test state** to compare operation IDs, timestamps, packet hashes and saved draft revisions through the fixture UI.

## Newer-draft regression (10 November)

Open A in a second tab before approval. Approve in the first tab (the deliberate first-attempt failure saves a pending operation); save a newer draft in the second tab. Reload the first tab and recover the original approval explicitly. Confirm identical operation ID/time/packet hash and unchanged newer-draft revision. Reload again: **Last completed handoff** must show the identical original summary while the newer draft remains editable after refreshing access. Neither restoration automatically submits anything.

## Unfinished referral draft regression (8 November follow-up)

1. Enroll/refresh the synthetic Doctor, open patient A, enter a multiline referral reason, select the receiving facility and set the packet limit to 48. Wait for the encrypted-save status.
2. Switch to patient B and open its saved copy. Confirm blank referral fields, no preview and the default 32768 limit.
3. Reload and reopen A's offline copy, then refresh care access. Confirm exact multiline text, destination and 48-byte limit. Creating the oversized packet must fail without losing the draft.
4. Open A in a second fixture tab. Change the reason in the first tab and wait for its save. Change it in the second tab: it must show a conflict, retain its unsaved text and leave the first tab's stored text intact. Reload the first tab and reopen A to verify the winning value.
5. Set the limit to 32768 and use the existing Create and approve button. Reload and open A's saved copy: the completed summary remains. Refresh care access: the unfinished form is blank.

All five checks passed in the real in-app browser with synthetic fixtures. Six new automated cases in `care-storage.test.ts` cover draft encryption, isolation, concurrent writes, cleanup and sequential sessions. The real Firebase emulator journey separately checks that failed creation retains a draft and successful creation clears it.

## Completed handoff recovery

Run `node node_modules/vite/bin/vite.js --config tests-care/recovery.config.ts`, then open `http://127.0.0.1:4181/tests-care/recovery-fixture.html` in a test browser. The fixture replaces account, care-network and records-context calls only in this development configuration. It uses the real CarePage, encrypted care storage, device keys, IndexedDB, summary document and BLE panel. It never calls Firebase or requests hardware unless a tester explicitly clicks the hardware connection control. Do not do that for these checks.

1. Enroll/refresh the synthetic Doctor. Choose patient-a and load it.
2. Enter a unique reason for referral and an unsaved contribution. Select the synthetic receiving facility and create a handoff. Record the iframe's srcdoc/Handoff ID and recorded time.
3. Select patient-b. Before loading it, confirm that patient A's view, draft, preview and BLE panel disappear.
4. Load B. All referral fields, contribution text and recipient must be blank; no A preview can remain.
5. Reload the page. Select A and use **Open saved offline copies**, without refreshing staff access. The original summary must return with the same ID, timestamp, reason and complete srcdoc. Print must be available; creation and BLE must remain unavailable without current loaded staff access.
6. Switch the fixture account to Other account. The prior view, preview, staff membership and patient references must disappear.

Receipt regression (8 November follow-up): the fixture now receives patient B's synthetic handoff offline at 10:00 UTC, checks it online at 10:01, then scans it offline again at 10:02. Open B's saved copies and expand **Saved handoff receipts (1)**. It must retain First received 10:00 and Checked online 10:01. Reopen the handoff: original details and the historical verification notice must remain. These browser checks passed without captured errors or warnings.

These steps passed in the in-app browser on 8 November 2026. The cloud endpoints/authentication in this fixture are mocked; this is not live multi-account acceptance or hardware verification. The production build excludes this fixture. Nine automated regression tests in care-storage.test.ts and care-client.test.ts separately cover real encrypted storage and mocked cloud commit/failure ordering.
