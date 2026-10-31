# Staff workspace continuation — 31 October 2026

Implemented after `0961eac`, on the existing `codex/phase-1-demo` checkout. This is a controlled local sharing milestone, not final submission-core completion or cloud deployment.

## Working behavior

- Professional Home lists the named professional's enabled pending assignments. Acceptance removes an item from pending and exposes the accepted assignment in Patients. Acceptance alone creates no local patient and does not claim a record was delivered.
- Patients explicitly receives through the one matching approved assignment connection, using the existing source-device fingerprint and signed/encrypted receiver. An empty relay reports that no records have been sent. An offline action reports that no new action was confirmed. Only an independently verified saved profile gets an open-profile link.
- Organization Staff Management exposes existing approved assignment scopes. A received patient's Overview shows only scopes for that source profile. The Organization can offer and revoke; the named professional can accept. Mother Connected Accounts and Permissions shows her source scopes without offering facility/staff authority.
- Last successful access-check time is visible. Current assignment status requires an online refresh; it is not an offline proof of current authority. Revocation removes new receive controls while retaining access to already-saved encrypted profiles. An independent direct connection remains usable.
- No permission rules, record schemas, originals or existing keys were changed. Existing visual styles/navigation remain in use. The new workspace module is gated to the sharing pilot; normal distributions exclude it.

## Checks performed

| Check | Result |
| --- | --- |
| Unit tests | 84 passed across 20 files |
| Firestore rules | 39 passed across 5 files, including 8 assignment authorization cases |
| Sharing browser journeys | All 4 passed, including original delivery/referral journeys and the new four-account staff workspace journey |
| General browser regression | 26 passed |
| Account browser regression | 18 passed; optional actual-model case skipped, RUHI unchanged |
| ESLint, TypeScript | Passed; TypeScript also checked by both builds |
| Demo and production builds | Passed; pilot/fixture exclusion checks passed |
| Mobile staff card | 390px viewport, no horizontal overflow; screenshot inspected |
| Normal preview | Opened on 5173; existing shell update applied through Update now without clearing browser records |

The new browser scenario covers pending/accepted separation, no clinical name from assignment metadata, correct patient scope, Mother read-only access, foreign-account/role denial, no false empty-delivery success, immediate offline rejection, actual encrypted profile delivery, reload, exact saved-version selection, assignment revocation, retained offline records and an independently approved direct connection created before revocation. It checks for uncaught page errors.

Evidence: `tests-sharing/assignments.spec.ts`, `docs/screenshots/staff-assignment-workspace-mobile.png`, ignored `.local-tools/staff-workspace-*.log`. Production cache: `92e95aac48bc`; main asset: `index-CgIeYTFk.js`. Normal preview snapshot: `.local-tools/review-staff-workspaces-20261031`. Test services are transient.

One launch was blocked by a transient automatic-approval service disconnection; the approved retry succeeded. An initial full sharing run then failed at sign-up because the local Auth emulator had stopped. Restarting the existing Auth/Firestore/relay emulators resolved that infrastructure failure; all four final scenarios passed. No permission/network isolation was weakened. No cloud service, dependency installation, public onboarding or production publication occurred.

## Remaining work

Authoritative username/code loading and atomic first Mother claim remain unimplemented. See `PATIENT-IDENTITY-IMPLEMENTATION-BOUNDARY.md` for the next service/protocol contract. Existing pilot scopes still require explicit operator approval and source publication. This checkpoint does not provide automatic recipient key enrollment, recovery, pagination beyond the existing bounded queries, acknowledged edit/outbox integration, larger attachment transport, BLE/NFC verification or final core distribution integration. The three submission-core journeys remain incomplete. The assistant continues to own developer testing; no developer checklist is assigned to the user.
