# Verification · 20 October 2026

## Confirmed

- Initial remote `main` had only README, commit `5845894`; no pending local work was overwritten. Private repository, push permission verified, main unprotected, no open PRs at inspection. Working branch: `codex/phase-1-demo`.
- Production build and TypeScript succeeded; lint succeeded; six unit tests passed.
- Eight Microsoft Edge browser tests passed on the final configured build (18.8 seconds): all three roles/all navigation; Coming Soon dialogs; child-specific tabs; refresh/Back/Forward; settings persistence; reset/logout; Guest-to-account clearing; fresh tabs; blocked/corrupt storage; unknown routes; offline deep links; static cache allowlist; manifest; mobile drawer focus and Escape restoration; no overflow at 320/390/768/1440 pixels. An earlier unconfigured build passed the same suite and missing-configuration checks.
- Browser network inspection across Guest roles observed zero external requests. localStorage, IndexedDB databases, and cookies remained empty. Guest session keys were cleared without touching an unrelated test key.
- Public offline child-report route loaded after initial shell installation. Cache contained only the explicit public asset allowlist, not role routes or auth responses.
- Representative light/dark, desktop/mobile and all-role screenshots captured in `screenshots/`. Mother desktop/mobile screenshots visually reviewed.
- Supplied artwork retained unchanged; proportionate 192/512 icons and padded maskable derivative created.
- Local preview returned HTTP 200 and was visibly opened in the in-app browser on port 5173. Kept running separately from the browser test lifecycle.
- Owner-supplied Firebase configuration saved only to ignored `.env.local`. Read-only project inspection: `matrisync-c9de7` ACTIVE, billing disabled, email/password enabled; existing authorized domains include localhost. No cloud configuration changes.

## Limits / pending checks

- Live signup/login/logout success not yet verified with a real account. UI error handling is implemented; no fake successful login is used.
- Auth emulator tests are prepared but not passed: Firebase CLI installation encountered package-resolution failures (`registry-url`, then dependencies during direct module loading). This does not affect Guest or the UI build. No live account was created as a workaround.
- PWA install prompt/native installed-app launch and physical phone airplane-mode behavior remain unverified. Desktop offline behavior is tested; do not present that as phone acceptance.
- Update notification and versioned allowlist logic are implemented; a two-version live service-worker update cycle remains unverified.
- Keyboard/dialog behavior and overflow were tested. No claim of a complete accessibility audit. White on light primary green is about 3.77:1; primary buttons use 20px bold labels. Small green text uses the supplied darker token. Dark controls retain their supplied primary color on hover/press, because distinct dark interaction tokens were not supplied.
- English-only reviewed content; other language choices clearly fall back to English.
- No public deployment, billing activation, database provisioning, or production clinical capability.

## Reproduction

Run the commands in README from the actual `app` checkout. Browser tests require local socket/browser access outside restrictive sandboxes. Screenshots show synthetic content only. Unit tests are scoped to `src/session.test.ts`; the separate browser suites require Playwright.
