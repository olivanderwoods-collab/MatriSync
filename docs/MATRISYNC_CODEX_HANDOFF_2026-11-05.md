# MatriSync — final Codex development handoff, 5 November 2026

## Start here: authority and checkpoint

Read this file, then [the complete latest user requirements](FINAL-REQUIREMENTS-2026-11-05.md). They supersede conflicting historical priorities. Older guides describe previous stages, not promises of current functionality. Preserve the repository, original records, attachments, encryption keys and Medical Green design. Do not restart or migrate to another backend. The assistant performs developer verification; the user is not responsible for operating test builds.

- Repository: https://github.com/olivanderwoods-collab/MatriSync
- Handoff branch: `handoff/matrisync-codex-2026-11-05`.
- Base before the final phase: `a8466dc` (durable encrypted referral outbox), following `6a28b04` (documentation organizer). Both were pushed to `codex/phase-1-demo` before this handoff.
- Final implementation commit: **`3fd4b89e2d4b5cb65d84eddec14c9a993716733a`**. A documentation-only commit records this implementation hash. The exact commit containing this final handoff is obtained with `git rev-parse HEAD` after checkout; do not mistake the base commit for the handoff tip. The final response and local continuation checkpoint also record the pushed handoff-tip hash (a commit cannot literally embed its own hash).
- Main remains untouched. No deployment, paid service, real-patient test, physical BLE transfer or NFC success is claimed.

## A. Project identity and architecture

MatriSync is Team UNCODED's healthcare-first maternal-care continuity platform. Facilities, clinicians and assigned care personnel are the primary operational users. Mother/Caregiver access supports continuity, personal uploads, follow-up visibility and MatriSathi. RUHI is the companion inside MatriSathi: **R**asheek, r**U**maan, ne**H**a, zuba**I**r. Do not invent a medical expansion.

This is a React 19 / TypeScript 5.9 / Vite 6 PWA, React Router 7, Firebase JS 12, JOSE 6 and Transformers.js 3.8.1. `pnpm-lock.yaml` is authoritative. There is no general production application server. A separate Node identity proof is review-stage metadata infrastructure only. Firebase Auth is lazy/session-scoped; private local vaults and received encrypted copies use IndexedDB. Controlled sharing uses an isolated Firestore relay emulator. Service workers cache the public shell, not patient responses. Optional Qwen weights use a separate model cache.

The existing interface has three workspace routes (`mother`, `professional`, `organization`), five navigation tabs per workspace, contextual patient pages and nested More screens. Healthcare-first is the new product priority; it has **not** been implemented by replacing this shell. `src/theme.css`, `src/styles.css`, `src/data.ts`, `src/navigation.tsx`, `src/workspace-spec.ts` and `docs/branding/` preserve the design and supplied logo. Unreviewed translations fall back to English.

## B. Exact development status

The active phase was durable referral delivery followed by compact BLE handoff and submission integration. Completed in this final phase: exact encrypted handoff creation, actual Web Bluetooth adapter, receiving-side exact-envelope verification, matching ESP32-S3 firmware, a controlled built submission mode, protocol tests, printable-document inspection and the GitHub/Bolt transfer package. Existing records and original attachments were not migrated or deleted.

The controlled software journey is Mother profile/originals → authorized Doctor → reviewed approved referral → initiating Organization → selected receiving Organization → independently recorded receiving events. The browser tests use separate authenticated clients and real application encryption with a **simulated GATT peripheral**. The hardware sketch cross-compiles for ESP32-S3; no attached physical board was tested. NFC reader/tag is undecided. Device RAM retention is not an NFC write.

Overall readiness: **stable development/demo checkpoint using synthetic data**, not a finished clinical product or completed full submission-core plan. The hosted normal build excludes controlled sharing. A Bolt import alone will not make localhost emulators, hardware BLE, verified knowledge or facility authorization available.

Latest target requirements are explicit: Facility Administrator, Doctor/Authorized Clinician, Nurse, ANM, ASHA and Registration Operator; facility case assignment; authorized specific devices; individual identity plus six-digit quick-unlock PIN; Leave locks staff session; Mother read-only healthcare records and pending/accepted personal uploads. These are **not all implemented**. A workspace selector is not authorization, browser fingerprints are not facility device enforcement, and no PIN-only authentication is acceptable. Healthcare screens now visibly restrict the prototype to synthetic data.

## C. Feature inventory

“COMPLETE AND TESTED” below means the named bounded feature under its stated test scope, never the entire clinical module.

| Module | Status | Actual scope and source |
| --- | --- | --- |
| Responsive shell, Guest navigation, themes, routes | COMPLETE AND TESTED | `main.tsx`, `workspace.tsx`, `session.ts`, `theme.css`; Guest fixtures remain separate and synthetic |
| Firebase email/password account flow | COMPLETE AND TESTED | `auth.ts`, `main.tsx`; emulator signup/login/restoration/logout/error tests; no fresh live-project login certification |
| Production granular healthcare roles | PARTIALLY IMPLEMENTED | Controlled relay has member/workspace, doctor/caregiver credentials and assignments; normal route roles remain insufficient for production |
| Private patient/Mother/child profiles and originals | COMPLETE AND TESTED | `records.tsx`, `record-vault.ts`, `records-model.ts`, `vault-*`, `child-records.tsx`; local encrypted persistence, legacy migration, originals, account/workspace isolation |
| Authoritative registration, permanent code loading, first Mother claim | PARTIALLY IMPLEMENTED | `identity-proof.ts`, `scripts/identity/*`, `tests-identity/`; isolated proof, no browser clinical loading/key fulfillment integration |
| Facility onboarding/registration operator | NOT STARTED | Public verification/bootstrap and granular operator authority absent; local profile creation is not authoritative registration |
| Controlled encrypted sharing and original files | COMPLETE AND TESTED | `sharing-client.ts`, `sharing-crypto.ts`, `sharing-chunks.ts`, `sharing-profile*.ts*`; source-scoped versions, original-byte matching, up to 10 MiB, bounded history pagination |
| Durable send recovery | COMPLETE AND TESTED | `sharing-outbox*`, `referral-outbox*`; immutable envelope retry, exact relay acknowledgement, revocation denial; no shared-edit reconciliation |
| Staff assignment and credential workflow | COMPLETE AND TESTED | `sharing-assignment*`, `sharing-credential*`, `shared-patients.tsx`; explicitly enrolled test scopes, acceptance and revocation; doctor/caregiver distinction only |
| Shared record editing/conflict resolution | NOT STARTED | Received versions are retained read-only snapshots, not collaboratively editable authoritative records |
| Referral drafting/approval/print | COMPLETE AND TESTED | `referral-draft*`, `referral-assistance*`, `referral-approval*`, `referral-document.ts`, `shared-referral-*`; source-preserving organizer, explicit review, immutable versions and organized HTML print/PDF |
| Destination delivery/receiving events | COMPLETE AND TESTED | `referral-delivery*`, `referral-forwarding.ts`, `referral-forward-package.ts`, `referral-receiving-panel.tsx`; scoped approved route, exact document, received/accepted/arrived/acknowledged/closed |
| Web Bluetooth transport | COMPLETE AND TESTED | `ble-handoff.ts`, `ble-handoff-panel.tsx`, `handoff-*.ts`; protocol and integrated simulated-peripheral tests, **not physical radio acceptance** |
| ESP32-S3 physical operation | IMPLEMENTED BUT UNTESTED | `firmware/MatriSyncS3/MatriSyncS3.ino`; actual cross-compile passed, radio/power-cycle/phone compatibility untested |
| NFC reader/tag storage | NOT STARTED | Hardware undecided; existing Sync NFC Band wording is an interface boundary, not a functioning NFC implementation |
| Mother upload acceptance/reviewer lifecycle | PARTIALLY IMPLEMENTED | Local uploads/original provenance exist; authoritative pending/accepted review, accepted-record retention and reviewer audit are absent |
| MatriSathi/RUHI | PARTIALLY IMPLEMENTED | Real optional offline Qwen model and tested privacy/failure paths; hardware dependent, nonclinical, no general online AI |
| Clinical AI transcription/generation | NOT STARTED | No microphone capture, ASR, clinical model or external inference endpoint; local documentation organizer is functional but is **not AI generation** |
| Verified drugs/herbs/interactions | UI/DEMO ONLY | `medicine.ts`, `medicine-demo-*`, `ai/knowledge.ts`, `data/`; supplied draft references excluded from normal/submission builds, verified allowlist empty |
| Transport/ambulance and follow-up | UI/DEMO ONLY | `workspace.tsx`, `workspace-spec.ts`, `care.tsx`; no live dispatch, GPS monitoring or authoritative follow-up service |
| Inventory/returns | PARTIALLY IMPLEMENTED | `inventory-*`, local pending ledger, intake and history tested; no live reuse/finance clearance; expansion paused |
| Shared workstation PIN/device fleet | NOT STARTED | No enrolled multi-device facility fleet, staff switcher, six-digit PIN unlock or secure offline session policy |
| Cloud record backup/Storage | PARTIALLY IMPLEMENTED | `records-cloud.ts` tested adapter is disabled in live app; `storage.rules` deny all; no cloud document upload |

## D. AI implementation and truthful boundaries

1. **RUHI local inference:** `src/ai/offline.worker.ts` loads `onnx-community/Qwen3-0.6B-ONNX`, revision `58ca03a5e7b354b480b1a82b34bde8dc7b854cc0`, q4f16, WebGPU. Optional roughly 620 MB installation follows explicit confirmation; weights are not committed. Browser requires WebGPU/shader-f16, storage and sufficient memory. Runtime JS/WASM is bundled from Transformers.js by `vite.config.ts`. `offline.ts` checks capability/cache. A worker permits model downloads only during installation and blocks uncached network fetches during inference. Stop terminates the worker.
2. **Companion context:** `companion.tsx`, `behavior.ts`, `preferences.ts`, `safety.ts` use approved minimal local profile fields and per-account opt-out. Exact profile answers and safety responses are explicitly labelled non-AI. Report contents, medicine advice, diagnoses and clinical interpretation are excluded. Deterministic input/output checks supplement the instruction packet; they are not clinical validation or model training. English filtering does not establish multilingual safety.
3. **Documentation assistance:** `referral-assistance.ts` splits clinician text by explicit headings, preserves wording/units/negation, requires source attribution and explicit field placement/review, flags blank fields/uncertainty and rejects stale previews. It applies to a draft only; saving and Doctor approval are separate actions. No transcription or generated clinical prose is silently substituted. This is the functioning manual fallback for P1.
4. **Online providers:** `ai/gemini.ts` and `ai/tavily.ts` fail closed even if flags are toggled. `ai/config.ts` contains historical provider preferences, including a Gemini model string and Tavily allocation; these are not evidence of a connected account, current model availability or actual quota. `quotas.ts` is a tested budget abstraction, not a deployed shared ledger. No external-provider secret or live invocation exists. Future model selection, credentials, limits and consent must be backend controlled; do not add secret `VITE_*` keys.
5. **Knowledge:** `verifiedEntries` in `ai/knowledge.ts` is intentionally empty. The supplied 162-entry draft reference collection is unverified. Demo lookup must never be relabelled verified. No verified interaction API/database is connected. Missing entries remain unavailable.

Actual Qwen generation, local first-name behavior, refusals, context opt-out, cancelled generation, cache restart and full offline page reload passed a **fresh 5 November genuine-model test**, using the existing isolated public-weight cache. The earlier 28 October result is retained in history. The large genuine-model test remains opt-in; see verification below. The controlled submission CSP currently permits loopback network connections only, so a fresh public model download is blocked there. Use the normal account AI build for installation/inference testing; integrating a reviewed, narrowly scoped model-download policy into submission mode is unfinished. Bolt preview/WebGPU success is not assumed.

## E. Data, authentication and authorization

### Local state

`vault-storage.ts`, `vault-crypto.ts`, `record-vault.ts` store AES-GCM encrypted profiles, metadata and original files in IndexedDB. Existing device-access migration can open automatically after authenticated account restoration; legacy passphrase records require the original passphrase once. Preserve these records and keys. There is no complete recovery/backup UI. Browser storage loss can lose records. Same-origin malicious code remains a device-key threat; this is not a hardware-backed keystore or production offline device control.

`RecordData` is version 1 with patients/documents and optional referralDrafts/referralApprovals/accountProfiles/inventoryLedger/inventoryReturns. Patient identity includes local ID/name/birthDate/history, optional Mother fields and child linkage. Documents retain ID/patient ID/kind/name/MIME/size/addedAt/source/reportDate. They do **not** yet contain a full accepted-clinical-record review lifecycle. Received files/profiles/referrals are separate signed/encrypted saved copies, not silent replacements of local records. Guest mutable state is session-only, namespaced `matrisync.demo.*`.

### Firebase

- `auth.ts`: Firebase email/password with browser session persistence, lazy initialization and loopback-only Auth emulator support. Signup route choice does not confer a clinical credential. Normal signed-in users can still choose different workspaces; this is a documented production blocker.
- Normal `firestore.rules`: owner-only `recordOwners/{uid}/vaults/patients` encrypted envelopes, validation and monotonic generation; other paths denied. `records-cloud.ts` keeps cloud backup and document upload flags false.
- `storage.rules`: all reads/writes denied. Do not deploy permissive replacements to make a demo work.
- Controlled sharing `firestore.sharing.rules` is a **separate** emulator ruleset, not an additional file to deploy over the normal database. `sharing-client.ts` requires loopback, project `demo-matrisync`, approved member/workspace/device and exact Auth emulator URL. `scripts/sharing-operator.mjs` is a localhost-only administrative test provisioner, never a frontend or public API.

| Relay path | Meaning / important fields |
| --- | --- |
| `deviceRequests/{uid}` | Public encryption/signing JWKs and keyId; immutable enrollment request |
| `members/{uid}` | Operator-approved enabled/role/keyId |
| `facilityApprovers/{uid}` | Explicit test facility credential-review authority |
| `credentialScopes/{uid}` | enabled, staff/facility UIDs and key IDs, doctor/caregiver category |
| `clinicalCredentials/{uid}` and `events/{id}` | pending/approved/rejected/suspended, attributed linked event history |
| `assignmentRoutes/{id}` | One source patient, source/facility/staff UIDs, device bindings, enabled |
| `staffAssignments/{id}` | pending/accepted/revoked; acceptance required before scoped delivery |
| `channels/{id}` | Directional sender/recipient public keys, members, enabled, optional assignment route |
| `channels/{id}/transfers/{id}` | Immutable encrypted profile/original package or finalized chunk manifest |
| `channels/{id}/uploads/{id}/chunks/{index}` | Immutable encrypted original staging; max 10 MiB plaintext, complete verification before save |
| `referralApprovals/{doctorUid}/versions/{id}` | Immutable version/content hash, doctor/facility credential binding |
| `channels/{id}/referrals/{approvalId}` | Signed, recipient-encrypted Doctor → reviewing Organization delivery |
| `channels/{id}/referralInitiations/{approvalId}` | Initiating Organization selects exact destination for approved version |
| `channels/{id}/forwardedReferrals/{approvalId}` | Organization → destination envelope retaining original Doctor signature |
| `channels/{id}/forwardedReferralIndex/{approvalId}` | Nonclinical discovery IDs, bounded lists |
| `.../forwardedReferrals/{approvalId}/events/{kind}` | Attributed sequential receiving events, no automatic clinical acknowledgement |

JOSE signed/encrypted payloads bind account, workspace, sender/recipient device, channel and immutable ID. Recipient fingerprint pinning and operator enrollment are mandatory controlled trust steps. Local `keyId` fingerprints are cryptographic public-key identifiers, not browser fingerprinting, but they do not implement a production facility device fleet. Current enrollment supports one registered key per account; recovery, rotation, multiple approved devices and revocation/offline-session policy need design and tests.

Current revocation blocks future relay fetch/publication while retaining independently encrypted already-saved copies offline. Connection and record history paginate in batches of 20, including equal-timestamp tie-breaking; some credential/referral history surfaces still have bounded first-page limitations. Outbox retries preserve exact ciphertext and acknowledge only after exact server reads. No automatic collaborative edit merge, incremental receive cursor or orphan cleanup exists. Public backend security and metadata privacy require independent review before real data.

## F. Functional workflows

| Workflow | Current end-to-end behavior / stop boundary |
| --- | --- |
| Facility onboarding | Account creation is real Auth; public verification/bootstrap absent. Engineer explicitly provisions fictional members, facility approver and scopes via loopback operator; no self-approval UI |
| Healthcare login/switching | Individual email/password login and logout; three workspace routes. No production device enrollment, shared staff selector, PIN or Leave flow |
| Patient registration/assignment | Private professional patient form is local; Mother owns self/children. Identity metadata proof is gated. In controlled sharing, approved facility offers scoped assignment; staff accepts; source then sends the exact patient snapshot/originals |
| Clinical documentation | Authorized Doctor opens received source, drafts reason/history/treatment/instructions, optionally uses local organizer, reviews and saves a new version, then explicitly approves under credential. Admin initiation never creates a Doctor prescription privilege |
| Mother uploads/review | Local original upload/camera plus date/source and retrieval works. Uploaded copy is unverified; pending-withdrawal/accepted-review transition and reviewer audit are not implemented |
| Referral | Doctor approves immutable version; sends to reviewing Organization; Organization verifies, chooses destination, initiates and explicitly forwards; destination verifies same approved HTML and records receipt/acceptance/arrival/acknowledgement/closure separately |
| BLE/NFC | Initiating Organization creates packet only after exact relay confirmation, connects ESP32-S3 and sends/read-backs. Destination reads and verifies exact recipient envelope. First receipt requires online current authorization; exact saved copy can reopen offline. Firmware holds ciphertext in RAM; NFC not implemented |
| Travel/follow-up | Existing screens and recorded referral events are available; no GPS, dispatch, ambulance service or authoritative appointment/follow-up integration |
| MatriSathi | Mother → MatriSathi → Companion → AI settings; explicit optional installation, Load RUHI, ordinary conversation, local profile opt-out. Unsupported/unavailable state does not break other features |
| Drugs/interactions | Normal/submission verified lookup reports unavailable. Demo build exposes labelled unverified supplied references. No dose advice, automated prescription or verified interaction result |

Approved referral HTML is organized for printing/Save as PDF. The tested two-page output keeps identity/source details, supplied clinical sections, original-file references and Doctor approval provenance readable. The file download is decrypted outside the encrypted vault. The BLE packet contains exactly version, channelId, approvalId and existing forwarded ciphertext; no plaintext full longitudinal profile, permanent profile code or raw private key.

## G. Repository map

- `src/main.tsx`, `workspace.tsx`, `workspace-spec.ts`, `navigation.tsx`: routes/shell/modules.
- `src/records*`, `record-vault.ts`, `vault-*`, `account-profile*`, `child-records.tsx`, `camera-capture.tsx`: private records and originals.
- `src/sharing-*`, `shared-patients.tsx`, `shared-referral-*`: controlled transport, permissions, patient/version views.
- `src/referral-*`, `handoff-*`, `ble-handoff*`: complete bounded referral journey and BLE adapter.
- `src/ai/*`, `matrisathi.tsx`, `medicine*`, `data/`: local model, safety/context controls, unverified-reference boundary.
- `scripts/identity/*`, `src/identity-proof.ts`: isolated metadata proof; do not enable browser origin access without review.
- `firmware/MatriSyncS3/`: matching Arduino receiver; [BLE contract](ESP32-S3-BLE-HANDOFF.md).
- `tests/`, `tests-auth/`, `tests-sharing/`, `tests-rules/`, `tests-identity/`, colocated `*.test.ts`: distinct verification scopes.
- `scripts/build-submission.mjs`, `start-sharing-pilot.mjs`, `build-sw.mjs`, `verify-build-mode.mjs`, `serve.mjs`: build/test/preview boundaries.
- `firebase.json`, `firebase.sharing.json`, `firestore*.rules`, `storage.rules`, `.env.example`: emulator and configuration boundaries.
- `.local-tools/` is ignored: optional CLI/Java/Arduino toolchains, test browser profiles, logs, model caches and compiled outputs. None is needed to import source into Bolt.

## H. Reproducible setup and checks

### Ordinary source development / Bolt preview

Use Node 22+ and pnpm with the existing lockfile:

```sh
git clone --branch handoff/matrisync-codex-2026-11-05 https://github.com/olivanderwoods-collab/MatriSync.git
cd MatriSync
pnpm install --frozen-lockfile
pnpm dev
# In Bolt's forwarded container preview:
pnpm dev:bolt
```

Repository root is the local `MatriSync/app` checkout, so after Git clone do **not** look for another `app/` directory. `dev:bolt` binds Vite to 0.0.0.0; ordinary local dev stays loopback. No dependencies were upgraded for this handoff. If the environment cannot run `pnpm`, configure its package manager without rewriting the lockfile.

Copy `.env.example` to ignored `.env.local` only for intended Firebase account testing. Variables: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`. These are web configuration, not service-account credentials. Missing config leaves Guest usable and account setup unavailable. Enable email/password and approved domains in the chosen Firebase project deliberately; no live setting/rules deployment was done here. Do not point synthetic tests at that live project.

```sh
pnpm lint
pnpm test
pnpm build                 # tsc + production, excludes draft datasets/sharing
pnpm build:demo            # includes labelled draft lookup, excludes sharing
pnpm test:e2e              # after demo build, installed Edge required
pnpm build:submission      # built local emulator sharing + print + BLE
```

Both normal and submission builds include an offline public shell. Production output is `dist`; controlled output is `.local-tools/submission-dist`. No build command deploys. `Start-MatriSync.ps1` opens the already-built normal preview on Windows. An existing service worker may require the in-app **Update now** action; never clear user storage as a build workaround.

### Controlled test environment (engineer-operated)

Install Java 21 and a local Firebase CLI if absent. This checkout used Firebase CLI 15.34.0 installed under ignored `.local-tools`. For reproducibility outside this machine, `pnpm dlx firebase-tools@15.34.0 ...` can substitute for `firebase` below. Start each service separately to avoid the observed combined-launcher/logging collision:

```sh
firebase emulators:start --only auth --project demo-matrisync --config firebase.json
firebase emulators:start --only firestore --project demo-matrisync --config firebase.json
firebase emulators:start --only firestore --project demo-matrisync --config firebase.sharing.json
```

Ports: Auth 9099, record Firestore 8086, sharing Firestore 8087. Wait for readiness before testing. On the development Windows machine set Java's `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=.` if the temporary-path loopback error recurs. Do not start duplicate listeners, stop unrelated processes or clear existing vaults. Emulators are ephemeral unless explicitly exported; restarts can lose fictional approvals/relay state without deleting the browser vault.

```sh
pnpm test:auth
pnpm test:rules
pnpm test:sharing          # automatically starts the development sharing app
pnpm test:identity        # isolated proof; review status remains unchanged
```

For the built submission journey, set `TEST_SUBMISSION=1` when running `pnpm test:sharing` (PowerShell: `$env:TEST_SUBMISSION='1'`). Startup permits 120 seconds for the compilation. The seven browser scenarios create/enroll their own fictional clients using `scripts/sharing-operator.mjs`; do not copy approval bypasses into the app. Test browser requires installed Microsoft Edge, or a consciously configured Playwright Chromium channel. Run suites separately if resource constrained. Rules suites use isolated project IDs; record rules use the record emulator rather than the sharing relay.

Optional actual model test: `TEST_OFFLINE_MODEL=1 TEST_AI_PRODUCTION=1 pnpm test:auth -- tests-auth/offline-ai.spec.ts` on a suitable local machine; PowerShell sets those environment variables separately. It may download public weights and uses ignored `.local-tools/ai-browser-test`. Default account suite skips this large test. No paid/external AI provider credential is required for Qwen.

The submission build is intentionally hard-bound to local emulators. In a Bolt/browser container, localhost is not this Windows machine and Java emulators/native BLE may be unavailable. Use ordinary Guest/UI editing there; run security, full sharing and hardware acceptance on a local checkout. Do not remove loopback/role/device gates to make Bolt preview appear connected. A cloud relay is a separate reviewed deployment task.

### Firmware

Arduino-ESP32 **3.3.2**, board **ESP32S3 Dev Module**, FQBN `esp32:esp32:esp32s3`. Only built-in BLE and mbedTLS are required. Open `firmware/MatriSyncS3/MatriSyncS3.ino`, compile for that board. On this machine Arduino CLI used a temporary `Q:` mapping to the ignored toolchain to avoid Windows long paths. The checked sketch compiles to 597727 program bytes and 97820 static RAM bytes. Do not treat compiled `.bin` output as flashed hardware. See the protocol document for UUIDs, 20-byte values, 32 KiB packet bound, SHA-256/read-back, disconnect handling and RAM-only retention.

## I. Bugs, debt and release boundaries

- Broader healthcare roles, facility-scoped registration, trusted multi-device enrollment, PIN/Leave sessions and secure offline staff authorization remain open. New notices do not enforce those missing permissions.
- Normal workspace selection is not authoritative role assignment. Live clinical use remains blocked. Received copies are read-only, but the new maternal-upload review lifecycle is absent.
- Identity proof is deliberately not in the browser build. Metadata receipts do not deliver a clinical decryption key, register a real patient or prove ownership. Independent protocol, key-fulfillment/recovery review precedes integration.
- Same-device storage loss/recovery, multiple-device keys, source authenticity, metadata exposure and secure offline revocation need review. No fabricated successful recovery.
- Outboxes preserve exact sends, not acknowledged shared edits. Some referral/credential lists remain first-page bounded. No automated orphan/pruning/conflict workflow.
- BLE chooser is not hardware identity authentication. Nearby clients can disrupt/replace the device ciphertext; application recipient/signature/authority checks remain necessary. Physical range/disconnect/phone/power tests are pending. Firmware RAM clears on power loss; no tag selected.
- No ASR/clinical AI backend, verified drug KB or interaction provider. No verified clinical model safety. Historical provider names/allocations must be revalidated when a backend is implemented. Submission CSP blocks new public model downloads.
- Existing care/transport/finance screens contain synthetic previews. They must not be presented as live operational integrations.
- First handoff receipt requires online current relay authorization; offline reads work only for already-verified saved copies. Full profile access is a separate grant.
- Existing large-bundle Vite warning is nonfatal. Optional model/runtime assets are substantial. Dependency/security upgrades were not attempted during handoff.
- Earlier normal README/phase guides describe older passphrase/sharing status; this current-first document takes precedence. Preserve history rather than treating all old “pending” statements as current.

## J. Next 10 tasks for Bolt (ordered, bounded)

| # | Objective and relevant files | Required change / dependencies | Acceptance criteria |
| --- | --- | --- | --- |
| 1 | Establish reproducible baseline; this file, `package.json`, configs | Import correct branch, install locked deps, run checks supported by environment; no feature changes first | Clean branch; lint/types/build/unit pass; unsupported native tests explicitly reported |
| 2 | Authoritative healthcare permissions; `sharing-client.ts`, credentials, rules, `main.tsx` | Define facility membership and capabilities for all seven target staff roles; retain Doctor approval semantics; independently review rules | Forged route/role, cross-facility and administrator prescription attempts denied server-side; permitted assigned cases pass |
| 3 | Device enrollment and staff sessions; `sharing-storage.ts`, Auth, member schema | After task 2, review multi-device public-key enrollment, revocation/recovery, offline TTL; add authenticated staff selector and rate-limited PIN unlock/Leave | Unenrolled/revoked devices denied; PIN alone cannot authenticate; logout/account switch clears unlocked context; offline policy tested |
| 4 | Authoritative registration/identity; `scripts/identity/*`, `identity-proof.ts`, patient forms | After tasks 2–3 and independent protocol review, connect operator registration, unique IDs and atomic claims to reviewed recipient-key/source fulfillment | Duplicate/raced claims safe; wrong operator/facility denied; code cannot restore revoked grant; exact profile/key delivered without replacing originals |
| 5 | Mother upload review lifecycle; `records-model.ts`, `record-vault.ts`, sharing/rules | Add provenance-preserving pending/reviewed/accepted states, reviewer/version audit and authorized review commands; depends on task 2 | Pending owner withdrawal works; accepted clinical copy cannot be deleted/edited by Mother; originals/history survive reload/retry |
| 6 | Clinical transcription and draft suggestions; `referral-assistance*`, new backend | Choose actual ASR/model; authenticated backend configuration, explicit audio/PHI consent, minimal retention, source-linked draft schema. Keep local organizer fallback | No capture/upload before consent; no provider secrets in bundle; only authorized healthcare user submits; suggestion never changes saved record without editable review and explicit acceptance |
| 7 | RUHI integrated target-device verification; `ai/*`, `vite.config.ts` | Keep pinned local model; review narrow model-download CSP for submission build and supported phones; backend only if separately approved | Real target-device download/cancel/failure, offline reload, opt-out, account isolation and clinical refusal tests; accurately labelled unsupported devices |
| 8 | Verified drug/interaction content; `ai/knowledge.ts`, `medicine*` | Obtain licensed/approved sources and reviewer provenance, version/date, exact-match retrieval and explicit missing-data state; backend quotas if needed | Unverified entries never promoted automatically; actual source-linked results; missing interactions never imply safety; no prescribing behavior |
| 9 | Physical BLE then NFC; `ble-handoff*`, `handoff-*`, firmware | Flash available ESP32-S3; test actual send/read-back, interruption and receiver verification. Choose reader/tag then design storage capacity/lifetime/authentication | Real radio evidence; wrong/tampered recipient rejected; restart loss shown; NFC success only after physical write/read-back, with no full profile/private key on tag |
| 10 | Remaining continuity/release rehearsal; outboxes, referral/event/care modules | Add acknowledged versioned shared edits/conflicts and missing pagination, then permission-scoped follow-up/transport records. Depends on 2–5 | Concurrent changes never overwrite originals; full synthetic journey with offline/revocation/retry, printable document and attributed events; independent security review before deployment |

## K. GitHub and Bolt transfer

The handoff is a separate branch of the existing repository. There is no main merge, history rewrite or replacement project. All intended source, rules, tests, firmware source and documentation belong in Git. `.env.local`, credentials, `.local-tools`, model weights, compiled firmware, dependency directories and browser data remain excluded.

According to [Bolt's official GitHub instructions](https://support.bolt.new/integrations/git) checked for this handoff:

1. On the Bolt homepage choose **GitHub** below the chatbox, authorize repository access, and select the existing MatriSync repository (or Import from URL using the repository URL above).
2. Choose the repository. Before requesting edits, open the top-right **GitHub** menu and select **`handoff/matrisync-codex-2026-11-05`**. Imports begin on the default/main branch; do not start editing there.
3. Confirm the GitHub panel shows the intended repository, branch and synchronized status. Read this handoff and the requirements file; verify the implementation checkpoint in Git history. Create a separate continuation branch from this handoff if desired, never overwrite main.
4. Install the locked dependencies, use `pnpm dev:bolt`, and run lint/unit/type/build checks. Preserve Firebase. Do not accept an automatic Supabase/Bolt database rewrite. Do not add secrets to chat or frontend variables.
5. Browser/native emulator limitations are described in H. Do not mark full sharing, hardware or local AI tested merely because the preview renders.

Avoid concurrent Codex and Bolt editing/pushing of the same branch. Bolt can automatically synchronize edits; inspect a conflict before accepting any discard operation. Merging is a later explicit action in GitHub. This session does not authorize a main merge or public deployment.

## Verification record

Final outcomes are recorded in [the 5 November verification report](VERIFICATION-2026-11-05-HANDOFF.md). It distinguishes fresh tests, prior genuine-model evidence, simulated transport and compiled-but-unflashed firmware. No user developer testing was requested.

## Fresh conversation context

See [NEW-CHATGPT-CONTEXT-2026-11-05.md](NEW-CHATGPT-CONTEXT-2026-11-05.md) for a self-contained prompt. Begin Bolt work with task 1, then task 2; do not start a fresh application or assert the new healthcare device/role requirements are already satisfied.
