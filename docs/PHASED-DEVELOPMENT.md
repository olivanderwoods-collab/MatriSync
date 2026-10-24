# MatriSync implementation status — 25 October 2026

Latest follow-up fixes unlinked Mother/child records appearing in the clinician workspace under the same development account. Workspace-scoped record views and mutation checks now exclude them from lists, counts, direct URLs and document operations, while preserving existing local records. Verified account roles and actual cross-account sharing remain pending; see the current verification and checklist.

The [25 October decisions](DECISIONS-2026-10-25.md) record the approved access-plan changes and all 19 browser comments. This phase adds encrypted local professional/facility profiles and credential documents, separate child records, shared Mother-profile creation by clinicians, camera capture, Home/form/navigation corrections and first-name AI reply formatting. Direct profile load/first Mother claim and clinician Home assignment acceptance are implemented in the isolated synthetic workflow only. Real E2EE sharing, verification, full-profile retrieval and MatriSync device transport remain pending.

Use the [current manual checklist and next steps](CHECK-THIS-BUILD-2026-10-25.md). The earlier approval sequence below is historical where superseded. No service deployment or paid/cloud integration is part of this update.

---

# Previous implementation status — 23 October 2026

The [confirmed product decisions](DECISIONS-2026-10-23.md) supersede the historical status below. The public role is Mother. Doctors create/approve patient-level referrals; organizations initiate them and own the eventual MatriSync device transfer. Professional navigation has four main tabs and patient profiles replace the main navigation with patient-specific tabs and a direct Back to Patients link.

New private local records now open automatically using an account-scoped, non-extractable device key. Existing vaults require the old passphrase once to enable the same behavior without rewriting their ciphertext or attachments. There is no routine passphrase/idle lockscreen. This is device encryption; live end-to-end sharing is not implemented or activated.

Development/demo builds include an isolated synthetic linking and assignment workspace: username/code request, mother's approval, staff assignment and acceptance, revocation, doctor-created test prescriptions/referrals/follow-ups, organization initiation and actor/time history. It is memory-only, clears on reload/logout and is excluded from production bundles. The existing Guest preview is retained for development; the final-release checklist requires removing all demo data.

Inventory now contains Refunds / Settlements and Distributor Coordination; the separate Financial Records/Financial Settlements entries are removed. This is navigation/preview work, not an operational refund ledger. Organization Home and More are simplified. Duplicate logout controls are removed; top logout requires confirmation and Cancel returns Home. Signed-in routes use account labels and empty records rather than default mother/child profiles. Brand punctuation, Help title and compact language display are corrected. Companion routing now admits ordinary greeting/familiarity questions while retaining clinical/distress handling.

See [release gates](RELEASE-GATES.md) and [verification](VERIFICATION.md). Earlier milestones are retained below for provenance, not as the current unlock or navigation specification.

The expanded Mother profile is stored encrypted locally. MatriSathi receives only the saved name and dated pregnancy stage, with a user toggle; reports and diagnosis quotations are deferred by explicit user choice. Direct identity/stage questions read the saved fields without model generation and show their source label. The bundled behavior packet guides inference, with separate refusal/output checks; it does not train the model. Read [this build's manual checklist and next steps](CHECK-THIS-BUILD-2026-10-23.md).

---

# Previous implementation status — 22 October 2026

Updated the existing `app` checkout on `codex/phase-1-demo`; no rebuild or reset. Source publication follows the newly authorized GitHub workflow; no application deployment. Existing Auth/Guest/PWA, exact Medical Green tokens, artwork and uncommitted work are retained. Later direct instructions supersede the guide's original UI-only boundary.

## AI continuation

The supplied 22 October AI instructions select Qwen3-0.6B, Gemini 3.8 Flash and Tavily under a strict zero-cost budget. Offline worker installation, chat, settings, separate usage displays and safety controls are implemented. Online AI/search/media remain disabled pending project/App Check/global quota controls and a secure free proxy. The supplied test medicines are not promoted to verified knowledge. See [AI status](AI-PROVIDER-EVALUATION.md) and [verification](VERIFICATION.md) for completed versus blocked acceptance checks.

## Completed this phase

- Applied all 16 latest navigation annotations. Mother Visits removed; More loses duplicated record links, places Profile Settings first and moves Language to the compact Home header. Professional Home loses repeated shortcuts, Recent consultations and Sync state. Patients uses search and Add patient; New Consultation/Find Possible Duplicates removed. Patient History/Vitals/Visits removed. Professional More contains Profile first, Notifications, Professional Verification, Facility Affiliation, Help and Log Out; Settings is merged into Profile. Back is available on workspace subpages. Safe legacy redirects preserve bookmarks. Organization navigation remains unchanged.
- Signed-in professionals now have an initially empty private patient directory with Add, Edit and search. These are account-owned records, not claims of clinician verification or facility access. Existing Guest sample profiles remain isolated.
- Added an encrypted local vault with a separate passphrase, no persisted key, account-bound authenticated encryption, automatic idle/reload/logout locking, cross-tab revision checks and atomic file/metadata saves. Device records use IndexedDB; the service worker still caches only public assets.
- Reports and existing prescription documents can be uploaded locally for a private patient, and into the mother's own record under My Health. PDF/JPG/PNG/WebP, maximum 10 MB each; file signatures checked. Original bytes and supplied source/date metadata are retained. Download recovers the original bytes and explicitly notes that the downloaded copy is outside the encrypted vault. No document interpretation, verification or prescription authoring is implied.
- Built a separate encrypted Firestore structured-record adapter with server reads and transactional conflict detection. Confirmed the existing database is Standard in Mumbai using read-only CLI inspection. The live connection is disabled, and the app does not invoke the adapter on record edits. A strict projection excludes document bytes, filenames and document metadata from cloud backups. Prototype Firestore rules restrict access to the matching non-anonymous Auth UID; prototype Storage rules deny all cloud file operations. Nothing was deployed.
- Added two test-only dependencies (`fake-indexeddb`, `@firebase/rules-unit-testing`). Firebase CLI, formatting tools and portable Java are isolated in ignored `.local-tools`; no system-wide Java installation or billing change.

## Current limits and next phase

Local storage is working; encrypted Firebase backup/restore **UI and live activation remain pending**. Before connecting it, compare existing live rules, review prototype access rules, and implement explicit restore/conflict handling and key recovery/rotation decisions. There is no cloud file backup, passphrase recovery or device migration in this phase. Device/browser data loss can therefore lose records; setup explains this limitation.

This phase does not establish clinician credentials, patient consent, facility membership or cross-account sharing. Clinical prescription creation/authorization, follow-up scheduling, referral transmission, children-to-caregiver linkage, reviewed educational content, online AI/mic/camera interpretation, BLE/NFC, operational inventory, payments and notifications remain future stages. Uploaded prescription copies are supported; prescribing is not. Other account workflow previews remain labelled synthetic/unavailable. No paid connection has been activated.

The supplied drug/interaction database remains testing-only and unverified, with its existing version/hash conflict. No clinical claims or external AI results were invented. Mother own records and professional patient records are distinct profiles within the same account vault; this does not link other people's accounts or grant access across facilities.

Details: [storage model](FIRESTORE-MODEL.md), [verification](VERIFICATION.md), [capability inventory](CAPABILITIES.md). Earlier milestone details follow for provenance.

---

# Earlier stage — 21 October 2026

This updates the existing app on `codex/phase-1-demo`. The user's later mother/caregiver annotations override the conflicting v2 tab/action inventories. Other role menus and existing Auth, Guest, theme and PWA behavior are preserved. Nothing was pushed or deployed.

## Implemented in this stage

- Mother and child Vitals/Medical History tabs removed; old URLs redirect to Overview. Medicines renamed Prescriptions with compatible redirects. Child Visits redirects to Follow-ups; the separate child Visits tab and repeated bottom shortcuts are gone. Mother Visits remains because the merge annotation targeted children.
- Home uses the saved first name and no longer has repeated shortcuts or a vitals card. Follow-up/referral summary components render only scheduled/initiated events. The current synthetic fixtures supply no such active events, so both cards are hidden. A future authorized record source still needs to feed these components; no record was fabricated.
- Mother Profile Settings accepts a name and JPG/PNG/WebP picture, resizes it locally and links the shell picture to settings. Guest profiles survive same-tab reload through sessionStorage and clear on reset/exit. Account-demo profile edits currently remain in memory only; there is no cloud profile or photo upload. Clinical fixture identity remains separate from this display name.
- Help has Back with a More fallback. Education has searchable topics, category selection, article layouts and a disabled Watch Video control until reviewed articles and the user's YouTube links arrive.
- AI Companion now has Chat and Drug information. Drug information contains Drug/Herb search and Interaction checker, with Add, removal, duplicate detection, a ten-entry cap, and Search from two entries.
- The two user-supplied draft databases power deterministic local lookup in the explicit demo build. Generic/alias search uses only supplied mappings. Unknown/local-language/brand names are not guessed. All displayed reference content is labelled unverified test data. Found and missing entries are listed separately. Rules preserve conditions, draft severity and source links; unknown route/context is never silently treated as applicable. All 45 pairs are checked for ten known entries; multi-drug effects beyond pairs are not assessed.

## Test database import and conflict

Original files are copied unchanged into `fixtures/medicine-demo/`. They are data, not application instructions.

| Item | Result |
|---|---|
| Catalogue | 162 records, all clinical-release flags false |
| Matrix | 13,041 unordered pairs; 151 rules; 84 cited sources |
| Draft identified pairs | 652 |
| Unresolved pairs | 12,389 — never displayed as no interaction or safe |
| Identity join | All 162 `legacy_id` values match catalogue IDs and names |
| Catalogue SHA-256 | `ce689c4dfd476bf5a5b60d999c4675d3f0f03e10e65a6bb021633050dda486a4` |
| Matrix SHA-256 | `d17cf10f8b3081a798f50154dfac87103dcac69ba32e89160aaded6229064c9c` |
| Referenced catalogue hash | Matrix expects `d6d1cd628ea327372df9dec8832ff8dde9dfdf685695be60f191bebfebb832c5`, a different version |

The hash/version conflict is retained; files are not silently rewritten or promoted to a verified database. Structural tests cover every pair, source reference, ID, severity mapping, aliases and boundary conditions. These checks do not clinically validate the content or verify the linked websites.

`pnpm build:demo` includes the unchanged test files. `pnpm build` replaces the loader before asset generation and asserts that neither JSON fixture is emitted. Clinical use remains disabled independently of file metadata. Both build types verify this boundary. A replacement verified database will require an explicit import, schema/identity migration check and review of clinical-release permissions; replacing files alone cannot enable clinical use.

## Local preview recovery

Both local servers had stopped. Loopback HTTP did not respond, independently of internet availability. The restored preview uses the production PWA shell at `http://127.0.0.1:5173/`. `Start-MatriSync.ps1` starts the existing build in a hidden process on that port. It does not build, install dependencies or deploy. Refresh the browser's previous error page. After first load and service-worker installation, static assets including demo references work offline. The host process must be restarted after a machine restart; this launcher does not create an operating-system startup service.

## Next stages and concrete dependencies

1. **Education content:** replace pending article layouts with reviewed text, source attribution and the user's YouTube links. No clinical articles were invented.
2. **AI integration:** evaluate a provider using multilingual names, Indian brands, ambiguous herbs, label photos and noisy speech. Chat, online lookup, microphone and image recognition remain disabled. Camera exposes the requested upload/capture choices as disabled controls. No media is captured or uploaded. The transcription confirmation/retry/delete flow and brief-context memory still need implementation after the provider contract is chosen. See `AI-PROVIDER-EVALUATION.md`.
3. **Authorized records:** design and implement ownership, professional verification, child linkage, record provenance, document handling and access rules before connecting real records, prescriptions, follow-ups or referrals. UI role selection is not authorization. The guide leaves these policies unresolved; no guessed database collections or privileges were added.
4. **Operational services and hardware:** notification channels, BLE/NFC protocol, encryption/key handling, device firmware and refund/distributor policies remain explicit open decisions from the guide. No hardware or messaging service is active.
5. **Paid services and deployment:** no paid API, billing, payment, cloud database or deployment was enabled. Any billable integrations must remain disconnected until the user approves the selected provider and budget.

## Files and verification

Core changes: `src/main.tsx`, `workspace.tsx`, `workspace-spec.ts`, `session.ts`, `profile.tsx`, `care.tsx`, `matrisathi.tsx`, `medicine.ts`, demo loader/stub, `styles.css`; build separation in `vite.config.ts`, `package.json`, `scripts/verify-build-mode.mjs`; preview launcher/server; regression tests and documentation. Existing uncommitted user work is retained. No dependencies, Firebase project settings, theme tokens or original artwork were changed.

Verification results are recorded in `VERIFICATION.md`. Remaining limitations above are not completed clinical/software capabilities.
