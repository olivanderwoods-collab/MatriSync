# Current verification — 23 October 2026

This section supersedes the historical results below for the changed code. Scope and manual acceptance steps are in [confirmed decisions](DECISIONS-2026-10-23.md) and [what to check / what's next](CHECK-THIS-BUILD-2026-10-23.md).

- ESLint, TypeScript, production build and demo build passed. The production check excludes the synthetic assignment module and both research-draft JSON assets. The demo build retains the original draft bytes. Existing Guest preview fixtures remain; removing all demonstration data is still a final-release gate.
- **33 unit tests passed** across seven files. They cover the previous safety/session/reference checks plus automatic local-key opening, non-extractable keys, account/concurrency boundaries, lossless one-time migration, synthetic consent/assignment/acceptance/revocation, exact profile readback and limited AI context projection. The output filter now rejects the observed first-person birth-fear claim, including typographic apostrophes and negation.
- **22 Edge UI/PWA tests passed**. The three affected AI/assignment UI cases passed again after the last filter and screenshot updates. Includes patient-specific navigation, Back to Patients, doctor referral creation versus organization initiation, revoked access denial, Mother prescription-copy limits, Inventory refund placement, logout confirmation, responsive layouts and Guest/PWA isolation. The final 390px dark patient-referral screenshot was visually inspected.
- **10 Auth/local-record tests passed** against the local Auth emulator; the separate real-model case is intentionally skipped in that ordinary suite. The three affected AI/profile cases passed again after the final changes. Covers encrypted Mother profile persistence, explicit name/week/date projection, excluded contacts/clinical fields, profile-context opt-out, medicine/report routing before generation, account isolation, offline records, original-byte download and one-time legacy migration. The projection test uses a mocked worker and is not evidence of model conversation quality.
- **One separate actual-Qwen production-PWA test passed** using the previously downloaded public model cache and synthetic emulator accounts on Windows/Edge. With browser networking disabled, it produced two genuine general/supportive replies, read back two exact saved-profile answers, suppressed an inappropriate birth-related output, stopped generation, loaded the cached model again and completed another generation whose output was replaced by the safety fallback. No external request occurred during that offline inference/restart portion. This is not evidence that every sample received a successful model-generated answer.

### Findings and limits

The small model did not reliably answer identity questions from instructions alone. Exact name/stage questions now read the authenticated local profile directly and display **Saved profile · Not AI-generated**. Report quotations, diagnoses, attachments, clinical history, contacts and other patients remain excluded from model context. The bundled packet guides inference; it does not retrain weights or guarantee compliance.

An earlier real-model run produced an inappropriate first-person response about giving birth. The filter was corrected and the final run displayed **Safety fallback · Not AI-generated** instead. A prior restart assertion expected an additional **Offline AI** label and failed even though a filtered fallback is a valid result; final acceptance checks require a completed reply, correct provenance and suppression of the observed inappropriate claim. The model's replies remain generic and need broader quality and multilingual/clinical safety review. Only this Windows/Edge device was tested.

Local records open without a routine vault lockscreen. Old records require their original passphrase once to attach the existing key without changing ciphertext or original documents. A key stored on the same device is not hardware-backed isolation or end-to-end sharing. Browser storage loss remains a data-loss risk; backup/recovery and server-blind recipient-key sharing are not implemented.

The assignment, consent and referral handoff workspace is an explicit in-memory synthetic test. Real staff roles, cross-account access, persistent refunds/settlements, digital clinical prescribing, real BLE/NFC transfer, child linking and full professional/facility profiles remain pending. No live cloud record/file upload, paid service, provider activation, rules deployment or application deployment occurred. Firestore rules were unchanged and their previous emulator result below was not rerun for this update.

---

# Previous verification — 22 October 2026

This section supersedes earlier demo-only verification for the changed routes. It records implementation checks, not clinical certification or production readiness.

- TypeScript and production/demo builds: passed. Production excludes both supplied draft JSON files; testing build includes byte-identical originals. The optional AI worker/runtime is excluded from initial PWA precaching. No ONNX weights are in the build output or repository.
- Unit suite: 22 passed. Covers session boundaries, draft reference integrity, conditional summaries, AES-GCM/PBKDF2, wrong passphrases and tampering, account binding, concurrency, file signatures, independent safety routing, output filtering, missing verified knowledge, provider fail-closed gates, usage metadata and atomic quota reservations.
- Firestore emulator: 5 passed against the Standard edition. Encrypted structured-record round trip and conflict checks work; file metadata/bytes are excluded. Foreign/anonymous/unauthenticated access, listing, schema injection, malformed encryption envelopes, stale generations and key/IV revision reuse are rejected. Prototype rules remain undeployed.
- Full Edge UI/PWA suite: 20 passed. All roles, exact navigation, legacy redirects, mother/professional annotations, profile and language controls, clean responsive layouts, Guest isolation, no unintended external requests, database search/offline behavior, AI unavailable states, independent urgent guidance, PWA consent/update and recovery passed. Screenshots are saved under `docs/screenshots/`.
- Account/local-record checks: all 8 cases passed (six Auth/record cases and two AI failure cases, with the two failure cases rerun after fixing confirmation-card overflow). Includes real emulator signup/login/logout and account transitions, encrypted file persistence/download, account isolation, offline upload and five-minute idle locking. Unsupported devices, failed model downloads, cancellation and fixed safety guidance preserve the app.
- Real Qwen test: the final production PWA test passed on this Windows/Edge machine. Download/initialization, two genuine supportive replies, Stop during generation, cached worker/model restart and another genuine reply all completed with browser networking disabled for inference/restart. No external provider request occurred in that offline portion. The test took 8.1 minutes, largely due to the public download; a retained, ignored synthetic browser profile avoids redownloading on later acceptance runs. This does not establish mobile-device or general clinical/psychological safety.

The initial model replies were generic and sometimes mirrored feelings as if the AI experienced them. The prompt and post-generation checks were tightened, including a short style example. The final sample responses acknowledged loneliness/fear and the loneliness response encouraged talking to another person. This is not a broad psychological-safety evaluation. Reviewed multilingual support remains pending. Public-model download/network failures are isolated from other app features. One interrupted download was retried manually; no paid or alternate-model fallback was used.

No paid endpoint, billing upgrade, Cloud Functions, Firebase Cloud Storage, live Firestore record write, Gemini request or Tavily request was activated. Online recognition/transcription, clinical prescribing, verified reference content and secure shared-provider infrastructure remain blocked/pending. Reports and prescriptions upload to the encrypted local vault only.

Real Android/low-memory and iOS hardware, long-term cache eviction, installation under OS storage pressure, clinical review, multilingual safety, live production Auth, multi-device restoration and deployment remain unverified. There is no passphrase recovery or file backup UI. Read the storage and AI status documents before patient use.

---

# Verification — v2 alignment, 21 October 2026

> This records the earlier v2 milestone. Later mother/caregiver annotations and the testing-only database authorization are tracked in [Phased development](PHASED-DEVELOPMENT.md) and take precedence for the changed screens.

## Latest mother and demo-reference stage — 21 October 2026

- Production build/typecheck passed; automated build check confirms both draft JSON assets are excluded. Demo build/typecheck passed; build hashes confirm the included fixture bytes are unchanged. Clinical use is independently disabled.
- ESLint passed. Twelve unit tests passed, including all 13,041 pairs, 162 legacy-ID/name joins, rule/source references, draft severity consistency, unknown/self/duplicate entries, two-to-ten entry bounds, profile validation and conditional Home cards.
- All 18 Edge browser tests passed in 27.4 seconds. After the last layout-only refinement, all four affected mother tests passed again in 11.1 seconds. These cover profile image/name and reload/reset, removed tabs and old-link redirects, Help Back, education search/category/detail, single draft lookup, mixed found/missing entries, unresolved versus identified rules, aliases/duplicates, the ten-entry cap and 45 pairs, offline draft lookup and no external network requests. Existing role, Guest, PWA update and navigation regression coverage remains passing.
- New mother layouts checked at 320, 390, 768 and 1440 pixels without horizontal page overflow. Latest desktop and mobile drug-lookup screenshots visually inspected: `screenshots/drug-demo-1440.png`, `screenshots/drug-demo-390.png`.
- Local preview on port 5173 restored and HTTP 200 verified. The existing in-app tab was on a browser error page; its browser URL policy blocked tool access, so it was not reloaded through automation. User refresh is needed. UI verification above used the repository's isolated Edge regression suite.
- No new live Auth test, clinical validation, source-link medical review, real-device test, AI/provider request, media recognition, paid connection or deployment occurred. Earlier Auth emulator results below remain historical, not a new run.
- Conflict: interaction metadata references a different catalogue version/hash; all supplied IDs/names still map. Draft files remain unchanged and unverified. See `PHASED-DEVELOPMENT.md` for hashes and future import requirements.

## Repository and scope

- Actual checkout: `app`, remote `olivanderwoods-collab/MatriSync`, branch `codex/phase-1-demo`; starting commit `693a953`.
- Existing in-progress browser-comment refinements reconciled with the later v2 specification. See `V2-ALIGNMENT.md` for the pre-implementation comparison and precedence decisions.
- The lazy Firebase App/Auth module, session storage implementation, exact theme tokens, dependency versions/lockfile content, service-worker generator, original artwork and Firebase configuration were preserved. The React account observer and Guest-to-account transition were corrected as described below.
- No functioning capability beyond Phase 1 was found. No real schema/data migration, service activation, dependency upgrade, billing change or deployment occurred.

## Checks completed

- TypeScript project build and production Vite/PWA build passed.
- ESLint passed.
- Six session-storage unit tests passed.
- All 14 Microsoft Edge production browser tests passed (24.2 seconds): all public roles; exact five-tab desktop/mobile layouts; restricted nested distributor; every specified subsection and More destination; contextual action inventories; role boundaries; legacy-route redirects; child and patient identity isolation; refresh/Back/Forward; preference persistence/reset/logout; Guest-to-account clearing; configured account UI availability; fresh-tab isolation; blocked/corrupt storage; not-found recovery with one main landmark; dialog focus/Escape; offline deep links and manifest; static cache allowlist; responsive overflow checks at 320/390/768/1440 pixels.
- All four Auth emulator tests passed (23.0 seconds), using the official Firebase CLI 15.34.0 and `demo-matrisync` on loopback: signup/password confirmation; restoration after reload; logout; incorrect credentials; login; account-to-Guest transition; Guest never initializing Auth; offline sign-in disabled; SDK sign-out observed after a new login; failed account attempt clearing Guest state in both storage and React memory. No live Firebase account was created and the full auth journey observed no external requests.
- A two-revision public-shell test verified that the new worker waits for Update now, then activates, removes the old shell cache, preserves Guest preferences/selected child, and opens the updated child report offline. This uses an isolated local test server without changing the user's preview or `dist` files.
- Guest traversal across v2 destinations observed zero external requests and zero browser page errors. Existing test confirms empty localStorage, IndexedDB databases and cookies, and clearing only namespaced Guest state.
- Production offline child-report view loads from the public shell; cache includes only allowed public assets, never account/role routes or service responses.
- Exact inventories are centralized in `src/workspace-spec.ts`. All future controls use the existing explanatory Coming Soon dialog; no input fields were invented for clinical, financial or inventory operations.
- In-app browser visibly opened the v2 preview on port 5173. Screenshot evidence is under `screenshots/`.
- ESLint and `git diff --check` passed. The lockfile's normalized Git hash matches the original `1b0e329c48a687b2891a08766a665729f533842a`.

## Deeper audit corrections

- Other patient profiles no longer inherit Mira's example follow-up or referral ID. Child overview/history copy uses child-specific context rather than pregnancy context.
- Newly signed-in accounts now retain an Auth observer; signing out through the SDK revokes the displayed account session without requiring a reload.
- Starting an account attempt clears both Guest tab storage and in-memory Guest state, including failed login attempts.
- Unknown nested routes render one main landmark. Distributor route matching is exact, organization legacy clinical routes resolve to operational context, and preference/profile headings match their More menu labels.
- The Help tagline now uses the same provisional brand constant as the rest of the app.
- Repaired incomplete local dependency links from the unchanged lockfile using the offline package cache; no dependency upgrades or application package additions. Isolated Firebase CLI tooling resolved the earlier emulator startup issue. One initial cold Auth run timed out; the subsequent complete traced run passed all four checks with unchanged behavior assertions.

## Changed files

- `src/data.ts`: fixed five-tab role navigation and Healthcare Organization label; preserved original patient/child fixtures.
- `src/main.tsx`: retained Auth/Guest/app lifecycle; aligned shared shell and More access; retained preference functionality; removed obsolete screen implementations.
- `src/workspace.tsx` (new): v2 synthetic screens, contextual navigation, safe old-link redirects, operational-only organization patients, restricted distributor preview.
- `src/workspace-spec.ts` (new): specified sections, exact More menus and future-action labels.
- `src/styles.css`: five-item bottom navigation, responsive Home summaries, More menus, patient rows and nested sidebar presentation; semantic color values unchanged.
- `tests/demo.spec.ts`: updated navigation labels while preserving behavioral regression coverage.
- `tests/workspace-scope.spec.ts` (new): exact navigation, v2 routes/actions, role boundaries, restricted distributor and no-service-traffic checks.
- `tests/pwa-update.spec.ts` (new): isolated two-version service-worker activation, Guest continuity and updated offline shell.
- `tests-auth/auth.spec.ts`: current labels plus account-observer and failed account-transition regressions.
- `README.md`, `docs/MEETING-WALKTHROUGH.md`, `docs/CAPABILITIES.md`, `docs/VERIFICATION.md`, `docs/V2-ALIGNMENT.md`, supplied `docs/MatriSync-Master-Development-Guide-v2.txt`, and six refreshed screenshot PNGs.

## Limits / remaining decisions

- Successful real-account signup/login/logout has not been tested with a real user; the configured modular Auth implementation is preserved. Account UI availability, Guest transition, offline constraints and storage behavior are tested. No live account was created for this update.
- Physical phone installation and native PWA launch/airplane mode remain unverified. Desktop offline/update behavior is not a claim of real-device acceptance.
- Keyboard behavior and responsive layout were checked, not a full accessibility audit. Existing palette contrast treatment remains: white on light primary green is about 3.77:1, with large bold primary-button labels; dark primary-button text uses the existing dark token. No universal contrast claim.
- No clinical content has been validated. Future clinical, AI, drug lookup, Bluetooth/NFC, real referral operations, database/sync, inventory/financial mutations, messages and payment features remain Coming Soon.
- Credentials/permissions, source reviewer sign-off, NFC payload/keys/hardware, notifications, contractual refunds/reimbursement, external document delivery, final branding and deployment budgets remain open in guide §16.

## Specification conflicts handled

The later v2 guide explicitly supersedes earlier browser comments about removing professional/organization referrals, limiting organization to four tabs, and keeping Home minimal. Those areas now follow v2. The unimplemented Add Patient pairing/handoff menu was replaced by v2's Register Patient preview because no such extra menu/fields are listed in v2. No working registration or pairing logic was removed. Old bookmarked routes use their closest specified destination rather than restoring retired branded screens.

Changes are local in the existing checkout. This update has not been committed, pushed or deployed.

## UI clarity follow-up — 21 October 2026

- Detailed record, referral, follow-up and inventory screens now place section navigation beside the active content on wide screens. Smaller screens retain a horizontal scrollable section menu.
- Standardized future actions into aligned responsive grids, arranged patient directories as compact cards, and used columns for record details and MatriSathi copy/actions.
- Removed duplicate More navigation on its landing page, repeated page/panel headings, redundant demo explanations and the duplicated prescription introduction. All specified actions remain, with one combined prescription action grid and visible Coming Soon labels.
- No new controls, features, services or theme tokens. Firebase/Auth and Guest behavior were not changed in this follow-up.
- Production build/typecheck, ESLint, Git whitespace checks and all 14 production browser tests passed again (23.2 seconds). Every specified destination also receives a horizontal-overflow check. Existing mobile checks cover 320/390/768/1440 pixels; screenshots now additionally include patient cards, prescriptions, desktop inventory and mobile inventory. The local development preview was opened and visually inspected in the in-app browser.
- Restored missing local dependency files from the offline cache with a forced reinstall; package manifest and lockfile content remain unchanged. No dependency folder was moved or deleted in this follow-up.
- Prior Auth emulator and unit-test results above remain applicable; those suites were not rerun for this presentation-only follow-up.
