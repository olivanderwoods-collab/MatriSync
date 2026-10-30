# Destination delivery and receiving verification — 31 October 2026

Continued the existing clean `b085160` checkpoint on `codex/phase-1-demo`. The next referral slice now works in the controlled local-emulator sharing build: initiating Organization forwards the exact approved version to the selected destination; destination verifies/saves it and separately records receipt, acceptance, verified arrival, handoff acknowledgement and closure. This is not completion of the entire submission core.

## Checks performed by the assistant

| Check | Result |
| --- | --- |
| Unit suite | 84 passed across 20 files; existing referral crypto/storage/export case expanded to both signatures, original context, altered authority, wrong keys/recipient, tampering, idempotent encrypted cache and identical selected-version export |
| Complete rules suite | 39 passed across 5 files in the final full run; 11 referral delivery/destination/index/event cases |
| Sharing browser suite | All 3 scenarios passed; final expanded five-account profile/referral scenario passed again after the empty-history message adjustment |
| Account browser suite | 18 passed; optional actual-model RUHI case skipped in this run |
| General browser suite | 26 passed against demo distribution |
| Static/build checks | TypeScript, ESLint, demo and production builds passed; build checks explicitly exclude new forwarding/index/signature markers from normal distributions |
| Normal production shell | Cache `fd753cc0b8cf`, asset `index-BvIcWu_f.js`; same as previous checkpoint because the new implementation remains isolated to the pilot |

The browser journey uses five separate authenticated Edge contexts with fictional data: Mother, doctor, unrelated professional, initiating Organization and receiving Organization. It checks destination empty before send/receive, wrong fingerprint denial, offline-send/event refusal, repeat send/receive, reload, exact approved HTML, absence of plaintext clinical data on the relay, no implicit profile access, source-authorized independent profile/original delivery, explicit handling of an unavailable referenced revision, all five attributed events, sender visibility of receiver history, revocation/fresh-fetch denial and retained offline exports. Existing child/workspace/direct-URL and original-preservation assertions remain in the same scenario. CSP checks still reject external responses and require blocked connectivity probes.

Mobile width 551 px passes body-overflow checks. The final receiving screen was inspected in `screenshots/destination-receiving-mobile.png`; the existing Medical Green design and navigation remain. Normal preview at `http://127.0.0.1:5173/` was opened and its pending public-shell update applied through the existing update action, without clearing storage. It serves the separate verified `.local-tools/review-referral-delivery-20261031` snapshot, whose shell matches the production build.

## Adversarial outcomes

| Attack | Observed result |
| --- | --- |
| Public/outsider/wrong-role access; own-role escalation | Denied by referral tests and retained full sharing/credential suite |
| Wrong destination/source channel/version/key; forged approval/doctor/initiation | Denied; original doctor JWS/context and full authoritative receipt comparisons retained |
| Disabled original/destination connection, credential/scope/facility suspension, changed approved key/category | New forwarding or fetch denied; historical saved ciphertext preserved |
| Missing/extra/type-invalid/oversized fields, false actor/hash, forged timestamps, path substitution | Denied |
| Update/delete, owner/recipient or creation-time replacement, replay | Denied; concurrent event creates yield one winner, client retries reuse existing immutable result |
| Skip to closure or batch receipt plus acceptance | Denied; predecessor must already exist |
| Orphaned event/index, payload-list query, unbounded/public index/event query | Denied; exact app query shapes and atomic payload/index write pass |
| Relay clinical plaintext leak, private-draft forwarding, implicit profile grant | Not observed; browser and crypto assertions pass |
| Numeric overflow/counter replay | No numeric business counter introduced; schema disallows added fields |

No rule expression/access-budget failures occurred in the final passing run. Expected permission-denied and missing-field errors in logs are assertions of rejected attacks, not passing-path failures. Rules remain a controlled prototype requiring independent review before broader release.

## Findings and boundaries

An initial resource-dependent ciphertext list failed in the emulator. It was replaced with a bounded nonclinical discovery index and individual fully authorized payload gets, preserving original authority checks. An event-batch test initially constructed references from different test Firestore instances; the fixture was corrected before asserting server denial. Local loopback execution initially needed approval; a temporary automatic-review usage-limit failure was resolved on retry. No checks are assigned to the user.

The protocol extension is documented in `DESTINATION-REFERRAL-PROTOCOL.md`. Events are receiving-account assertions; the app has not physically observed arrival or performed BLE/NFC. The original authority receipt remains relay-authenticated evidence, not a portable certificate. Event history is online-only; saved clinical copies remain offline-readable. The normal distribution still excludes the sharing pilot. Public onboarding, authoritative code loading/first-Mother claim, integrated assignment UX, acknowledged edit outbox, larger attachments/pagination, BLE handoff, documentation assistance and final core integration remain open. Actual RUHI model acceptance was not repeated; earlier evidence remains dated 28 October.

Next: authoritative identity/loading/claim and staff-access integration for approved test accounts, then delivery/outbox and compact BLE handoff dependencies. Preserve the current receiving journey and separately authorized profile access while integrating these slices. No production deployment, paid service or dependency upgrade occurred.
