# Atomic NFC logger closure and retained receiver evidence

Later continuation: `NFC-DRIVER-2026-11-14.md` adds the isolated journal v3 write-lease guard, synthetic transport and actual child-process authority-ledger crash tests. Its next-step and verification checkpoint supersede the closure-only next step below.

14 November 2026, Asia/Calcutta. Development after the Health-a-thon 2026 submission date.

Read this before `NFC-AUTHORITY-2026-11-11.md`. The attached November 11 continuation described an older checkpoint: the active checkout and remote main already contained journal `adf9eb1` and authority `3e14346078ac22535115099f2dc25a878fd62f84`. This slice continues those implementations. All new functionality remains isolated Node/SQLite code under `tests-care`; it is not a production receiver, endpoint or hardware driver.

## Atomic local closure

`NfcCommitJournal.closeLogger` now verifies the grant, active completed B operation, original A pin, generation, operation/image digests and exact readback while holding the same `BEGIN IMMEDIATE` transaction used by journal saves. It creates and verifies the logger signature inside that transaction and persists the exact token and scope closure together. The token is returned only after COMMIT. The old `retainLoggerCompletion` entry delegates to this method; a separate logger ledger is no longer the source of completion signatures.

Closure freezes the account/patient/referral journal, including attempts to introduce a different grant into the same scope. No new operation or B generation may be saved afterward. Historical identical save/completion retries remain available without moving the head. Exact closure retries verify and return the original token without signing again. A competing advance either commits before closure (the old head cannot close), or loses to closure (the new generation is refused). This deliberately terminal local policy has no reopen/new-trip transition; a reviewed future policy would be required for that behavior.

The journal is now **version 2**, associated-data domain `matrisync-isolated-nfc-journal-v2:<store UUID>`. Existing v1 files are refused without migration, replacement or reset. No production records use this isolated journal. Historical fixture files are preserved; no migration of a v1 pending operation or separate old logger token is implied. The encrypted aggregate remains capped at 8 MiB with synchronous FULL, rollback journal and explicit exclusive initialization. Closure rows are checked against the completed head during decoding.

The local transaction does not grant physical ownership or revoke a caller's previously restored in-memory operation. There is no transport in this model. A future driver must enforce write leases/fencing and same-tag, coherent, durable readback. It must not treat a previously obtained pending object as permission to write after closure. Caller trust/time remains explicit synthetic input, not live production authorization checked atomically with SQLite.

## Durable receiver history

`ReceiverEvidenceStore` is a separate encrypted SQLite store, version 1, domain `matrisync-isolated-nfc-receiver-v1:<store UUID>`, 8 MiB limit. It retains immutable receipt identity, externally pinned authority/scope/receiver, locally created challenge and creation time, first acceptance time, exact grant/completion/freshness tokens, supplied layout and complete allocated encrypted readback. Section keys and logger/authority private keys are not serialized. Routing identities and receipt evidence are inside the storage envelope.

Acceptance requires a live `ReceiverChallenge`, valid signatures, correct receiver/scope/epoch, a matching unexpired challenge response, exact signed full-image digest, original A pin and authenticated B. Evidence for a receipt ID cannot be replaced; identical retry retains its first acceptance time. Conflicting evidence for a retained challenge is also refused. Save failure does not auto-retry, contact an authority or send anything. A lost response can be reconciled through read-only restore; after a process restart, any new current check needs a new challenge.

Restore verifies the evidence using separately supplied pinned authority/receiver and the B key, at the recorded historical acceptance time. It returns **`historical-authority-evidence`**, original check/expiry times and decoded B. It never returns current status, extends expiry, restores a live challenge, signs, encrypts, reapproves or sends. Expired evidence remains available as history; it is not current authorization. Changing the externally supplied epoch/pins causes refusal. Independent A reading remains separate. The stored full readback includes A ciphertext, not a claim that this B-only receiver-history API decrypted A.

## Corrected input ownership

Fresh-process tests exposed a Node Buffer alias: `Buffer.slice()` shares backing bytes, unlike `Uint8Array.slice()`. The candidate key-envelope helper previously wiped caller-owned Buffer material when wiping its temporary copy. It now creates its own `Uint8Array` before wiping. Isolated model/journal/receiver input snapshots likewise make explicit owned copies before asynchronous validation. Regression tests mutate Buffer packet, binding and image inputs after invocation and verify retention of the original bytes. No production app module changed.

## Verification in this slice

- **74 isolated NFC tests passed:** 19 new closure/receipt cases plus the prior 55. Existing model and journal suites retain their related 833 interruption-boundary checks each; these are not new physical trials.
- Actual child processes exit before a write, after SQL update/before COMMIT, and after COMMIT for closure and receiver persistence. Reopened processes recover exactly committed signatures/receipts. Two processes closing one operation converge on one original token; closure versus B advance has one winner; competing receipt IDs cannot replace the winner. A deliberately paused signing operation confirms that the journal lock spans signing.
- Exact retry, account/referral/receiver isolation, wrong keys, absent stores, v1 refusal, corruption, authenticated image tampering, retained clock values, no encrypt/sign on restore and Buffer copy ownership passed. Existing grant, envelope, algorithm/type, revocation, replay and independent-section checks also passed.
- Full authentic-file rollback is explicitly tested as a **remaining limitation**: restoring an old journal removes knowledge of closure and can allow a new local generation. An independently retained authority terminal refuses the conflicting completion. Rolling back receiver history cannot recover a live challenge or turn old history into current status. Rolling back all trusted stores together is not detected by this prototype.
- **213 application tests across 38 files passed**, strict NFC/application TypeScript, full ESLint and the documented production build/fixture-exclusion guard passed. The existing large-bundle advisory remains. Logs: `.local-tools/nfc-closure-2026-11-14-{tests,unit,build}.log`.

No new browser, emulator, physical-tag, production identity or authenticated device acceptance is claimed. The app build remains `assets/index-DMm-nUcH.js`, cache `66a999f0a90a`, application code `fa50c0c`. All 16 public static files were byte-equal and four HTTP route shells matched. Evidence is recorded in `.local-tools/nfc-closure-2026-11-14-live-verification.json`. No Hosting deployment is needed for identical application assets. The five unrelated unfinished recovery files are excluded from this change.

## Remaining boundaries and next work

The signed wire formats and measured synthetic budget are unchanged: 6,486-byte bundle, 7,207 including authority anchor/request, still excluding unimplemented network/device framing. C=96 remains fully occupied by two descriptors. Only 48 real tag bytes are verified. No tag was written, reformatted or flashed; BLE RAM is not persistent proof storage.

Next software slice: isolate a driver-facing write-lease/fencing contract coordinated with journal closure, using an explicitly synthetic transport to test stale in-memory handles, interrupted writes and closure races. Never label simulated readback physical acceptance. Also extend abrupt-process restart coverage to the existing authority terminal/freshness ledger (its current before/after-COMMIT tests use thrown errors). Do not integrate hardware until the actual WROOM/PN532 V2.2 source/protocol, authorized read-only memory evidence and a persistent proof channel are established.

Production issuer/enrollment, account authentication, per-referral custody, retirement/revocation, rollback-resistant state and fully offline freshness remain unresolved. The signature proves key possession and exact recorded bytes, not genuine sensor measurements, a physical tag identity or clinical validity. This slice is a verified software continuation, not a claim that the NFC journey is complete.
