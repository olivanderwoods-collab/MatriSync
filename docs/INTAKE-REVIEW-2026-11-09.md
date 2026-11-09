# Facility intake and Mother record review

Development after the Health-a-thon 2026 submission date. This is a continuation of the existing application, on main and the original submitted Firebase site.

## Current user decisions

- Add patient belongs to Organization: manual registration, a Mother-generated pairing code, or the existing encrypted BLE/NFC receiving flow. Professionals have no Add patient control.
- Organization and Professional patient views use Referral Handoff. A received packet opens a popup, remains encrypted in the receiving account after closing, and supplies a basic snapshot until the authorized full profile can load. Do not claim that the physical bridge has been integrated.
- Mother has no referral route/tab or clinician audit history. Prescriptions use an explicitly entered name/dose/timing/route schedule; history shows recorded periods without inferring missing dates. Original free-text prescriptions remain intact for professionals and are not automatically interpreted into a schedule.
- Mother can submit prescription/report copies. An assigned active Doctor must confirm separate inspection of the original before approving the exact immutable submitted version. Files stay local: the user explicitly chose **Keep files local; review originals separately**.
- MatriSathi remains the tab name; RUHI remains the companion.

## Implementation

`care-intake.ts` adds facility-bound 30-minute one-use pairing (`carePairings`), encrypted submitted records (`careCases/{id}/records/{id}`), and immutable final reviews. Pairing consumes the code and creates the access grant atomically. The code is separate from the Mother's login/access code. Only an already loaded linked care profile can generate a connected pairing code; an unlinked local vault profile is not silently published.

Facility registration uses the existing encrypted case/account creation path, with an explicit facility mode. The older Doctor registration API remains compatible with existing clients; its UI registration controls were removed. Facilities still cannot prescribe. Initial facility activation still requires an existing invitation; no public bootstrap was enabled.

Mother submission IDs are derived from account, case and local record ID. Repeating the same client submission reconciles the same version; differing content cannot overwrite it. Approval is attributed to the assigned Doctor and server time, and both record and approval reject all updates/deletes. A file's fingerprint and entered metadata can be encrypted with its submission; file bytes never enter this care workflow. This is an attestation of separate original review, not proof the app transferred or interpreted the original. Existing local originals remain available under Original copies saved on this device. Prior local records are not automatically submitted or approved.

Mother server queries only prescription/laboratory entries; rules deny internal/referral entries. UI and RUHI read-back omit referral history, including old saved entries. Previously downloaded copies/keys cannot be retroactively erased, and the encrypted original profile is still shared with its Mother. This is not a claim of cryptographic removal of all previously available information.

Guest mode demonstrates the roles on fictional data in one browser. Its pairing code is local and one-use, manual profiles contain only entered identity details, and new basic profiles are visible in the Professional directory. Guest storage/role selection is not account authorization. Guest NFC directs to a signed-in facility because encrypted receipts require its enrolled device keys. The Ophelia fixture and its missing values remain unchanged.

Stable approved-handoff retry, exact packet/snapshot recovery, encrypted drafts, receipts, and append-only contribution semantics were preserved. No automatic restored-draft send was added.

## Checks actually completed

- 157 unit tests in 35 files passed, including encrypted local records, retained original bytes, repeated approval, schedule parsing, handoff retry and draft conflict coverage.
- 14 current care/record Firestore rules tests passed. New checks cover facility registration, atomic pairing, expiry/recipient/one-use enforcement, immutable copies/reviews, denied Mother/Nurse/Lab/admin/unassigned/revoked approvals, and restricted Mother entry queries.
- Two real local Auth/Firestore emulator journeys passed: the existing nine-account encrypted handoff/retry journey, and a six-account facility registration / Mother pairing / Doctor review journey. Only demo-matrisync was used; no production users or records were seeded/deleted.
- TypeScript, lint and the documented production build passed. Build verification excludes emulator fixtures and historical sharing/assignment pilots. Existing large-chunk advisory remains.
- Real-browser checks: Mother simplified medication view and no Referral Handoff tab; local pairing success, expiry/reuse rejection; Organization manual intake and reload persistence; new profile visible to Professional with no Add patient; actual emulator-backed Mother submission, Doctor review checkbox gate, approval, and Mother read-only display after switching back. Local original copy remained accessible. Test fixture: `tests-care/intake-fixture.html`, started using `tests-care/intake.config.ts` on 4183; it deliberately seeds new synthetic accounts each load and cannot run against production settings.
- Firestore rules deployed to matrisync-c9de7, then Hosting to the same site. Public cached Update now retained the Guest session and revealed Add patient. Final shell cache: `9ae35f092f40`; main asset: `assets/index-tlronZ0R.js`. Sixteen static files were byte-equal to dist; four public route shells matched. Public authenticated multi-account acceptance is still not claimed.

## Remaining boundaries / next continuation

Hardware is untouched: ESP32 WROOM / Elechouse PN532 V3 Facility Bridge V2.2, only 48 verified tag bytes. The reference GATT protocol is not integrated with V2.2; BLE RAM capacity is not NFC capacity. No physical scan/write success was claimed.

Device/key recovery, public facility verification and a scoped public authenticated acceptance remain pending. Linked-care pairing needs an existing full case; migration/publishing of an independently created Mother-only local vault profile is not implemented. Review lists currently require online retrieval; originals stay local. A Mother form retains its local submission ID while open for retry, but this is not a durable cross-reload submission outbox. Saved approved referral handoffs retain their separate stronger recovery protocol.

Continue from this release, read the current root handoff, and inspect main before editing. Preserve source history and the original URL. Historical sharing suites require the separate 8087 emulator; they were not rerun for this scoped update.
