# MatriSync ESP32-S3 handoff — MVP protocol v1

Confirmed 2 November 2026: ESP32-S3; NFC reader/tag undecided. Build the BLE receiver first. The app sends the exact signed, recipient-encrypted approved referral; the ESP32 never receives patient plaintext, permanent codes, private keys or the full longitudinal profile. The organized approved document remains separately printable.

## Hardware starting point

Final compile verified 5 November: Arduino-ESP32 3.3.2, FQBN `esp32:esp32:esp32s3`; 597727 bytes program (45%), 97820 bytes static RAM (29%). This is a real cross-compilation, not a physical transfer or flash test. The Windows long toolchain path required a temporary short drive mapping; renaming the sketch's status UUID constant resolved an ESP32 SDK name collision.

Firmware: [`firmware/MatriSyncS3/MatriSyncS3.ino`](../firmware/MatriSyncS3/MatriSyncS3.ino). Target: **ESP32S3 Dev Module**, Arduino-ESP32 **3.3.2**. It uses the core's built-in BLE and mbedTLS libraries, with no additional sketch library. USB power and the S3 are sufficient for this BLE step; no NFC wiring is defined yet. Serial rate: 115200. Advertised name: **MatriSync-S3**.

The receiver holds one complete encrypted packet in **RAM**, with a separate staging buffer. Reset/power loss clears it. Disconnect discards partial staging and retains the last complete packet. Successful BLE transfer/read-back is not an NFC write or a clinical handoff acknowledgement. Add the selected reader's storage operation, capacity validation, physical confirmation and NFC read-back later; do not silently map RAM success to NFC success. A 32 KiB BLE limit does not imply a future NFC tag has 32 KiB capacity.

The firmware is a controlled prototype: BLE chooser selection is not device identity authentication. Anyone nearby who can connect may disrupt or replace its ciphertext; the receiving application independently verifies the exact authorized envelope and signatures. Use fictional submission records. No clinical deployment or hardware pairing/security review is implied.

## App journey

1. Doctor organizes supplied facts, saves a version, reviews and approves it under the approved facility credential.
2. Organization receives that version, selects the destination, initiates and explicitly sends it. The new outbox recovers interruptions.
3. Organization selects **Create encrypted handoff**. Oversized referrals are refused without truncation; shorten and approve a separate version or use the printed document.
4. **Connect ESP32-S3 → Send and verify handoff**. The app sends bounded chunks, the device checks SHA-256, then the app reads every byte back and compares SHA-256 before reporting BLE success.
5. Receiving Organization supplies the sending Organization's approved fingerprint, connects and selects **Read and verify handoff**. First receipt requires online current authorization and exact immutable relay-envelope matching. An exact previously verified saved copy can open offline. Wrong recipients and altered packets cannot open a substitute profile.
6. Review/print the organized approved copy. Independently shared full-profile access and receiving events remain separate controls.

Web Bluetooth needs a supported secure-context browser and an explicit chooser gesture. Use Chrome/Edge with Bluetooth on the presentation computer at localhost, or a properly secured HTTPS deployment. A plain LAN HTTP address is not an equivalent secure context. No phone-native NFC API is used. See the [Web Bluetooth specification](https://bluetooth.spec.whatwg.org/) and [Espressif BLE example](https://github.com/espressif/arduino-esp32/blob/3.3.2/libraries/BLE/examples/Server/Server.ino).

## GATT contract

| Item | UUID / format |
| --- | --- |
| Primary service | `d973f2e0-b19e-4a55-a3e6-77c89601a001` |
| Control, write with response | `d973f2e0-b19e-4a55-a3e6-77c89601a002` |
| Data, read/write with response | `d973f2e0-b19e-4a55-a3e6-77c89601a003` |
| Status, read | `d973f2e0-b19e-4a55-a3e6-77c89601a004` |

All integers are unsigned little-endian. Every write/read value fits 20 bytes (default ATT MTU 23). Maximum packet: **32768 bytes**. Operations are sequential; no notification dependency. Each browser operation has a ten-second timeout and failures disconnect. Retry starts a fresh staging transfer; the already-approved encrypted packet remains unchanged.

- BEGIN control: `[1, length:u32, token:8 bytes]` (13 bytes). Token is a random transfer identifier, not a key. Valid begin clears staging errors, never the previous committed bytes.
- HASH control, twice: `[2, part:0|1, digestPart:16 bytes]` (18 bytes), containing the full SHA-256 digest in order.
- DATA write: `[offset:u32, payload:1..16 bytes]`. Offsets must be contiguous; an identical already-received chunk is accepted. Gaps, changed duplicates and capacity violations fail.
- COMMIT control: `[3]`. Exact expected length and both digest parts must match staged bytes. Only then does the staging buffer become the committed packet.
- SEEK control: `[4, offset:u32]` (5 bytes), for reading a committed packet.
- DATA read: `[offset:u32, payload:1..16 bytes]`. Final chunk is shorter. The app checks every offset and length.
- STATUS read (20 bytes): `[protocol:1, state:u8, length:u32, received:u32, token:8 bytes, error:u8, reserved:0]`. States: `0` empty, `1` staging, `2` complete in RAM. Nonzero error rejects the operation. A disconnect restores the previous complete packet, if any. The app checks token/length/state before and after reading to reject concurrent replacement.

Packet UTF-8 JSON has exactly `version:1`, `channelId`, `approvalId`, `ciphertext`. Ciphertext is the existing forwarded referral JWE; all routing/approval/doctor-signature checks remain unchanged. Outer identifiers are retrieval references, not credentials. Receiver lookup targets this exact ID, so an older handoff does not disappear behind a first-page listing.

## Submission scope

`build:submission` produces `.local-tools/submission-dist` with controlled sharing, approval, print and BLE controls, an offline static shell, and local emulator configuration. It deliberately excludes unreviewed identity integration. Normal production/demo builds still exclude controlled sharing. Public facility onboarding, automatic shared editing and permanent-code clinical loading remain outside this MVP slice. No public deployment is performed by building it.
