# MatriSync: current development handoff

Prepared 9 November 2026, Asia/Calcutta. Read this before historical handoffs. This document describes completed work and remaining boundaries; it is not a claim of clinical or production readiness.

## 1. Resume checkpoint

| Item | Current value |
| --- | --- |
| Source and submission repository | https://github.com/olivanderwoods-collab/MatriSync |
| Continuing branch | `main` |
| Latest application-code commit | `5062f19bf9543d31ce06ff7b02c06a91e5a158b4` |
| Application tree at that commit | `d7ed462250f0a1e5050f172bf0cfa610c5f1ed6d` |
| Application-code commit parent | `1085a62c0064940a8e1cdb73c9b7679bb7e243ae` |
| Required live URL | **https://matrisync-c9de7.web.app** |
| Firebase project and Hosting site | `matrisync-c9de7` |
| Deployed shell cache | `6f27aa746ef9` |
| Deployed main bundle | `assets/index-BLWSUBon.js` |
| Latest completed feature | Stable approved-handoff retry recovery and lossless compact transfer |
| Next software slice | Browser reload/retry and cached-update acceptance; then scoped authenticated acceptance/device-key recovery |

This updated handoff is a documentation-only child of the application commit above. The supplied November 9 transfer ZIP records the **earlier** checkpoint `1085a62c0064940a8e1cdb73c9b7679bb7e243ae`, descended from `e85eac12a8790d08eaf119f85c78acc219ca6208`; it does not describe this new release. Read GitHub main and inspect later commits. Current release detail: `docs/CARE-RETRY-2026-11-09.md`.

The user explicitly selected this repository instead of `MatriSync--Health-a-thon-submission`, required continued use of the submitted web.app URL, and authorized all fixed code on main with an explicit note that it was committed **after the Health-a-thon 2026 submission date**. Preserve that notice in future commits and documentation. Do not backdate, rewrite history or force-push. Earlier instructions to preserve main without merging were superseded by this direct user decision.

## 2. What the product is, and how far it is developed

MatriSync is an offline-first maternal-record and referral-continuity prototype by Team UNCODED. It has the approved Mother/Caregiver, Healthcare Professional and Healthcare Organization workspaces, the Medical Green design, local records, a fictional submission case, and prototype encrypted structured-care workflows.

The submission demo is working and hosted. The connected-care client, permissions and encrypted transfer have passed a real Firebase emulator journey. Recovery of completed handoffs, immutable receipts and unfinished referral drafts is implemented. Stable pending-send recovery and compact transfer are implemented and emulator-tested. Current browser interaction checks, public authenticated multi-account acceptance, device/key recovery, public facility verification and physical NFC/BLE integration remain incomplete. A percentage would obscure these distinct levels of readiness.

| Area | Implemented | Evidence / limit |
| --- | --- | --- |
| Public navigation | Three existing workspaces and linked demo routes | 27 direct routes checked in the 7 Nov public release; latest public update and referral summary checked again 9 Nov |
| Fictional case | Ophelia Frost linked to Dr. Olivander Woods, stable IDs, six medications, separate blood request, 15-event timeline | Deterministic fixture; not real clinical activity |
| Reports | Existing references and local upload/read-back architecture | Original Ophelia investigation files/results missing; do not fabricate |
| Handoff/PDF | Dynamic demo summary, downloadable PDF, print view and `.msht` export | Live PDF downloaded, parsed and both pages inspected 7 Nov; summary rechecked 9 Nov |
| MatriSathi | Scripted greetings, navigation, source-fact read-back and safety responses | Explicitly labelled not generative AI; optional local model is a separate path |
| Local records | Encrypted browser vault and prototype encrypted cloud-record support | Device/account isolation and unit/rules coverage; not a reviewed recovery system |
| Connected care | Facility invitations, staff assignments, Doctor-created Mother profiles/access codes, append-only contributions, grants and encrypted handoffs | Real nine-account Auth/Firestore emulator journey passed; public authenticated journey not certified |
| Completed handoff recovery | Original packet, ID, timestamp and summary snapshot saved encrypted | Reopens exact stored bytes; local-save failure after cloud success is reported without falsely claiming cloud failure |
| Received handoff recovery | Basic snapshot plus later online verification | First-received time/content preserved; offline rescans cannot erase verification; verification is historical |
| Unfinished referral recovery | Exact manual fields, destination and packet limit encrypted per account/patient | Reload recovery, sequential edits, competing tabs and cleanup verified |
| Approved-operation recovery | Signed/encrypted pending state, stable ID, authoritative reconciliation and transactional retries | Failure injection and real emulator checks passed; current browser checks blocked |
| Compact connected-care transfer | Lossless positional encoding, bounded compression and binary JWE transport with legacy decoding | Synthetic sample 2,351 to 1,104 bytes; not verified to fit current tag |
| Older sharing/attachment pilots | Separate controlled encrypted sharing, referral and chunked attachment code exists | Historical local evidence, including 10 MiB attachments; not automatically a public MVP capability |
| Inventory and future workflows | Existing previews and Coming Soon controls retained | Synthetic/read-only or incomplete; not live stock, scheduling, payment or clinical AI services |
| Physical hardware | Software framing and reference BLE implementation | No app-to-current-board physical acceptance; do not flash |

## 3. Requirements and reading order

1. This handoff and `MATRISYNC_ACCOUNT2_START_PROMPT.md`.
2. `AGENTS.md`, interpreted with the later user decisions in section 1.
3. `docs/EMERGENCY-MVP-REQUIREMENTS-2026-11-07.md` and `docs/MatriSync-Master-Development-Guide-v2.txt`.
4. `docs/CARE-RETRY-2026-11-09.md`, then `docs/CARE-DRAFTS-2026-11-08.md`, `docs/CARE-ACCEPTANCE-2026-11-08.md`, `docs/CARE-RECOVERY-2026-11-08.md`.
5. `docs/PUBLIC-RELEASE-2026-11-07.md` and `docs/POST-SUBMISSION-UPDATE-2026-11-08.md`.
6. Relevant protocol/requirements documents: `docs/FINAL-REQUIREMENTS-2026-11-05.md`, `docs/SHARING-ACCESS-PLAN.md`, `docs/DESTINATION-REFERRAL-PROTOCOL.md`, `docs/ENCRYPTED-ATTACHMENT-PROTOCOL.md`, `docs/RELEASE-GATES.md`.

Historical documentation is retained as evidence, not rewritten to look current. Old README test counts (116), older acceptance counts (128), old cache IDs, RUHI naming, the abandoned submission repository and earlier branch restrictions must not override this handoff's dated checkpoint. The current companion name is **MatriSathi**. Granular staff PIN/device/accepted-upload requirements in older final plans remain targets where not implemented.

Preserve the approved UI. Do not add tabs, sections or buttons, redesign the app, start unrelated Inventory expansion or create another deployment URL. Missing values remain missing. Do not introduce diagnoses, doses, treatment recommendations or invented report interpretation. The assistant owns builds and developer verification; do not ask the user to operate test pilots.

## 4. Codebase map and architecture

Stack: React 19, TypeScript 5.9, Vite 6, React Router 7, Firebase client SDK 12, Web Crypto, IndexedDB, Vitest 3, ESLint, PDF.js and optional Hugging Face/ONNX local inference. `pnpm-lock.yaml` pins the dependencies. Firebase Hosting serves static `dist`; Auth and Firestore support signed-in prototype functions. There is no authorization to add a paid service.

| Files | Responsibility |
| --- | --- |
| `src/main.tsx`, `workspace.tsx`, `navigation.tsx`, `workspace-spec.ts` | Routes, existing workspaces, controls and placeholders |
| `src/auth.ts`, `session.ts`, `account-profiles.tsx` | Firebase authentication, tab Guest state and account profiles |
| `src/submission-demo.ts`, `submission-demo-page.tsx`, `submission-document.ts` | Fictional case, summary, dynamic PDF and package |
| `src/ai/scripted.ts`, `ai/companion.tsx`, `matrisathi.tsx`, `ai/safety.ts` | Scripted conversation, UI, exact care facts and safety handling |
| `src/ai/offline.ts`, `ai/offline.worker.ts`, `ai/document-context.ts` | Optional local inference and explicitly reviewed local text |
| `src/records-model.ts`, `record-vault.ts`, `records-cloud.ts`, `records.tsx`, `vault-*` | Local records, encrypted persistence and prototype cloud records |
| `src/care-model.ts`, `care-client.ts`, `care-crypto.ts`, `care.tsx`, `care-page.tsx` | Current structured-care data, client authorization/operations, encryption and UI |
| `src/care-storage.ts`, `care-draft-session.ts`, `care-document.ts` | Saved copies/receipts/outgoing handoffs/drafts; queued draft edits; exact summaries |
| `src/referral-*`, `src/sharing-*` | Older/refined referral and controlled sharing subsystems; do not confuse with current care creation |
| `src/handoff-frame.ts`, `ble-handoff.ts`, `ble-handoff-panel.tsx` | Framing, bounded packet transport and reference BLE controls |
| `firestore.rules`, `storage.rules`, `firebase.json`, `.firebaserc` | Authorization and deployment/emulator configuration |
| `scripts/build-production.mjs`, `verify-build-mode.mjs`, `build-sw.mjs` | Production flags, exclusions and cache version generation |
| `tests-care`, `tests-rules`, `src/*.test.*` | Browser fixture, real emulator journey, rules and unit tests |

Several historical systems coexist. Do not assume a successful legacy `referral-outbox` test proves retries for `createCareHandoff`. Inspect the actual call path before adapting code.

## 5. Authentication, data and clinical permissions

Workspace selection is navigation, not proof of role or verified credentials. Guest mode is synthetic and tab-scoped. Signed-in care uses Firebase authentication plus server-enforced facility/staff membership and per-case access. A self-selected workspace must never become clinical authority.

Care roles currently defined are Doctor, Nurse and Lab. Doctor contribution kinds are clinical-note, prescription and referral; Nurse kinds are observation and administration; Lab uses laboratory. Mother and facility-admin accounts cannot author prescriptions. Contributions are append-only and attributed to the authenticated actor, assigned role and server timestamp. Current rules reject forged roles, foreign actors, strangers and revoked new access. Already-saved offline copies remain readable under the previously approved revocation policy.

`CareProfile` records name, birth date, source local ID/UID and optional structured details/history. `CareEntry` carries kind, actor UID/name/role, recorded/server time, text and optional referral fields. `CareView` distinguishes full authorized profiles from `snapshotOnly` received handoffs. A basic snapshot must not grant staff contribution rights. The Mother has separate issued patient ID/access credentials; they are not embedded in the handoff.

Current care collections include facilities/staff/device membership, cases and their entries, per-case access and handoffs. Read `care-client.ts` and rules for exact schemas. Encryption uses the existing device and case-key implementation; do not replace or expose keys. Browser storage for care uses `matrisync-care-v1` / `copies`, with account-scoped keys for patient copies, `outgoing:`, `receipt:` and `draft:` records. Persisted clinical payloads are encrypted. Losing keys or clearing browser storage remains a recovery gap.

Original uploaded PDFs/images remain local in the current structured-care MVP. Separate historical attachment pilots do not change that public claim. Never upload clinical documents, deploy weaker rules or create production bootstrap invitations as a shortcut.

## 6. Demo data, reports, summaries and MatriSathi

The authoritative fictional case is `submissionDemoCase()` in `src/submission-demo.ts`. IDs: `MAT-DEMO-001` and `DOC-DEMO-001`. There are six medications, a separate `BLOOD-DEMO-001` PRBC request and 15 supplied chronological events. Prescribed, administered and initiated times are distinct. Unknown administering personnel stay Not recorded. O-positive requested blood product does not establish the patient's blood group. Source ultrasound/blood reports and missing clinical values remain unavailable.

Guest state lives behind `src/session.ts` in tab sessionStorage with a memory fallback; records are seeded through the existing deterministic fixture path. Use the existing Guest lifecycle and tests. Do not run blanket browser-storage cleanup, clear Firestore collections, delete Auth users or seed fictional clinical data into signed-in live accounts. This handoff requires no cleanup or reseeding.

The demo handoff/PDF is generated from current fictional records. It is not a static PDF masquerading as dynamic output. The last inspected PDF had two pages. The exported `.msht` demo package was 2,827 bytes, plaintext fictional data with dictionary version 0. It is not the encrypted connected-care packet and does not fit a 48-byte NFC tag. Neither export implies clinical approval, dispatch, arrival or receiving-team acceptance.

MatriSathi's basic conversation path is deterministic and labelled scripted/not generative AI. It answers navigation and supported source-fact prompts and uses safety handling for urgent language. Optional local model download/inference is separate and was not revalidated in the latest public release. External AI is disabled; never insert provider secrets into browser configuration or describe prompting as model training.

## 7. Latest recovery work in detail

Approved operations now persist signed/encrypted before any cloud mutation. The original packet, snapshot, ID and timestamp survive uncertain outcomes. Retry uses authoritative matching evidence or a permission-checked transaction on the same IDs; unavailable reads never mean absence. Restoring a draft or pending approval never sends automatically. Existing controls handle recovery and preserve newer drafts. See `docs/CARE-RETRY-2026-11-09.md` for protocol, compact format and failure boundaries.

Completed outgoing handoffs preserve original packet bytes, identity, time and snapshot. They can be reopened/printed after reload. A local-storage failure after a confirmed cloud commit returns the confirmed handoff with a recovery warning, not a misleading cloud failure.

Received handoffs preserve their first snapshot/time. A later online check can add `verifiedAt`; later offline rescans cannot downgrade it. Conflicting content under an existing handoff ID is rejected. Concurrent saves compare before writing. A saved online check is historical and does not assert current offline authorization.

Unfinished manual referral forms now save exact fields, destination and capacity under an encrypted account/patient-specific draft. `CareDraftSession` serializes same-tab writes. Atomic revision comparisons reject cross-tab overwrites. A successful approval clears only that revision, storing an encrypted cleared marker to prevent stale-tab resurrection; a newer draft in another tab survives. Failed saves keep text in the open tab and expose a warning. A saved draft never automatically submits. Existing approval and server permissions remain required. Contribution-note text is not covered.

Wait for the saved status before leaving. Browser leave-page warnings are best effort for pending/failed saves, not a guarantee against process crashes or mobile termination. Conflicts require copying unsaved edits before reload. Browser/device-key loss is not solved. Do not describe draft persistence as an offline approval queue or exactly-once cloud delivery.

## 8. Verification and honest boundaries

Current continuation checks on 9 November 2026:

- **150 unit tests / 33 files**, **10 current care/record rules tests**, and **one real nine-account Auth/Firestore emulator journey** passed. The latter includes compact receiving, lost acknowledgements, unavailable reconciliation, concurrent retries and revocation.
- TypeScript, ESLint and documented production build passed. No dependencies or security rules changed.
- Hosting-only deployment succeeded. **16 public static files** matched the tested build byte-for-byte; `/`, `/professional`, `/organization` and `/mother` returned the expected HTTP shell. Cache `6f27aa746ef9`.
- **Current browser checks did not run:** local browser use is disabled in Work settings. The new fixture reload/retry flow, rendered public app and cached Update now behavior remain pending. No physical hardware was accessed.
- Local evidence: `.local-tools/compact-{unit,integration,lint,build,deploy}.log`, `compact-live-verification.json`, `handoff-size.json`, and `retry-rules.log`.

Historical previous release evidence (8–9 November, before this continuation):

- **134 unit tests across 32 files passed.** Six new draft cases cover exact encrypted recovery, account/patient isolation, concurrent writes, cleanup and sequential sessions.
- **10 current care/record Firestore rules tests passed.** Four historical sharing-pilot suites need their separate port-8087 emulator; their broad invocation previously failed setup and was not claimed as passing.
- **One real nine-account Firebase Auth/Firestore client integration journey passed.** Two facilities, six staff and one Mother; actual client operations, encryption/signatures and rules with fake-indexeddb. It covers grants, actor permissions, prescriptions, contributions, Mother credentials, handoff transfer, corruption/capacity failures, revocation and saved offline copies. Latest additions assert draft editing creates no cloud contribution, rejection retains the draft, and success clears it.
- **Real-browser fixture checks passed.** Real IndexedDB/device encryption with mocked account/network calls: multiline reload recovery, patient isolation, two-tab conflict, rejected packet size, approved-draft cleanup and completed preview restoration. This fixture is not live public authenticated acceptance.
- **TypeScript, ESLint and production build passed.** Expected optional AI/PDF bundle-size warnings remain. Production excludes local sharing pilot/test fixtures/synthetic assignment workflows.
- **Hosting-only deployment succeeded at the unchanged URL.** Six public assets matched local build bytes: index, service worker, main bundle and all three care chunks. A cached public client offered Update now, moved to `index-CIQDKopI.js` and generated the fictional summary without captured warning/error logs.

Earlier public release evidence: all three role route sets, six medication cards, dynamic PDF download/open/render, package download and five MatriSathi prompts were checked 7 November. Those are dated checks, not a fresh exhaustive rerun of every browser/device on 9 November. Playwright browser launch was blocked in the earlier sandbox; available in-app browser checks were used. No claim of full historical Playwright coverage.

Still unverified/incomplete: public authenticated nine-account UI journey; production facility authority/bootstrap; account-wide role/recovery policy completeness; current browser retry/update acceptance; device/key recovery; accepted-upload review and granular device/PIN target workflows; original missing reports; optional generative-model public behavior; independent security/clinical assessment; physical BLE/NFC acceptance.

## 9. Set up the next account

Prefer a fresh clone from GitHub into a new folder. Do not reset the existing working directory.

```sh
git clone https://github.com/olivanderwoods-collab/MatriSync.git
cd MatriSync
git switch main
git log -3 --oneline
git merge-base --is-ancestor e85eac12a8790d08eaf119f85c78acc219ca6208 HEAD
git status --short
pnpm install --frozen-lockfile
```

If main has advanced, inspect subsequent changes rather than resetting it. Confirm the handoff publication commit from `TRANSFER-CHECKPOINT.txt` or the root handoff file's GitHub history. A new account does not inherit this chat, credentials, browser/device keys, dependencies or filesystem permissions.

Use the intended Firebase **web app** configuration in an ignored `.env.local`, using `.env.example`. Required names: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`. Production must point to `matrisync-c9de7`. Web configuration is client-visible configuration, not a service-account key. Retrieve it through authorized project access; this guide intentionally contains no tokens or private credentials.

Production uses `VITE_CARE_ENABLED=1`, `VITE_SHARING_PILOT=0`. Keep `VITE_FIREBASE_AUTH_EMULATOR_URL` and `VITE_FIRESTORE_EMULATOR_HOST` empty for production. Tests supply emulator settings. Never place provider secrets, service-account JSON, Firebase CLI refresh tokens or private keys in source or `VITE_*` values.

```sh
pnpm dev
pnpm test
pnpm lint
pnpm build
```

If the existing Windows sandbox's pnpm script wrapper tries to reinstall dependencies and fails on symlink privileges, with dependencies already installed use these equivalents:

```sh
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc -b
node node_modules/eslint/bin/eslint.js .
node scripts/build-production.mjs
```

Check every exit code. `build-production.mjs` alone does not replace the separate TypeScript check. Do not use historical `build:submission` for Hosting; it is an emulator-oriented development build.

For the current emulator journey, use Java 21+ and Firebase CLI:

```sh
firebase emulators:start --only auth,firestore --project demo-matrisync --config firebase.json
# In another terminal in the same checkout:
node node_modules/vitest/vitest.mjs run --config vitest.care-integration.config.ts
node node_modules/vitest/vitest.mjs run --config vitest.rules.config.ts tests-rules/care.test.ts tests-rules/records.test.ts
```

Auth binds 127.0.0.1:9099 and Firestore 127.0.0.1:8086. On this Windows machine Java needed `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=`. Use the existing portable Java if available or an authorized Java installation. The integration configuration forces `demo-matrisync`, uses randomized synthetic identities and checks loopback endpoints before seeding. Do not adapt the emulator owner bypass for production. Stop test services after use.

Browser fixture command: `node node_modules/vite/bin/vite.js --config tests-care/recovery.config.ts`. Open its printed local URL plus `/tests-care/recovery-fixture.html` and follow `tests-care/RECOVERY-CHECKS.md`. It does not contact Firebase. Do not click hardware connection controls during software checks.

## 10. Exact next development slice

The former planned stable-operation slice is **implemented**, not work to restart. Read `docs/CARE-RETRY-2026-11-09.md` and inspect the current code/tests. Do not replace the stable operation with a new UUID per retry or re-encode already approved packets. Never weaken append-only rules or automatically submit a restored draft.

First complete the blocked browser checks when browser access is available: updated `tests-care/RECOVERY-CHECKS.md` reload/retry, account/patient isolation, original completed summary and newer-draft preservation. Then check the actual public app and cached Update now path. HTTP byte equality alone is not browser acceptance. The user does not need to run developer pilots.

Next continue scoped public authenticated acceptance and explicitly designed device/key recovery. Changed keys/revoked access can intentionally leave an uncommitted approval pending; no discard/replacement policy or cross-device recovery has been invented. Public facility verification stays deferred until authority is resolved. Accepted-upload/device/PIN requirements remain targets where not implemented.

The latest user asked to minimize NFC handoffs: lossless compact connected-care transfer is now implemented, with a 53% reduction on the recorded synthetic sample. It still exceeds the only verified 48 tag bytes. Inspect full usable tag capacity and obtain the current bridge source/protocol before any separate hardware work; no firmware flashing is authorized in this slice.

## 11. Hardware boundary

Actual user hardware is a standard ESP32 WROOM-style board with Elechouse PN532 V3 and an existing working Facility Bridge V2.2. Only 48 bytes in tag blocks 4–6 were user-verified. A 32,768-byte reference BLE RAM buffer is not tag capacity. Historical ESP32-S3 documentation is reference work, not proof of compatibility. Do not flash, overwrite firmware or claim NFC success. Obtain the actual bridge protocol/source and confirmed tag capacity before future integration, then separately verify read-back and receiving behavior on physical hardware.

## 12. Deployment, publication and access

Use the existing Firebase project/site, never a new URL:

```sh
firebase login:list
firebase deploy --only hosting --project matrisync-c9de7
```

Authenticate through the service's normal flow if the next account lacks access. Never ask for pasted tokens/passwords. The connected GitHub app must be authorized for `olivanderwoods-collab/MatriSync`; Firebase CLI authentication is separate. A prior GitHub app installation only covering another repository caused a 403, but current repository writes now work. Do not assume one connector login grants the other service.

Only deploy after successful build/checks. Do not deploy Firestore/Storage rules or change production users/data as part of this Hosting update. Check the actual public URL, direct routes, key exports and existing-client Update now path; compare index/service-worker and fingerprinted JS to the build. Retain rollback capability. Last billing-disabled observation was 7 Nov; it is historical, not a fresh account audit.

For source publication, use ordinary non-force Git push when available. If local Git credentials are unavailable, the connected GitHub app was successfully used to create a tree on the current remote tree, create a child commit and update main with an expected-head lease. Verify all changed blob hashes and preservation of unrelated remote files. Never create a replacement tree from an incomplete local snapshot. Keep README's post-submission notice and `docs/POST-SUBMISSION-UPDATE-2026-11-08.md`.

## 13. Local machine paths and transfer warnings

Current continuation checkout: `C:\Users\Olivander Woods\OneDrive\Documents\ChatGPT\MatriSync\continuation-2026-11-09` (fresh clone of main). Existing dependency installation is reused through a local node_modules junction; `.env.local` is private/ignored.

Preserved previous-account workspace: `C:\Users\Olivander Woods\Documents\Codex\2026-11-07\files-pasted-by-the-user-matrisync`. The following paths are historical and must not replace current main:

- Active edited source: `work\active` under that workspace.
- Release evidence and this transfer bundle: `outputs` under that workspace.
- Current checkpoint: `work\CHECKPOINT.md`.
- Original preserved checkout: `C:\Users\Olivander Woods\OneDrive\Documents\ChatGPT\MatriSync\app`.
- Existing original CLI: `.local-tools\node_modules\firebase-tools\lib\bin\firebase.js` under the original checkout.
- Existing portable Java: `.local-tools\java\jdk-21.0.12.1+1-jre` under the original checkout.

**Important:** `work\active` local Git HEAD still reads `11753f8cba30b14e4883f238c88a02ca2d4158a6`. Modified/untracked source was already published through GitHub APIs. It is not work to discard. Local README lacks main-only disclosure additions; do not blindly publish it. Fresh GitHub main is the preferred portable source. Older `work\submission`, `MatriSync-Verified-Submission-Source.zip` and older release patches may be stale; do not use them as the current source.

The new transfer bundle contains this guide, starter prompt, exact checkpoint, release evidence and selected reference documentation with hashes. It excludes credentials, `.env.local`, dependencies, caches and browser/device keys. It is a documentation bundle, not a standalone app source archive. Clone the repository for code.

## 14. Completion protocol for the next account

Continue from the next slice instead of rebuilding or restarting the initial investigation. Preserve the same URL, current working features, original records and honest evidence boundaries. At each release state what changed, what actually passed, what remains simulated/unverified, an optional usability check and the concrete next task. Publish tested fixes to main with the post-submission disclosure and record the verified commit. Do not label the whole application complete while the open gates above remain.
