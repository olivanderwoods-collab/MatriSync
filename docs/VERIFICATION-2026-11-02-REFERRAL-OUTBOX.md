# Durable encrypted referral sends — 2 November 2026

This checkpoint follows `6a28b04`. The user explicitly authorized pushing that documentation checkpoint to the existing `origin/codex/phase-1-demo`; the push succeeded before this work began. This phase completes durable send recovery for approved referrals in the controlled local sharing build. It does not complete shared editing, BLE or the full submission core.

## Implemented behavior

Both doctor-to-review-Organization delivery and initiating-Organization-to-selected-destination forwarding now persist a prepared envelope before publication. The separate IndexedDB database `matrisync-referral-outbox-v1` stores a signed, self-encrypted package using the existing device keys and JOSE algorithms. It contains the exact recipient ciphertext, routing context, approval and (for forwarding) original source/selected-destination authority. Clinical text is not stored in plaintext. Plain local metadata includes account/workspace, connection/approval IDs, device ID, delivery kind and preparation/confirmation times.

The queue is add-only under account/kind/connection/approval identity. Concurrent preparations retain the first durable package. Explicit retry after reload opens that exact package, confirms the signed metadata, checks the current account/workspace/device/channel and pinned recipient, and compares the authoritative approval and initiation. Existing relay security rules still enforce current clinician/facility/channel authority. No new permission or legacy unscoped approval authority is introduced.

Publication requires exact envelope equality on retry, including ciphertext. A transaction cannot overwrite a different existing envelope. Forwarding retains the doctor's original signature and its original recipient binding inside the initiating Organization's signed encrypted envelope. Relay confirmation requires an exact server read and, for forwarding, the matching discovery index and timestamp. Only then is the local acknowledgement saved. Failed local acknowledgement retains the pending queue even when publication succeeded; resuming checks the same delivery. Relay confirmation never implies receipt, acceptance, arrival or handoff.

Already-published referrals from before this outbox are supported: after current authorization/pinning, their immutable relay ciphertext is adopted only when existing routing, approval hash and forwarding authority match. The sender cannot independently decrypt an old recipient envelope; the existing authenticated relay metadata and recipient's full signature/decryption checks remain the trust boundary. No old delivery is replaced.

The outbox appears in controlled professional sharing/referral sending and Organization sharing/Referrals screens. Pending entries can be explicitly resumed; confirmations remain visible offline as historical confirmations. First preparation still requires online authority checks. The Organization screen has an explicit refresh control after another action changes its queue. Records, originals, versions, rules, keys, design and normal-build isolation remain intact.

## Actual verification

| Check | Result |
| --- | --- |
| Unit suite | 103 tests across 25 files passed |
| Existing security-rule suite | All 45 tests across 5 files passed |
| Full sharing browser suite | All 7 journeys passed |
| Expanded final five-account referral journey | Passed after adding concurrent retry and legacy compatibility |
| ESLint and TypeScript | Passed |
| Demo and production builds | Passed; pilot exclusion verified |

New unit tests reopen exact encrypted referrals, decrypt them at the intended recipient, preserve the original forwarded doctor signature, reject altered queue routing/device/workspace, prevent duplicate replacement and retain stable acknowledgements. Wrong selected destinations and authority changes are rejected.

The real local multi-account browser journey injects failure after relay commit but before local acknowledgement for both referral legs. It also stops forwarding immediately after durable enqueue, before any publication. Reload/retry preserves the entire relay document, ciphertext and timestamps, including the forwarded discovery index. Two explicitly signed-in tabs concurrently resume the doctor delivery; both confirm the same stored record. A simulated older release has only its dedicated synthetic outbox entry removed, then adopts the unchanged published envelope. Another prepared doctor connection is revoked before publication; retry after reload is denied and the encrypted queue remains pending with no relay referral. Existing full approved-HTML equality, original-byte retention, destination receiving events, independent profile permission and offline retained-copy checks still pass.

The Organization outbox was inspected at 390px with no horizontal overflow. See [mobile outbox](screenshots/referral-outbox-mobile.png). All browser tests use isolated fictional accounts, not user clinical records. No user testing was requested.

Test infrastructure initially failed at signup because the combined emulator launcher lost Auth; restarting Auth alone restored it. A cold relay request exceeded the first assertion wait; all endpoints were subsequently checked as responding. One attempted emulator restart met an automatic-approval timeout, then confirmed the relay port was already in use; no security setting was changed. A test navigation omission and a two-tab readiness race were corrected in the tests. `npm.cmd` was unavailable, so builds ran the existing package-script commands directly with installed Node dependencies. No dependency installation occurred.

Ignored evidence is under `.local-tools/referral-outbox-*.log`, with final artifacts in `.local-tools/referral-outbox-final-results`. The 19 account/26 general browser cases from the documentation checkpoint were not rerun or relabelled as new evidence: normal/demo bundle assets are unchanged, and this change is confined to the controlled sharing build.

## Preview and remaining boundaries

Production remains cache `ae86ae9afacf`, main `index-DhcZdD9X.js`; demo remains cache `597f89c137ab`, main `index-BYo5p0N9.js`. Restored the existing production snapshot `.local-tools/review-documentation-20261101` on port 5173 after its server had stopped. The existing in-app tab loaded an older cached shell; Update now applied the verified build without clearing browser records, and the actual loaded main script was checked. Browser inventory IDs had changed; the current preview is browser 2, tab 1. No production deployment occurred. Services remain transient.

No automatic reconnect sending, offline first-time preparation, multi-device queue recovery, pruning or cancellation was added. The outbox confirms relay storage, not recipient delivery. Shared-edit acknowledgement/conflict handling, identity/code proof and recipient-key/source-fulfillment review with clinical loading/claim integration, compact BLE transport or the authorized explicitly labelled simulator, other history/cleanup paths and full core integration/rehearsal remain open. Public facility onboarding remains deferred.
