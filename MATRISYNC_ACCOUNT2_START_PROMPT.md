# Paste this into the other Codex account

Continue development of my existing MatriSync application from the recorded checkpoint. Do not rebuild it or repeat the original investigation.

Read `MATRISYNC_MVP_ACCOUNT2_HANDOFF.md` first. The transfer ZIP also has `TRANSFER-CHECKPOINT.txt` with the exact documentation publication commit. Then read `AGENTS.md`, the emergency requirements, the master development guide, and the latest care draft/acceptance/recovery documents in the handoff's reading order.

Repository: https://github.com/olivanderwoods-collab/MatriSync
Branch for continued work/publication: `main`
Latest tested application-code commit: `e85eac12a8790d08eaf119f85c78acc219ca6208`
Required app URL: https://matrisync-c9de7.web.app
Firebase project/site: `matrisync-c9de7`
Current deployed cache: `c76381b12cf9`

Clone GitHub into a fresh folder if needed. Verify main contains the application commit above and inspect any later commits. Do not reset my existing local checkout: its local Git HEAD is stale because source was published through the connected GitHub app. Do not use an older source ZIP as the current code. My earlier instruction to publish all fixed code to main supersedes the old no-main-merge guidance. Keep an explicit note in future commits that this development is after the Health-a-thon 2026 submission date. Preserve history; no force pushes or backdating. Do not switch to the abandoned MatriSync--Health-a-thon-submission repository or change my submitted URL.

Completed: public fictional Ophelia Frost / Dr. Olivander Woods demo, six medication records and separate blood request/timeline, dynamic handoff/PDF/package, labelled scripted MatriSathi, current structured-care client and rules tested with nine emulator accounts, encrypted completed handoff/receipt recovery, and encrypted unfinished referral drafts with patient/account isolation and two-tab conflict protection.

Latest evidence: 134 unit tests, 10 current care/record rules tests, one real nine-account Firebase emulator journey, real-browser draft checks, TypeScript, lint, production build, same-site Hosting deployment and byte-equal live assets. These are recorded completed checks, not a claim that this new environment has already rerun them. Public authenticated acceptance, device/key recovery and physical NFC/BLE remain incomplete. Historical sharing suites require a separate port8087 emulator.

NEXT: implement reliable recovery/retry of explicitly approved connected-care handoffs after uncertain network outcomes, without duplicate referral entries. Start with `createCareHandoff` in `src/care-client.ts`, `care-page.tsx`, `care-storage.ts`, `care-client.test.ts` and `tests-care/client.integration.test.ts`. It currently creates a new UUID per invocation. Follow the handoff's stable operation, encrypted pending state, authoritative reconciliation, permissions and failure-test plan. This protocol is not implemented yet. Preserve the latest draft/receipt semantics and exact original packet/snapshot. Do not automatically send a restored draft or weaken append-only rules.

Use the existing UI and Medical Green design; do not add unapproved buttons/tabs/sections. MatriSathi is the correct name. Keep scripted replies clearly labelled. Missing original reports/results, blood group, allergies and administering personnel must stay missing. Do not invent clinical data or treatment recommendations. Mother and facility admins must not prescribe. Keep real patient data out of demos and tests; do not delete production records/users or deploy weaker rules. Do not enable public facility verification or invent a bootstrap authority.

Hardware is a working ESP32 WROOM / Elechouse PN532 V3 Facility Bridge V2.2; only 48 tag bytes are verified. Do not flash it, treat the BLE buffer as tag capacity, or claim physical success. Hardware integration is a separate later task.

Own the developer work and testing; do not ask me to run pilots. Reuse existing dependencies and the documented production build. Use local demo-matrisync Auth/Firestore emulators for synthetic acceptance. After verified changes, deploy Hosting only to the same site, check the actual public app and cached Update now behavior, then commit/push to main with the post-submission note and verify the remote SHA. No credentials are included in this handoff; use normal authorized login/connector access if needed, never request pasted secrets.

Finish with a concise report of implemented changes, actual checks, remaining limits, exact main commit and same live URL; update the handoff for the next continuation. Start by verifying the checkpoint and then work on the next slice.
