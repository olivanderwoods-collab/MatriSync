# Final handoff verification — 5 November 2026

## Outcomes actually executed

| Check | Result | Ignored local evidence |
| --- | --- | --- |
| ESLint | Passed | `.local-tools/final-lint.log` |
| TypeScript project build | Passed | `.local-tools/final-types.log` |
| Unit suite | **106 passed / 26 files** | `final-unit.log` |
| Firebase security rules | **45 passed / 5 files** | `final-rules.log` |
| Identity metadata proof | **12 passed / 2 files** | `final-identity.log` |
| General built-demo browser suite | **26 passed** | `final-general.log`, `final-general-results/` |
| Account/local records/AI failure/documentation suite | **19 passed, 1 opt-in model case skipped** | `final-auth-ready.log`, `final-auth-ready-results/` |
| Separate genuine RUHI model test | **1 passed** with actual Qwen inference and full offline reload | `final-model.log`, `final-model-results/` |
| Built submission multi-account suite | **7 passed** | `final-sharing-verified.log`, `final-sharing-verified-results/` |
| Production build and exclusion checks | Passed; cache `e37c2d329328`, main `index-CWGW3zbT.js` | `final-production.log` |
| Demo build and fixture boundary checks | Passed; cache `718f81db9022` | `final-demo-build.log` |
| Submission build and offline shell | Passed as part of seven-journey suite | `final-sharing-verified.log` |
| ESP32-S3 firmware compilation | Passed, Arduino-ESP32 3.3.2 / `esp32:esp32:esp32s3` | `ble-firmware-compile.log` |
| Print visual inspection | Both pages rendered and inspected; no clipped text/overlapping content | `ble-print-1.png`, `ble-print-2.png` |
| Normal preview | Loaded and visually inspected at localhost5173; existing service-worker Update now applied; exact current script checked | Existing in-app tab; no browser records cleared |
| Secret/local-file review | `.env.example` is the only tracked env file; key-pattern scan returned no matches outside ignored env/tool/build paths | Git status/diff/ignore review |

Tests used fictional records and isolated local emulator accounts. No production patient data, live Firebase mutation, public deployment or user's developer testing was used. The genuine-model test used the existing isolated public-model cache and required at least one actually generated reply, rather than counting fixed fallbacks as AI.

## What the new checks prove

BLE unit tests exercise default-MTU bounded chunking, the full 32768-byte capacity, exact read-back, offset corruption, byte corruption, disconnects, empty-device failure, packet schema/version/routing validation and oversized rejection without truncation. The integrated five-account journey creates the exact approved encrypted handoff, transfers through an explicitly labelled **test GATT peripheral**, rejects tampering before saving, and opens the correct approved referral in the receiving account. It continues through existing independent full-profile permission, receiving events, revocation and retained-copy checks. The mobile send panel was visually inspected; [screenshot](screenshots/ble-handoff-mobile.png).

The packet is the existing approved recipient ciphertext plus version/channel/approval identifiers. It does not introduce a new cryptographic scheme or bypass the current authority chain. Exact targeted receiving lookup avoids first-page omission for that packet. Transfer confirmation means device read-back verified; it never means acceptance, arrival, clinical handoff or NFC storage.

The ESP32 firmware was compiled by the actual vendor toolchain, producing 597727 bytes program usage (45%) and 97820 bytes static RAM (29%). A Windows long-path compiler failure was resolved with a temporary short-path drive mapping, then the SDK's `STATUS` type collision was fixed by renaming the sketch constant. No physical flash, radio communication, board reset, tag write/read or mobile BLE compatibility test was possible. The firmware holds one complete encrypted packet in RAM with separate staging, so power loss clears it.

Account checks cover signup/login/sign-out restoration, errors, Guest transitions, legacy vault migration, exact originals, offline persistence, account isolation, child boundaries, camera permission failure, source-preserving documentation review and version history. Rule tests cover the existing authoritative test member/device/credential/assignment and referral boundaries. They do not prove the newly requested granular role/device/PIN design, which is still absent.

The real RUHI test checks actual offline generation, first-name context, clinical/report refusals, dated profile answers, opt-out, cancelled generation, cache restart and full offline page reload. Fixed safety/profile/failure responses stay labelled non-AI. ONNX emitted expected provider-assignment performance warnings; one offline resource failure was logged during the intentional disconnected segment, and the no-external-provider-request assertion still passed. This is desktop evidence, not phone performance or clinical validation.

## Failures resolved during verification

- The first account/sharing run failed at signup because the Auth emulator was not running. Auth was restored separately and confirmed ready; the full account and sharing suites then passed. Duplicate Firestore starts correctly reported occupied ports; the existing isolated services were reused.
- A built-submission startup exceeded Playwright's original 60-second web-server allowance during concurrent compiler/test load. `playwright.sharing.config.ts` now permits 120 seconds for the actual build. The final full run passed.
- Earlier submission print tests tried navigating to an artificial HTML route intercepted by the production service worker. They now render the exact exported HTML via Playwright `setContent` before PDF generation; application behavior and document-equality assertions are unchanged.
- BLE component cleanup now disconnects connections completed after unmount and suppresses active-transfer success after cancellation.

No dependency upgrade was made. Official Arduino CLI/core/compiler packages were downloaded only into ignored local tools to perform firmware compilation. Toolchain binaries, model cache, browser profiles, logs, env files and compiled firmware are excluded from Git. Regenerated unrelated test screenshots were restored; only the new BLE evidence is intentionally added.

## Explicit unverified boundaries

Production facility onboarding, full granular healthcare permissions, multi-device enrollment/recovery, staff PIN/Leave, accepted maternal-upload review, clinical ASR/generation, verified drugs/interactions, public relay deployment, authoritative clinical identity integration, shared-edit conflict resolution, physical BLE/NFC and live travel/follow-up are unfinished. The submission CSP blocks fresh public model downloads; RUHI's real-model check ran the normal account AI build. The full original submission core is not declared finished. See the current handoff for the ordered continuation plan.
