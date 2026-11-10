# Clinical handoff dictionary and NFC sections — 10 November 2026

Development after the Health-a-thon 2026 submission date.

This is the latest user-directed priority. It supersedes the previous instruction to work next on the recovery browser fixture. Existing clinical records, approved packets, recovery work and firmware are preserved. The new format is **not connected to a physical NFC writer** and is not a production key-management design.

## Product status reviewed before code changes

- Implemented: role workspaces, Firebase Auth, session-only Guest shell, local encrypted records and original uploads, structured-care pairing/contributions, Doctor handoff/PDF, saved drafts/receipts and exact-operation retry, Mother record-copy review, labelled RUHI scripted replies, themes/preferences and public offline shell.
- Partial: live authenticated multi-account acceptance, device recovery, optional local AI runtime and document context, BLE hardware compatibility, translation coverage, attachment availability on another device. Originals remain local by user decision.
- Missing: physical full-tag inspection, integrated bridge NFC write/readback, authorized offline section-key provisioning, production recovery authority, professionally approved clinical terminology and drug/herb reference services, real MatriVitals ingestion/storage and receiving UI, broader messaging/transport/service workflows still labelled Coming Soon.
- Existing NFC code: legacy framed packets, signed/recipient-encrypted handoffs, lossless positional/wrapper compression and MS3 binary transport. BLE has bounded chunks, offset/length checks and exact device-RAM readback. None establishes a physical tag write. The reference S3 firmware does not prove compatibility with the user's WROOM V2.2 bridge.
- Earlier evidence remains in dated documents. The new slice does not claim to have rerun all historical rules/recovery suites.

## Delivered in this slice

`src/nfc/dictionary.ts`: bundled immutable dictionary v1, 55 stable structural identifiers. Each has code, term/key, category, subject applicability, synonyms, introduction version, approval status/date, and optional reviewed terminology reference/standard identifier. Structural records have no clinical approval claim. No medication, diagnosis or significant-event abbreviations were invented or activated. Exact source text remains literal. The append-only import validator checks existing entries byte-for-byte, version increments, uniqueness and review metadata. This is a **build-time proposal validator**, not evidence that a submitted reviewer claim is genuine. Maintainers must authenticate professional review before bundling a later version; older versions must be retained. There is no untrusted runtime dictionary import.

`binary.ts`: deterministic versioned binary encoding, strict decoder, exact Unicode/numeric/negation/null/empty/omitted-state fidelity, bounded depth/count/bytes, optional bounded DEFLATE-raw only when smaller. Unknown fields, IDs, versions or value types fail; nothing is guessed or silently omitted. The v1 codebook contains no clinical terms eligible for term tokens. Approved synonyms are supported in dictionary metadata but deliberately not normalized during exact round-trip encoding.

`layout.ts`: explicitly verified data-block maps, manufacturer/trailer rejection, exclusion of reserved blocks, disjoint whole-block A/B/C allocations and section-only logical write plans. Unknown hardware is restricted to the user's verified blocks 4–6. This code cannot inspect or write a tag. A capacity supplied by a caller is not itself hardware evidence.

`compact-review.tsx` / `review.ts`: Professional workspace, active Doctor only, in the existing handoff form. The authorized **Prepare Compact NFC Handoff** action works locally; subject stays unknown until chosen. Shows immutable identity/provenance, exact original field text, explicit included/excluded selection and actual binary/compression size estimates. No automatic omission, inference, source mutation, cloud write or send. Blank values remain missing. Selection approval is explicitly preview-only and is cleared on editing/locking/reload; undo cannot resurrect an approval. Pending connected operations disable preparation. Existing connected approval, exact packet, draft/receipt and PDF behavior remain unchanged. The preview cannot write the new format: the known tag does not fit and section-key/bridge acceptance is missing. Configurable professionally approved requirements and durable new-format approval still need design.

`sections.ts`: independently authenticated A/B AES-256-GCM section prototype, fresh 96-bit nonce, 128-bit tag, authenticated version/kind/dictionary/sequence/referral binding and exact length, completion marker, local decrypt/decode comparison. Non-extractable supplied keys only; no universal key, default key, key export, cloud service or new dependency. Payload identity must match its authenticated referral binding on reconstruction.

`travel.ts`: fixed bounded records for explicitly recorded heart rate, SpO2, BP and temperature; mother/baby, source, clock quality, event and recording offsets remain separate. No diagnoses, significance inference or clinical event codes. End-of-journey preparation returns a complete independently authenticated B section; never appends plaintext to A ciphertext. Full storage rejects additional NFC records. Firmware local overflow persistence remains unimplemented.

`reconstruction.ts`: independently returns verified/missing/unavailable outcomes for each section so a failed B does not suppress a valid A. Requires same expected referral binding, supplied keys and trusted expected sequences; sorts transport observations for display while preserving original order/recorded times. **Not wired to the public receiving popup or stored Firestore history.** That needs the bridge, authorized key access, provenance and persisted freshness policy first.

## Wire protocol v1 (development format, separate from legacy MS3)

All fixed-width fields are big-endian. Dictionary IDs are unsigned canonical base-128 varints. Integers use at most five bytes; reject overflow and redundant encodings. Structural objects contain strictly ascending IDs, never repeated labels.

- Binary document prefix: `4d 43 01` followed by uint16 dictionary version.
- Value tags: 0 null; 1 false; 2 true; 3 uint32 varint; 4 float64; 5 UTF-8 string (varint byte length); 6 reviewed full-term ID; 7 array (varint count); 8 object (varint field count, ID/value pairs); 9 exact canonical UTC ISO timestamp encoded as integral float64 Unix milliseconds. Other date spellings remain text. Float64 preserves values including negative zero; non-finite numbers are refused.
- Limits: 32,768 binary bytes, depth 12, 512 array items, 256 object fields; fatal UTF-8 errors; no trailing bytes. Decompressed output uses the same bound.
- Clinical section body: one compression flag (0 raw / 1 DEFLATE raw) followed by the binary document. This version uses lossless compression, never an AI-generated summary.
- AES envelope header, 30 bytes: `4d 4e`, format 1, kind 1=A / 2=B, uint16 dictionary version, uint32 positive sequence, uint16 body length, 16-byte SHA-256 prefix of JSON `["matrisync-nfc-binding-v1",patientId,referralId]`, two zero reserved bytes. Entire header is AES-GCM associated data.
- Then nonce 12 bytes, encrypted body, authentication tag 16 bytes, final `45 4e` completion marker. Exactly **60 bytes** overhead per section. Marker/length alone are never authentication. The marker is not a power-loss journal or proof of freshness.
- B body: `4d 54`, version 1, uint8 count, float64 integral trip-start Unix milliseconds (12-byte header). Each 28-byte record: kind byte (1 HR, 2 SpO2, 3 BP, 4 temperature), subject byte (0 mother/1 baby), source byte (0 sensor/1 manual/2 reported), clock byte (0 unverified/1 device/2 synchronized), uint32 event offset seconds, uint32 recording offset seconds, float64 value, float64 second value (BP diastolic; otherwise canonical +0). Units respectively beats/min, percent, mmHg, degrees Celsius. No automatic unit conversion. A device's reported synchronization quality is not independently verified clock accuracy.

## Memory and measured synthetic budgets

Allocation is a provisional evaluation policy: A at most floor(55% of usable blocks); B at least one block or floor(35%); C all remaining blocks, reserving at least two blocks when available. Insufficient memory reduces A to zero; it never borrows B. C is reserved only: its crash-safe descriptor/recovery protocol is **not implemented or hardware-tested**.

| Map | Total usable | A | B | C | B observation capacity |
| --- | ---: | ---: | ---: | ---: | ---: |
| User-verified blocks 4–6 | 48 | 0 | 16 | 32 | 0 |
| Hypothetical full Classic 1K ordinary data map | 752 | 400 | 256 | 96 | 6 |

The hypothetical map is a synthetic test, not identification or permission to overwrite the user's tag. Sector/block rules were cross-checked against [NXP's Classic EV1 4K datasheet](https://www.nxp.com/docs/en/data-sheet/MF1S70YYX_V1.pdf) and [Android's MifareClassic reference](https://developer.android.com/reference/android/nfc/tech/MifareClassic). Actual available blocks/access controls/reservations still require read-only inspection and a recoverable backup before any separately authorized write.

| Synthetic handoff | Original JSON | Dictionary binary | Compressed body | Final encrypted A | Remaining in hypothetical A |
| --- | ---: | ---: | ---: | ---: | ---: |
| Minimal identity + entered reason | 234 | 116 | 107 | 168 | 232 |
| Detailed qualifier/medication/observation example | 804 | 380 | 284 | 345 | 55 |

Final A includes the one-byte compression flag plus 60-byte envelope. B's worst-case six-record packet is 12 + 6×28 + 60 = 240 bytes, leaving 16 bytes in its hypothetical 256-byte reservation. C's 96 bytes remain entirely reserved; A's unused bytes cannot increase the B budget. Compression output/size may vary across runtimes: the app measures actual output every time. No claim is made that arbitrary clinical cases, full names/UUIDs or all essential material fit 400 bytes. The fixture includes short synthetic identifiers and deliberately labelled synthetic terminology. Source data outside a selected handoff is not reconstructible from that handoff.

## Security and hardware boundaries

The section keys in automated tests are separately generated random non-extractable keys, held only in test memory. **No production offline provisioning exists.** A safe future design needs authenticated receiving device keys, explicit sending/receiving grants, per-referral per-section keys, receiver-only read capability versus logger write capability, securely reviewed transport-device custody, retirement and recovery. A shared AES key authenticates possession, not a clinician's identity or a distinct logger's signature. It must not replace the existing signed connected packet. Recipient envelopes/signatures/key references consume additional capacity not included in this small envelope; they require a measured protocol decision. No bridge firmware universal key is permissible.

The receiver currently needs trusted binding and exact expected sequence supplied separately. Complete old ciphertext can still be cloned or replayed if that external expectation is stale or absent. Nonces and AES authentication do not solve freshness, cloning, device theft or access revocation. Partial/corrupt/mixed bytes fail, but a write interrupted before altering an old complete record can leave that valid old record intact. Do not claim current-trip success without a separately verified durable generation/commit protocol, exact physical readback and reconciliation. Section C reserves room but is not that protocol yet.

The new binary packets are **not sent through `sendBleHandoff`**: the working bridge's firmware/protocol and NFC memory commands are not verified here. Legacy BLE/frame/JOSE readers remain unchanged. No flash, tag overwrite/reformat, production rule change, new role, file transfer, AI API, billing or data migration occurred.

## Verification and continuation

- 202 application tests across 37 files passed (166 existing + 36 NFC). Tests cover stable wire bytes, dictionary import/conflicts, exact values/timestamps/subjects/negations, unknown and malformed data, compression fallback/bombs, all-byte corruption and all truncation points, wrong keys/contexts, independent A/B outcomes, memory rejection/reservation, travel fullness/chronology, source omissions and measured budgets. Existing care retry and legacy BLE/frame/packet tests passed unchanged.
- Application TypeScript, full lint, whitespace checks and documented production build passed; existing bundle-size advisory remains. Fixtures are excluded from public build.
- Actual Edge component fixture: prepare/subject selection, full source comparison, explicit history exclusion with reduced size and unchanged proposed ID, preview approval, source-edit invalidation and exact-source restoration requiring reapproval passed. This is component acceptance, not authenticated production account or physical hardware acceptance.
- Browser fixture: `tests-care/nfc-review.html` and `tests-care/nfc-review-page.tsx`; run existing Vite on loopback port 4188, open `/tests-care/nfc-review.html`. It has synthetic data only and no account or device connection.
- Historical recovery/emulator/rules suites were not rerun for this NFC-only slice. A previous unfinished recovery-journey runner/controller and related transport edits remain uncommitted locally; preserve them. Their earlier 26 focused HTTP/emulator tests passed, but the full two-browser recovery journey was not accepted or published. It is a separate task after the user's new NFC priority.
- Next safe software slice: durable explicitly approved compact-selection record with source hash and received-section provenance, followed by a reviewed offline key/grant/freshness protocol and Section C interrupted-write model. No auto-send or weakening of existing append-only rules. Hardware-dependent integration waits for read-only full-memory evidence and verified V2.2 bridge source/protocol; real clinical terminology waits for professional review. Receiving UI and MatriVitals firmware integration are still pending.

Deployment and exact source/main commit evidence are recorded at the top of the current root handoff after publication.
