# Paste this into the other Codex account

Continue development of my existing MatriSync application from the recorded checkpoint. Do not rebuild it or repeat the original investigation.

Read `MATRISYNC_MVP_ACCOUNT2_HANDOFF.md` first. The supplied transfer ZIP records the older `1085a62` checkpoint; current main is newer. Read `docs/CARE-RETRY-2026-11-09.md` before historical recovery documents. Then read `AGENTS.md`, the emergency requirements, the master development guide, and the latest care draft/acceptance/recovery documents in the handoff's reading order.

Repository: https://github.com/olivanderwoods-collab/MatriSync
Branch for continued work/publication: `main`
Latest tested application-code commit: `49bae5b4ddcf507b5f41c4ee931c5fcc0eff31e7`
Required app URL: https://matrisync-c9de7.web.app
Firebase project/site: `matrisync-c9de7`
Current deployed cache: `329f14806987`

Clone GitHub into a fresh folder if needed. Verify main contains the application commit above and inspect any later commits. Do not reset my existing local checkout: its local Git HEAD is stale because source was published through the connected GitHub app. Do not use an older source ZIP as the current code. My earlier instruction to publish all fixed code to main supersedes the old no-main-merge guidance. Keep an explicit note in future commits that this development is after the Health-a-thon 2026 submission date. Preserve history; no force pushes or backdating. Do not switch to the abandoned MatriSync--Health-a-thon-submission repository or change my submitted URL.

Completed: public fictional Ophelia Frost / Dr. Olivander Woods demo, six medication records and separate blood request/timeline, dynamic handoff/PDF/package, labelled scripted RUHI within MatriSathi, current structured-care client and rules tested with nine emulator accounts, encrypted completed handoff/receipt recovery, encrypted unfinished referral drafts with patient/account isolation and two-tab conflict protection, durable stable approved-operation retries, and lossless compact connected-care transfer with legacy decoding.

Latest evidence: 150 unit tests, 10 current care/record rules tests, one real nine-account Firebase emulator journey, TypeScript, lint, production build, Hosting-only deployment and 16 byte-equal public files. Current browser interaction checks are blocked by Work browser access; historical browser passes do not certify this release. Public authenticated acceptance, device/key recovery and physical NFC/BLE remain incomplete. Historical sharing suites require a separate port8087 emulator.

NEXT: finish browser reload/retry, original summary, newer-draft and account/patient isolation checks in `tests-care/RECOVERY-CHECKS.md`, plus the actual public app and cached Update now flow, when browser access is available. Then proceed with scoped authenticated acceptance and agreed device/key recovery. Do not rebuild the implemented retry protocol: original pending state, approval revision, packet bytes and snapshot must survive reconciliation. Do not automatically send restored drafts or weaken append-only rules.

The latest user requested smaller NFC handoffs. New connected-care packets use lossless compact encoding: recorded synthetic sample 2,351 to 1,104 bytes (53% smaller). No clinical content is truncated or invented, and the full printable summary remains. New receiving clients decode both legacy and compact packets; both facilities need the update for new MS3 packets. Only 48 physical tag bytes are verified, so fit and firmware compatibility remain unconfirmed.

Use the existing UI and Medical Green design; do not add unapproved buttons/tabs/sections. MatriSathi is the Mother tab name; RUHI is the companion name (latest user clarification). Keep scripted replies clearly labelled. Missing original reports/results, blood group, allergies and administering personnel must stay missing. Do not invent clinical data or treatment recommendations. Mother and facility admins must not prescribe. Keep real patient data out of demos and tests; do not delete production records/users or deploy weaker rules. Do not enable public facility verification or invent a bootstrap authority.

Hardware is a working ESP32 WROOM / Elechouse PN532 V3 Facility Bridge V2.2; only 48 tag bytes are verified. Do not flash it, treat the BLE buffer as tag capacity, or claim physical success. Hardware integration is a separate later task.

Own the developer work and testing; do not ask me to run pilots. Reuse existing dependencies and the documented production build. Use local demo-matrisync Auth/Firestore emulators for synthetic acceptance. After verified changes, deploy Hosting only to the same site, check the actual public app and cached Update now behavior, then commit/push to main with the post-submission note and verify the remote SHA. No credentials are included in this handoff; use normal authorized login/connector access if needed, never request pasted secrets.

Finish with a concise report of implemented changes, actual checks, remaining limits, exact main commit and same live URL; update the handoff for the next continuation. Start by verifying the checkpoint and then work on the next slice.
