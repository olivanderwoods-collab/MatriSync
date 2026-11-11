# Section C interrupted-write model — 11 November 2026

Development after the Health-a-thon 2026 submission date.

Later continuation on the same date: the durable operation journal described as NEXT below is now implemented/tested in isolation. Read `NFC-JOURNAL-2026-11-11.md` first for exact persistence, 31 NFC tests and remaining authorization/hardware limits. The memory-only statements below describe this earlier checkpoint.

Read before `NFC-APPROVAL-2026-11-11.md`. This slice is an isolated software model in `tests-care/nfc-commit-model.ts`, not a public application feature or device driver. Existing clinical source, records, approvals, firmware, BLE behavior and public UI are unchanged. The five unfinished recovery-journey files remain separate local work.

## Implemented contract

The hypothetical verified Classic 1K layout remains A=400, B=256, C=96 bytes. C holds two independent 48-byte descriptors: its first three blocks belong to A, its next three to B. Additional C blocks in a larger layout remain untouched. The model refuses the actual 48-byte verified map because it cannot accommodate this protocol. Capacity evidence is supplied by tests; the software does not identify or inspect the user's tag.

Descriptor v1, big endian: bytes 0–3 are `4d 43 01` plus section kind (1 A, 2 B); 4–5 dictionary version; 6–7 full encrypted packet length; 8–11 positive generation; 12–43 SHA-256 of the exact encrypted section packet; 44–47 `CMIT`. The descriptor is public metadata and **not a signature or MAC**. Authentication still requires the existing AES-GCM packet and an authorized section key. A trusted external expected referral binding, generation and exact packet digest must match; values read from the tag must never be promoted into that expectation.

Write order:

1. Clear the last descriptor block, including its completion marker, and require exact readback.
2. Write the section's complete padded data blocks, each with exact readback.
3. Write the descriptor's first two blocks with exact readback.
4. Write its final block last, then require exact readback.
5. Reconcile the entire allocated tag image against the exact approved final image and authenticate/decode the target section before returning `confirmed-in-model`.

The model never returns physical-success wording. A missing final acknowledgement remains uncertain until a fresh exact readback reconciles the same operation. It cannot infer successful NFC persistence from BLE RAM, an acknowledgement, a footer or a checksum alone.

Initial A requires blank owned A/B storage and descriptors and generation 1. Initial B requires a complete original A matching an independently trusted pin for the same referral. B's writer can check that encrypted A matches the pin without having A's decryption key. A is immutable: replacement under the same referral is refused. B updates require the exact committed predecessor and increment its generation by one, without wraparound. Only B data and B's own descriptor are written. Unrelated original bytes and unused reservations must remain identical at final reconciliation.

Independent readers need only their section and descriptor blocks. Unreadable/corrupt B cannot prevent reading valid A. Without the expected context or key, reads return `unverified`; mismatched generation returns `not-current` without clinical data; corrupt/incomplete sections return `unavailable`. A result of `current` means current relative to the independently supplied expectation, not a claim that the model established authoritative latest state.

`PendingTagCommit` captures immutable copies of packet, context, before image, expected digest and write steps. Returned arrays are copies. An explicit retry can reuse the exact original packet, nonce, generation and descriptor only if readback matches a sequential write prefix, optionally with one torn block whose bytes are mixtures of its old and new values. Unknown damage, another completed generation or changes to another section refuse retry. This is a conservative interruption model; arbitrary bit corruption is refused rather than repaired. Complete readback should be reconciled before deciding to retry. No automatic send or background retry exists.

## Evidence and limits

- 14 isolated tests passed. One test examines every write step and all 17 byte-prefix cut positions for A initialization and B update: **833 interruption cases**. This is not exhaustive enumeration of every possible 16-byte bit pattern. Additional tests exercise noncontiguous old/new byte mixtures, all 48 descriptor-byte corruptions, early/replayed descriptors, wrong keys/context/digests, missing blocks, padding, ownership/capacity, immutable A, input-copy protection, lost acknowledgement and independent A/B reads.
- The first 13-test run passed; the initial rerun after strengthening A pinning/independent reads was blocked by automatic approval review's usage limit and was not executed. After the stated reset time, the final 14-test rerun succeeded through normal approval review.
- Test command: `node node_modules/vitest/vitest.mjs run --config vitest.nfc-commit.config.ts`. Strict model types: `node node_modules/typescript/bin/tsc -p tests-care/tsconfig.nfc-commit.json`. Evidence log: `.local-tools/nfc-commit-2026-11-11-tests.log`.
- No physical block atomicity, write ordering, readback freshness, power-loss behavior, tag authenticity or firmware compatibility has been verified. Actual transport must provide a coherent fresh read of the same tag while holding exclusive operation ownership; a sequence of stale/cross-tag block reads is not sufficient. The model cannot enforce this on hardware.
- Pending state is currently **in memory only**. Process loss without a retained exact approved operation cannot safely resume. No durable operation journal, bridge acknowledgement protocol, concurrent-device lock, tag backup or secure device key custody was implemented in this slice.
- Because A/B data are updated in place, a failed B write can make previous B unavailable. The design detects that state; it does not promise to recover old B from the tag. Recovery requires retained original/pending ciphertext outside the tag. A remains protected during B writes. Copy-on-write of complete sections would require a different, separately measured capacity allocation.
- Rollback/cloning remains possible if both the tag and the externally supplied expectation are stale. Device timestamps do not prove freshness. A complete old record can survive an interruption before any write; the new expected generation rejects it. Without an independently known new generation the receiver must not call it current.
- Existing sample A sizes (168/345 bytes) and B event capacity (six observations) are unchanged because descriptors consume the already reserved C space. Those sizes do not include future receiver envelopes or logger signatures. They do not establish that a production offline authorization protocol fits 1K.

## Offline key and authority specification — proposed, not implemented

There must be no global tag key or key embedded in JavaScript/firmware. Use fresh random per-referral A and B content keys, wrapped separately to explicitly authorized enrolled device public keys, with authenticated sender/grant provenance. A bridge only transports opaque bytes and never receives clinical keys. The logger gets no A key and no permission to modify A. Grant material must bind patient/referral, dictionary/protocol version, section, original A digest, approved device identities, allowed generation range and grant policy/version. An external trusted authority must validate current account/device/facility/case permissions before issuing grants; no self-selected role or new public bootstrap authority is acceptable.

| Actor | Required capability | Boundary |
| --- | --- | --- |
| Doctor/original app | Approve exact A content; create/wrap referral keys under authorized grants | Existing local approval is not a cloud grant or proof of current clinician authority |
| Receiving facility device | Unwrap authorized A/B keys; authenticate provenance and expected generation | Provision before offline travel, or remain unable to decrypt offline |
| Facility bridge | Bounded opaque block read/write, tag identity/session checks and exact readback | No content key, terminology interpretation or role decisions |
| Authorized transport logger | B encryption/authentication capability, original A pin, generation allocation | Needs reviewed hardware custody and authenticated writer identity; must never gain A write authority |

AES-GCM possession alone does not distinguish an authorized logger from a receiver holding the same B key. If recipients must verify which device wrote B, require a separately authenticated logger signature/commitment and a verified grant. A newly generated B digest cannot be pre-pinned before the journey: the receiver needs a signed authorized completion commitment or a separately trusted online/current source. A descriptor hash copied from the tag is not that commitment. Signatures, key envelopes and grant records must be stored/transferred through a measured supported channel; the current 96-byte C allocation must not silently absorb them or borrow transport memory. Keep the current compact format synthetic until this protocol is selected, reviewed and measured.

Revocation while a receiver is offline cannot erase previously disclosed keys or guarantee immediate denial. Clearly separate retained offline readability from permission to receive new data. Key loss must refuse decryption without silently replacing identities. Logger retirement, clock quality, grant expiry, concurrent writers and generation allocation need explicit policies. Physical WROOM/PN532 bridge identity and the separate MatriVitals device must not be conflated. No paid service, Firebase billing change or new production authority is implied by this specification.

## Next implementation slice

Build an isolated encrypted durable pending-operation journal around this model, preserving exact approved packet/context/baseline and append-only completion evidence across process restart and lost acknowledgements. Test two competing processes and account/referral isolation; never automatically replay writes on restore. Then specify/test signed logger completion and trusted receiver expectations with capacity accounting before attaching a hardware driver. Keep per-referral provisioning and authority decisions explicit, not inferred from a tag or UI role.

Root handoff records source publication and final regression/build/live-asset verification. This test-only slice does not require a Hosting deployment if the documented production build remains byte-identical to the live release.
