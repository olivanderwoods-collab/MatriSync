# Guarded synthetic writer and authority crash recovery

14 November 2026, Asia/Calcutta. Development after the Health-a-thon 2026 submission date.

Read this before `NFC-CLOSURE-2026-11-14.md`. This continuation starts from verified local/remote `ec8115b5beae0e925ecd3a7088c83ef9de3abdb6`. It implements the next isolated write-lease contract and fresh-process authority-ledger tests. It contains no hardware driver, production authorization, app integration or new UI.

## Writer lease and closure contract

`NfcCommitJournal.acquireWriteLease` explicitly acquires or replaces ownership for the active pending operation. The encrypted lease binds account/patient/referral, operation ID, store ID, synthetic gateway/tag IDs, a strictly increasing safe-integer fence and a random token. The caller must supply the last observed fence. Competing processes using the same expected fence have one winner; a lost acquisition response requires inspection and an explicit decision, not blind automatic replay. No time-based expiry or automatic takeover is inferred.

The journal preserves the fence across release and later B generations. Gateway/tag binding cannot change within that referral journal. Scope/fence/token/operation fields are assigned internally; extra runtime fields in the binding cannot override them. A released, replaced, foreign, completed or closed handle is refused before the transport callback runs. Existing pending model objects and block plans alone do not authorize this driver to write.

`runWithWriteLease` holds the same SQLite write lock used by save, takeover, release and logger closure throughout the asynchronous transport operation and exact full-image reconciliation. On success it appends the unchanged `confirmed-in-model` completion and marks the lease inactive in one transaction. On failure the completion does not commit and the existing lease stays active. Direct `complete` cannot bypass an active lease; closure and head advancement cannot pass an active writer. Exact historical completion retries still return their original evidence while a newer generation has an active lease. Original immutable operation/signature/evidence semantics remain intact.

The adapter contract requires every effect to settle before its promise resolves or rejects. The lock is deliberately not released on an arbitrary I/O timeout while a command could still take effect later. Other callers can receive a bounded busy error, but that does not revoke the writer. After a simulated partial write, a closure request carrying the earlier partial image is rejected even if it waited behind the write; closure requires an explicit retry with fresh final readback.

Journal format is now **v3**, domain `matrisync-isolated-nfc-journal-v3:<store UUID>`, retaining the existing encrypted 8 MiB aggregate and synchronous FULL transaction behavior. v1/v2 files are refused without migration, deletion or reset. These are isolated development formats, not production record migrations. Lease rows are structurally checked against the head/completion/closure chain. Existing fixture artifacts and the five unrelated unfinished recovery files remain preserved.

## Explicit synthetic transport

`tests-care/nfc-commit-driver.ts` implements `SyntheticNfcDriver` and `SyntheticTagPort`. The only write entry used by the driver goes through the journal guard. The port has a fixed supplied store/scope/gateway/tag binding, its own in-memory fence/token, and copied block data. It exposes detached readback and attempted-command history for tests; the exchange method uses a module-private symbol. This is application structure, not a security sandbox against arbitrary code in the same runtime.

Each run first checks the target/fence and reads the simulated image. A complete exact final image after a lost acknowledgement is reconciled without another write. Otherwise the existing recognized-interruption model chooses explicit retry of the original steps, encrypted packet, nonce and generation. Each simulated block write gets exact readback before proceeding. Unknown damage, a different target, wrong key or bad readback stops the operation. No restore, lease inspection or constructor sends anything.

The test port can inject a prefix tear at any block, an acknowledgement loss after application, corrupt readback or a delayed command. Effects occur synchronously in this in-memory fixture and there are no queued effects after its promise settles. The attempted-command log contains the requested block bytes, not proof that all bytes persisted during a torn-write fault; inspect the simulated image for that state.

The port's independent fence rejects an old handle when the journal alone is rolled back. **Recreating the port loses that fence.** It is not persistent gateway custody or rollback-resistant hardware. A real bridge that can apply queued commands after disconnect/process death does not yet satisfy this contract. Multiple machines or independent journal copies are not made mutually exclusive by local SQLite.

## Authority ledger crash coverage

The existing signed terminal/freshness protocol and formats are unchanged. New child-process tests import explicitly synthetic signer material over private IPC and terminate before work, after SQL update/before COMMIT, and after COMMIT. No existing enrolled device key is exported or replaced. Synthetic private keys are absent from command arguments, application bundles and committed fixtures.

Reopening returns the exact committed terminal/freshness tokens. A retry does not re-sign or extend a retained freshness expiry. Competing processes select only one terminal, and concurrent retries for one challenge converge on the same signed response. These are actual Node process-exit tests, extending the earlier thrown-error tests; they do not establish OS power-loss guarantees, production JWT authenticity or current cloud revocation.

## Verification

- **100 isolated NFC tests passed**: prior 74 plus 19 driver/lease cases and seven authority process cases. The new synthetic B sweep exercises **340 cases**: 20 write steps × all 17 prefix-cut lengths, each followed by explicit retry of the retained original. Existing model/journal suites also retain their related 833 interruption checks each. None is a physical tag test or an exhaustive bit-pattern sweep.
- Tests cover A initialization and B updates, stale handles after closure/takeover/release, delayed-write/closure contention, two same-lease runs, different targets/accounts/journals, immutable target binding, lost final acknowledgement, bad readback, unknown damage, journal failure around durable completion, encrypted lease restart/competing-process acquisition, v2 refusal and the independently retained gateway-fence rollback boundary.
- **213 application tests across 38 files passed.** Documented production build and fixture-exclusion checks passed; main bundle remains `assets/index-DMm-nUcH.js`, cache `66a999f0a90a`, application source `fa50c0c`. Existing large-bundle advisory remains. Logs are `.local-tools/nfc-driver-2026-11-14-{tests,unit,build}.log`.

Strict NFC/application TypeScript, full lint and whitespace checks passed. All 16 public static files were byte-equal and four HTTP route shells matched; evidence is `.local-tools/nfc-driver-2026-11-14-live-verification.json`. This slice makes no new rendered-browser, emulator, authenticated production account or physical hardware acceptance claim. Identical app assets require no Hosting deploy or repeated cached Update now interaction.

## Next and remaining boundaries

Next isolate a **durable synthetic gateway** that retains its fence and command outcomes across its own process restart. Test disconnect/late-response/drain semantics, duplicate commands, same-tag binding and journal/gateway restart ordering before designing an actual bridge adapter. Keep uncertain in-flight operations blocked until readback and ownership can be reconciled; do not introduce timer-based automatic replay.

The WROOM/PN532 V2.2 source/protocol and authorized read-only memory evidence remain prerequisites for real hardware integration. Only 48 physical bytes are verified. No tag or firmware was flashed, overwritten or reformatted. The measured authorization bundle remains 6,486 bytes (7,207 with anchor/request before network/device overhead); C=96 remains full. Production enrollment/key custody, current account/grant authority, offline freshness/revocation, persistent gateway fencing and protection against rollback of all trusted stores remain unresolved.
