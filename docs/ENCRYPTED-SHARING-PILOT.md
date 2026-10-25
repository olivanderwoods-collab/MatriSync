# Controlled encrypted-document sharing — 26 October 2026

This is the first implemented submission-core milestone: real original-document encryption and transfer between explicitly approved test accounts in separate browser contexts. The relay is a local Firestore emulator. This is not public sharing, completed profile syncing, a deployed cloud service or a production security certification. Use fictional documents only.

## What this build does

- A signed-in account enrolls one browser's public device keys. An external local operator approves the account, role and exact device fingerprint, then creates a directional connection between approved accounts.
- The sender explicitly selects an original PDF/image, either from its existing encrypted records or from a file picker. It verifies the other device's fingerprint obtained from that person's own screen through a separate trusted channel.
- The browser signs and encrypts the original bytes and metadata before sending. The recipient independently verifies the sender fingerprint, downloads ciphertext, verifies/decrypts it and saves the encrypted package locally. Downloading the original returns the original bytes.
- Re-fetching an existing package does not create another saved copy. Transfers are immutable; a repeated send ID cannot overwrite a previous transfer.
- Revoking a connection or account blocks future server reads/writes. Previously saved packages still open offline in that signed-in account, as explicitly requested by the user.
- Mother, professional and Organization accounts use the same document transport. This does not grant Organization staff unrestricted patient-profile ownership or implement the clinical referral state machine.

## Protocol and trust boundary

Implementation uses `jose` 6.2.13 and browser Web Crypto: an ES256 JWS inside an ECDH-ES / A256GCM JWE. It uses standard JOSE primitives, not a new cipher. The application protocol and key lifecycle still need independent review before broader distribution.

The signed payload binds version, transfer ID, connection ID, sender/recipient account IDs, both device-key fingerprints, original document bytes, filename, MIME type and supplied source/patient/document identifiers. The recipient checks all bindings, protected-header types and algorithm allowlists. Changing ciphertext, keys, recipient or signed context fails verification. Source fields are supplied records, not AI-created clinical conclusions.

Each browser generates separate P-256 signing and encryption key pairs. Private CryptoKeys are nonextractable and stored in an account-scoped IndexedDB entry. Only public points and their SHA-256 fingerprint go to the relay. Nonextractable does not protect against malicious same-origin script or a compromised device: such code may still use a key. The app origin, delivered JavaScript, device and enrollment operator remain trusted components.

First use requires the peer fingerprint from a separate trusted channel; a key read only from the relay is insufficient. Pins are account/peer scoped and cannot silently change. Operator approval also requires a fingerprint independently obtained from the account's device. This is a controlled test enrollment ceremony, not public facility verification.

Recovery policy for this slice is fail-closed: one enrolled browser per account; no silent key replacement, automatic recovery or reactivation of revoked membership. Losing browser storage loses access to received copies on that browser. Existing originals in the sender's record vault are not deleted or migrated. Multi-device enrollment, lost-device recovery and key rotation must be designed and reviewed before public use.

The relay stores ciphertext and nonclinical routing metadata: account IDs, public keys/fingerprints, roles, connection membership, enabled flags, transfer IDs, timestamps and package lengths. It does not store plaintext clinical contents or private keys. This protects document content under the stated device/origin/key-authentication assumptions; it does not hide relationship, timing or size metadata. It does not provide forward secrecy against later recipient-key compromise, prevent an authorized recipient redistributing a download, or remotely erase offline copies.

Rules deny client approval/channel changes, foreign enrollment reads, unbounded listing, unauthorized senders, changed keys, plaintext-field injection, updates and deletes. Both endpoint memberships and the channel must remain enabled for a transfer read/write. The backend trusts operator-assigned membership/channel data, never the selected UI role. Rules cannot inspect encrypted clinical content or validate a medical document.

## Explicit limits

- Local loopback only: `demo-matrisync`, Auth `9099`, sharing Firestore `8087`; existing backup rules/emulator `8086` remain separate. No cloud project provisioned or rules deployed.
- Pilot UI requires development mode plus `VITE_SHARING_PILOT=1`; production and demo distribution builds are checked for accidental inclusion.
- Nonempty PDF/PNG/JPEG/WebP files up to **256 KiB**. This is a first-slice transfer limit, not the intended final attachment limit. MIME declarations are not malware scanning; originals are downloaded, not interpreted.
- Up to 20 connections and the newest 20 transfers per connection. Pagination, larger-file transport and history synchronization remain pending.
- Explicit send/fetch only. No automatic profile merge, direct permanent-code loading, staff-assignment acceptance or Mother-claim implementation in this transport yet. Those existing demonstrations remain synthetic.
- Offline opening works in the already-loaded signed-in pilot after packages are saved. The development server is not an installable offline pilot; a cold offline launch on a new device has not been demonstrated.
- No durable send outbox. Offline sends are refused before starting. A connection loss after starting can leave an SDK request pending; the UI does not report completion until the relay acknowledges it. Recovery of ambiguous delivery across reloads, conflict handling and resumable transfer remain next-stage work.
- Local Firebase emulators intentionally have administrative bypasses. Keep them bound to loopback, use fictional data and never treat their operator endpoint as a deployable authentication design.

## Run locally

Prerequisites: existing dependencies, Firebase CLI and Java 21. No additional dependency download is required in this checkout. From `app`, run the existing Auth/backup emulators in one terminal:

```powershell
$env:JAVA_HOME = Join-Path $PWD '.local-tools/java/jdk-21.0.12.1+1-jre'
$env:PATH = "$env:JAVA_HOME/bin;$env:PATH"
$env:JAVA_TOOL_OPTIONS = '-Djdk.net.unixdomain.tmpdir=.'
node .local-tools/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --only auth,firestore --project demo-matrisync --config firebase.json
```

In another terminal with the same Java environment, run the isolated sharing relay:

```powershell
node .local-tools/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --only firestore --project demo-matrisync --config firebase.sharing.json
```

If these ports are already serving this test setup, reuse them. Do not launch duplicate servers. These emulators are ephemeral unless deliberately exported; restarting loses test enrollments/relay documents, not the existing account vaults. The Windows Java socket setting avoids this host's temporary-path loopback error. See [Java networking properties](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/doc-files/net-properties.html).

Start the pilot:

```powershell
pnpm dev:sharing
```

Open `http://127.0.0.1:4175` in separate browser profiles (or Edge and Chrome) for distinct test accounts. Register with fictional email addresses; this is emulator authentication. Open **More → Encrypted sharing pilot**, then **Request approval / Refresh connections**. Copy each account's ID and own device fingerprint to the operator. IDs/fingerprints are public identifiers, not passwords or private keys.

The operator runs these commands with the actual values shown by those devices:

```powershell
node scripts/sharing-operator.mjs approve <mother-uid> mother <mother-fingerprint>
node scripts/sharing-operator.mjs approve <doctor-uid> professional <doctor-fingerprint>
node scripts/sharing-operator.mjs connect mother-doctor <mother-uid> <doctor-uid>
```

Repeat approval for an Organization account and create a separate doctor-to-organization connection to test that direction. The operator script is hardcoded to the local emulator and cannot accept a live service URL or cloud credentials. Approval is never exposed as an in-app self-service switch.

## What to check

1. In Mother, save a small fictional report in My Health. Refresh connections in both accounts; select the approved connection and compare fingerprints with the other account's own screen.
2. Mother selects the saved local document and explicitly sends it. Clinician fetches it, opens the saved copy and downloads the original. Confirm the Mother's original remains in My Health.
3. Repeat fetch: one saved copy remains. Reload the clinician page, disconnect networking, then reopen/download the saved copy.
4. Reconnect and revoke future sharing using `node scripts/sharing-operator.mjs revoke-connection mother-doctor`. New fetches must fail; the saved copy must still open. `revoke-account <uid>` blocks all that account's future connections.
5. Try a wrong fingerprint, an unapproved account and a different workspace route. They must not grant new sharing access. Do not clear existing browser storage to test this; use another fresh browser profile.

Automated checks:

```powershell
pnpm test:sharing
pnpm test:rules
pnpm exec vitest run --maxWorkers=1
pnpm lint
pnpm build
pnpm build:demo
pnpm exec playwright test --workers=2
pnpm test:auth
```

The sharing browser test uses three isolated account contexts, compares downloaded bytes, inspects relay storage for absence of plaintext filenames/content, verifies repeated fetch, revocation and offline reopening, and rejects external network calls. Rules tests separately exercise unapproved/cross-account access, self-approval, malformed writes and revoked memberships. Crypto tests cover tampering, wrong keys, context substitution, persisted keys, pins and encrypted-cache isolation. These checks are evidence for this bounded pilot, not proof that the whole submission journey is ready.

## Verification recorded on 26 October 2026

- TypeScript, ESLint, production build and demo build passed. Both build modes confirmed exclusion of the pilot code; production also excluded synthetic assignment/medicine test assets.
- Unit suite: 59 passed. Rules emulator suite: 11 passed (6 sharing-policy cases plus 5 existing encrypted-backup cases).
- Three-account sharing browser scenario passed using a saved Mother report, exact-byte downloads, encrypted relay inspection, two directional connections, repeated fetch, connection/account revocation, offline reopening and original preservation.
- General browser suite: 26 passed. Isolated account suite: 16 passed, 1 optional genuine-Qwen test skipped. One earlier concurrent account run was invalidated by a dev-page reload while the general suite wrote screenshots; the clean isolated rerun passed. Run these suites sequentially in this shared checkout.
- The received-document screen was visually inspected at a 551-pixel mobile viewport. Actual phone camera, cold offline pilot launch, physical BLE/NFC and live-cloud operation were not established by these tests.

## Next implementation milestones

1. Stable shared patient identity, explicit record versions, authorized profile loading/claim and accepted staff assignments; prevent duplication and revoked-code regrant.
2. Larger encrypted original attachments, durable acknowledged outbox, pagination, restart/retry/conflict handling and a reviewed multi-device/recovery protocol.
3. Doctor-reviewed referral document, organization initiation, receiving acknowledgment and correct authorized profile retrieval.
4. Compact handoff protocol plus actual MatriSync hardware or honestly labelled BLE simulator; then RUHI branding and genuine offline-model acceptance on intended devices.

References: [JOSE CompactEncrypt](https://github.com/panva/jose/blob/main/docs/jwe/compact/encrypt/classes/CompactEncrypt.md), [Firebase Firestore emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore), [Firebase Auth emulator](https://firebase.google.com/docs/emulator-suite/connect_auth). This implements the authorized controlled-account scope in `SUBMISSION-CORE-PLAN.md`; public verification remains deferred.
