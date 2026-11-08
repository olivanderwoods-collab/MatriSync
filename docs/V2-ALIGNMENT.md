# v2 alignment inventory — 20 October 2026

> This records the earlier v2 milestone. Later mother/caregiver annotations and the testing-only database authorization are tracked in [Phased development](PHASED-DEVELOPMENT.md) and take precedence for the changed screens.

Inspected checkout: `app`, repository `olivanderwoods-collab/MatriSync`, branch `codex/phase-1-demo`, baseline `693a953`. Existing uncommitted changes were the requested browser-comment refinements in `src/data.ts`, `src/main.tsx`, `src/styles.css` and their new regression test. These are being reconciled with the later, explicitly supplied v2 guide, not discarded by a Git reset.

## Existing versus target, recorded before v2 implementation

| Area | Existing implementation / in-progress changes | v2 target and handling |
|---|---|---|
| Public entry | Three roles; configured email/password Firebase Auth; independent Guest | Preserve implementations and three roles; organization wording becomes Healthcare Organization |
| Mother navigation | Overview, Health, Children, Follow-up, Care journey, MatriSathi; Journey/Assistant being removed | Exactly Home, My Health, MatriSathi, Children, More; preserve existing compatible route paths |
| Mother overview | In-progress pregnancy, medicines, next follow-up only | Later v2 explicitly permits stage, recorded vitals, follow-up, referral, notifications, education and six named shortcuts |
| Maternal/child records | Overview, medications, prescriptions, reports; two distinct child fixtures | Exact v2 sections; read-only views, missing vitals marked Not recorded; old medicine/prescription links redirect safely |
| MatriSathi | Topic preview and nested AI Assistant being added | Exactly Information & Education, AI Companion; no real conversation/search/model |
| Professional | Overview, Patients, Follow-up, standalone Drug Safety; other modules being removed | Five exact tabs; clinical Referrals restored by v2, drug reference only in prescription workflow; remaining entries under More |
| Patient onboarding | In-progress Add Patient → create / pair / receive handoff | v2 specifies Register Patient and no fields; Coming Soon, no invented pairing form or new record logic |
| Professional records | Synthetic profiles and prescription layouts | Preserve fixtures; exact eight profile sections and contextual actions |
| Organization | In-progress Overview, Staffs, Patients, Device inventory only | v2 overrides this: Home, Referrals, Patients, Inventory, More |
| Referral ownership | Earlier comments assigned referrals to mother only | Later v2: doctor prepares/approves, organization initiates/routes; mother views status |
| Organization patient view | Shared clinical-record component exposed future clinical editing buttons | Operational read-only view with only five listed actions; no clinical-edit controls |
| Inventory / distribution | Static device concept; no distributor role | Eight inventory subsections and restricted synthetic distributor preview nested under More; no new public/auth role |
| Preferences / help | Settings and Help extra sidebar entries, header gear | Move user access under More; retain theme/language/reset/logout logic; no extra top-level navigation |
| Future actions | Informational Coming Soon dialogs | Preserve dialog behavior; exact §5 action labels only |
| App infrastructure | React/TS, Firebase Auth, sessionStorage Guest, semantic theme, static offline shell | Preserve; no dependency upgrades, schema/backend/service changes or deployment |

## Precedence and ambiguities

- v2 is the latest explicit instruction and supersedes earlier removals where it expressly restores a destination or action. This includes Referrals, organization follow-up operations under More, professional vitals/device previews, and richer Home cards.
- Removed v1 branded screens are not copied wholesale into new locations. v2 functional previews use only its named sections/actions. Existing bookmarks redirect to their closest specified destination.
- v2 does not define clinical form fields, records for many Home counts, source articles, stock quantities, prices or finance policies. Those views use explanatory previews / Not recorded / Not available, not invented fields, numbers, medical answers or completed operations.
- More destinations without a specified action inventory are read-only explanatory panels. No guessed action buttons.
- Existing synthetic medication/prescription/report fixtures remain illustrative containers, with no medicines/doses or clinical interpretations.
- No existing functional capability beyond Phase 1 was found. Authentication success against a live account remains unverified from the original implementation.
- Final icon approval and tagline clearance remain open decisions in v2; existing supplied artwork and configurable provisional tagline are preserved unchanged.

Validation and final changed-file inventory are recorded in `VERIFICATION.md` after implementation.
