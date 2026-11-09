# Browser recovery acceptance — 10 November 2026

Development after the Health-a-thon 2026 submission date. Continued from main `d4f05ab936535d1d082dc229e1be729e9820153a`, verified against origin before editing. Original repository/site, records, rules and hardware were preserved.

## Bug found and fixed

A confirmed handoff and a newer unfinished draft were both saved correctly, but reopening the patient suppressed the completed summary whenever a draft existed. The Doctor could recover the draft but could not reopen/print the previous summary through that screen.

`care-page.tsx` now restores the original completed handoff independently of a newer draft, while continuing to suppress a completed preview for an unresolved pending approval. The preview is labelled **Last completed handoff**, shows its handoff ID, and explains that newer draft edits are separate. Original packet bytes, snapshot, identity, timestamp and generated summary are unchanged. No new approval, automatic send, rule change or draft overwrite was added.

The isolated recovery fixture now has a read-only **Inspect saved test state** control. It displays synthetic operation IDs, timestamps, packet hashes, draft revisions and creation count through the UI, making the before/after checks reproducible without hidden browser-state access. This fixture is excluded from production builds.

## Actual browser checks

Performed with the real CarePage, IndexedDB/device encryption and summary renderer, but mocked care-network/account calls and a synthetic framed packet. These checks are not a fresh cloud/emulator or physical device journey.

- A 48-byte capacity rejected the synthetic packet without truncating it or losing the multiline draft.
- Two tabs loaded the same revision. The first tab's saved edit survived; the second tab received a conflict error and retained its unsaved text.
- Explicit approval deliberately produced an uncertain outcome. Approved fields locked. Reload restored the same pending ID, timestamp, reason and packet hash, with one creation and no completed preview or automatic submission.
- A second tab saved a newer unfinished draft after the original approval. Explicit retry confirmed the original ID, timestamp and packet hash without a second operation, and preserved the newer draft revision and text.
- Regression reproduced: with that newer draft present, the completed preview was absent after reload. After the fix the complete iframe srcdoc matched the original exactly, print was available, and the newer multiline draft remained editable after refreshing access.
- Completed offline reopening did not expose the BLE sending panel before staff access was refreshed.
- Switching from A to B cleared A's visible profile, preview and form. Switching to Other account exposed neither patient's draft/operation nor A's summary.
- B's saved received handoff reopened with its original reason and historical online verification time (10:01 UTC), after the simulated repeated offline receipt. Closing the popup retained it.
- A separate clean B approval/retry cleared only its own draft. After reload, B's completed summary was identical and the refreshed draft was blank.
- No captured browser console errors in the recovery fixture or public update check.

## Build and publication evidence

157 unit tests in 35 files passed; TypeScript, lint and the documented production build passed. No security rules, care-client network protocol or dependencies changed, so the prior 14-rule and two-emulator-journey results remain dated November 9 evidence rather than new runs.

Hosting only deployed to **https://matrisync-c9de7.web.app**. Cache `b2f7eec259b7`, main asset `assets/index-CWp9UB9n.js`. Sixteen static files were byte-equal to dist and four public route shells matched. The real public **Update now** action retained the Organization Guest session and loaded the exact new main bundle.

Local ignored evidence: `.local-tools/recovery-2026-11-10-{unit,lint,build,deploy}.log`, `recovery-2026-11-10-live-verification.json`, `recovery-browser-evidence-2026-11-10.json`, and `recovery-proof-2026-11-10.jpg`. An interrupted preview/usage-limit approval failure was resolved by the normal approval mechanism before completing these checks.

## Next slice and unchanged limits

The previously pending approved-operation browser recovery slice is complete. Continue scoped authenticated acceptance and the explicit device/key recovery design, using already-authorized identities/invitations; do not invent public facility bootstrap authority. Public authenticated multi-account acceptance is still not certified. Existing local-profile publishing, cross-device recovery, file locality and hardware limits remain as recorded in `INTAKE-REVIEW-2026-11-09.md`.

Physical ESP32 WROOM / PN532 V3 integration remains separate. Only 48 tag bytes are verified. No hardware was connected, flashed, scanned or written, and no physical success is claimed.
