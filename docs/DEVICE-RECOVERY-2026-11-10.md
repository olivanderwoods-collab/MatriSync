# Device identity preservation and recovery design

Later 10 November continuation: read `DEVICE-MIGRATION-SPEC-2026-11-10.md` first. Missing-key care decryption now also avoids identity generation. That document specifies Candidate A migration and records newer tests/deployment; the evidence below remains the earlier enrollment-safeguard checkpoint.

Development after the Health-a-thon 2026 submission date. Continue the original repository on main and preserve https://matrisync-c9de7.web.app.

## Implemented in this slice

Care enrollment now checks the authoritative server enrollment before creating a local identity. If an enrolled account has no matching local key, it stops and asks the user to return to the original browser with its saved data. It explicitly says device recovery is not available yet. An unavailable server check also stops before key generation. The existing matching key is reused; no key is replaced, exported or deleted.

This is an enrollment safeguard, **not implemented device recovery**. `existingSharingDevice` only reads the existing IndexedDB device. Other legacy/local cryptographic call paths still use `localSharingDevice`; this change does not promise that every attempted local read is free of key creation. No production rules, clinical permissions, records, UI sections, dependencies or hardware protocol changed.

## Actual acceptance

- 161 unit tests across 35 files passed, including four enrollment regression cases: absent local key, different local key, unavailable authoritative check, and reuse of the original key.
- All three real Auth/Firestore emulator integration journeys passed. The existing nine-account referral and facility/Mother pairing/review journeys were rerun. The new five-account device journey uses a facility, Doctor, Nurse, Lab and issued Mother account.
- The device journey proves that password sign-in alone does not recover the enrolled Doctor key; absent-key enrollment does not generate a replacement; a different local key cannot decrypt the existing local copy or load the assigned profile; server key replacement/deletion are denied by the unchanged rules. Reattaching the same retained test CryptoKeys restores the exact saved copy and authorized online profile. Both private keys remain non-extractable.
- 14 current care/record rules tests passed. Expected permission-denied output comes from negative cases. Historical sharing tests on port 8087 are outside this run.
- TypeScript, ESLint and the documented production build passed. Existing large-bundle advisories remain. Test fixture markers are absent from production assets. The prepared browser fixture module compiled and returned HTTP 200; that is not evidence that its UI executed.
- All accounts and data in these tests are fictional and confined to demo-matrisync on loopback Auth 9099 / Firestore 8086. The test-only IndexedDB fault injection deletes only its newly generated synthetic account's device entry, and restores it in a finally block. It is not an application import/recovery API.
- The real-browser check was attempted but the tool reported that local browser use is disabled in Work settings. No rendered enrollment, cached Update now or public authenticated browser pass is claimed for this release. Previous release browser evidence remains historical.
- Hosting-only deployment succeeded at the unchanged site. Cache: `14fc6ef7e26b`; main bundle: `assets/index-DQjq_1rx.js`. All 16 checked static files were byte-equal to the build and four route shells matched. No rules, production Auth users, invitations or patient records were changed. Private local evidence is under `.local-tools/device-2026-11-10-{unit,integration,rules,build,deploy}.log` and `device-2026-11-10-live-verification.json`.

## Browser check prepared, not executed

Run the existing local emulators, then Vite with `--config tests-care/intake.config.ts`. Open `http://127.0.0.1:4183/tests-care/device-fixture.html`. This creates one disposable emulator account with real Auth/Firestore and renders the actual CarePage without network mocks. It fails closed outside the specified loopback demo project.

1. Refresh care access: enrollment should succeed with the original key.
2. Detach synthetic test key, then refresh care access: the original-browser guidance should appear.
3. Inspect local test identity: it should still be absent, including after another refresh attempt.
4. Reattach original test key, then refresh: access refresh should work and inspection should report original.
5. Check console errors and capture the result. Fixture controls are excluded from the production build. They are not approved public recovery controls.

## Recovery design: candidate, not enabled

### Existing constraints

`newSharingDevice` creates non-extractable P-256 ECDH and signing private keys. Authentication credentials are not these keys. Existing device records are immutable and identify one browser per account. Grants and received packets are encrypted to that identity. IndexedDB contains encrypted case copies, drafts, original outgoing packets, approved pending operations and receipts; original uploaded files remain local in their existing vaults. A download containing public keys alone cannot recover any of these private-key-bound records.

Mother access is a distinct existing path: the issued code unwraps a case key from the Mother envelope. It is not staff key recovery, must not grant staff rights, and must not be confused with an ordinary password reset. A damaged existing local copy may fail before code-based online loading; do not claim that arbitrary Mother device loss already works end to end.

### Candidate A: original browser still available

Use a new, separately versioned multi-device protocol. Do not make existing private keys exportable or overwrite `careDevices/{uid}` as a shortcut.

1. Authenticate the new device as the same account, generate its own non-extractable keys, and create a bounded, expiring request containing account, old/new key fingerprints, operation ID and one-use challenge. No records or keys move at this step.
2. On the original browser, require explicit approval and comparison of the new device fingerprint through a separate trusted channel. Bind the approval to the exact request, account, old/new key IDs and expiry with the old signing key. Revalidate current membership and case permissions online.
3. Add a new immutable device epoch and append recipient-specific key envelopes for explicitly approved cases. Preserve original grants and attribution. Current append-only rules do not implement this schema; reviewed new rules and migration compatibility are prerequisites.
4. Transfer selected local recovery objects through an authenticated encrypted channel and re-encrypt their storage containers to the new browser. Keep original packet bytes, signatures, IDs, clinical snapshots, recorded times, receipt verification history and draft revisions unchanged. Hash the manifest and each object; verify a complete durable import before acknowledging success. A partial import remains staged, never merges silently or removes originals.
5. An approved pending handoff stays bound to its original sender/recipient keys. Reconcile its original operation online; never turn it into a fresh send, re-sign it with the new key, truncate it or automatically send a restored draft. Any continuation requiring the old private key must remain on that original browser until a separately reviewed protocol supports it. Two-tab conflicts and account/patient isolation still apply.
6. Retain the old device and files until deliberate retirement is implemented and verified. Do not infer retirement from a successful copy or revoke access to already-downloaded offline records.

### Candidate B: original browser/key unavailable

Do not promise recovery of local-only originals, drafts, receipts or encrypted copies. A signed-in account or claimed professional role is insufficient authority to replace enrolled keys. Another currently authorized case-key holder could potentially issue a new device-bound case envelope after identity recovery, but the approver, evidence, disputes, revocation and facility bootstrap authority are unresolved. Keep this path unavailable; do not create a public recovery administrator or weaken immutable grants.

### Required tests before enabling either path

Wrong-account and cross-patient requests; changed keys; revoked staff/facilities; expired and replayed challenges; simultaneous approvals; interrupted manifest/object writes; quota failures; import substitution; rollback; old/new client compatibility; offline refusal to approve; authoritative reconciliation after uncertain outcomes; unchanged pending packets and newer drafts; unchanged original files; no secrets in logs; and actual two-device browser acceptance. Obtain independent protocol/rules review before describing this as production recovery.

## Next continuation

Complete the prepared browser check and same-site retained-client Update now check when browser access is available. Public authenticated acceptance still requires an already-authorized test identity/invitation scope; this slice did not create production users or invitations. Continue Candidate A only after its device-epoch migration, approval UX and recovery scope are concretely specified. Do not start lost-key administrative recovery or hardware work implicitly.
