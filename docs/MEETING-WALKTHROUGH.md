# MatriSync v2 meeting walkthrough

Open http://127.0.0.1:5173/ for the development preview. If stopped, run `pnpm dev` from this `app` checkout. The production/offline preview is http://127.0.0.1:4173/ after `pnpm build` and `node scripts/serve.mjs`; `Start-MatriSync.ps1` launches the existing build on Windows. These are local URLs, not a deployed service.

Use Continue as Guest. All records are fictional and every future operation is labelled Coming Soon.

1. Mother: Home has stage, unavailable recorded vitals, example follow-up/referral status, notifications and education. The six named shortcuts open the specified read-only areas.
2. My Health: explore the eight internal sections. Missing measurements say Not recorded; medicines/reports contain no generated treatment or interpretation.
3. MatriSathi: exactly Information & Education and AI Companion. Drug/herb reference is contextual; AI Companion explains reviewed sources, external lookup labelling, uncertainty and opt-in preferences. Buttons explain future functionality; no chat or lookup runs.
4. Children: switch between Tara and Arun, open Reports and Medicines, and reload. Child records keep distinct identities. Vaccinations is only an informational placeholder.
5. Professional: Home, Patients, Referrals, Follow-ups, More. Inside a patient, open Prescriptions for the planned reviewed reference workflow. Referrals shows clinical preparation, approval and submission to the organization; there is no professional Initiate Referral control.
6. Organization: Home, Referrals, Patients, Inventory, More. Compare connected-facility acceptance/arrival/handoff/closure with External Referrals' paper, soft-copy and compact NFC package. No external live tracking is claimed.
7. Inventory: review stock, issue, return/refund, damage, transfers, Bluetooth devices, financial records and history. All operations are informational only. The engraved asset ID is separate from patient/referral IDs and from the clinical NFC payload.
8. More > Distributor Coordination: a restricted synthetic preview with Home, Stock, Transfers, Settlements, More. It contains no patient records and grants no actual entitlement.
9. Preferences: Mother More > Appearance / Language / Privacy and Data Controls; Professional or Organization More > Settings. Show Light/Dark/System, English fallback, Reset Demo and Exit Guest.

Working: UI navigation, read-only fixtures, temporary Guest sessions, preferences and the public offline shell. Existing Firebase Auth integration is preserved; successful real-account signup/login remains unverified. AI, clinical workflows, database writes, BLE/NFC, stock/finance operations and delivery/notifications are not active. Nothing has been deployed.
