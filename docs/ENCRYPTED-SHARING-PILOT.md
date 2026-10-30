# Controlled encrypted-document sharing — 26 October 2026

This is the first implemented submission-core milestone: real original-document encryption and transfer between explicitly approved test accounts in separate browser contexts. The relay is a local Firestore emulator. This is not public sharing, completed profile syncing, a deployed cloud service or a production security certification. Use fictional documents only.

Engineering-only procedure: the assistant operates this pilot and all technical checks. The user reviews finished app screens and usability, not enrollment commands or developer test builds. The normal preview stays on its verified snapshot while this work proceeds.

## Profile versions added on 26 October

Approved endpoints can now send and read encrypted, immutable profile snapshots using the same transport. A snapshot contains the selected patient's recorded details and original-document references, not every patient on the device. Mother username/profile-code credentials are explicitly excluded. Child snapshots have distinct identities; a parent reference never implicitly grants access to the parent or child records.

`profileId` is SHA-256 over a domain-separated tuple of origin account UID and its local patient ID. This is a stable **source-scoped** identity, not the final authoritative clinical Patient ID or an ownership claim. Renaming/updating one source profile retains that identity; same-name profiles, different local IDs, accounts and children remain separate. Cross-origin reconciliation requires the future identity/claim service; names or matching demographic data must never silently merge them.

The profile payload is version 2, signed as `matrisync-profile+jws` and encrypted as `matrisync-profile+jwe`, with the existing account/channel/device/transfer bindings. Original-document version-1 packages remain readable. Profile origin must equal the authenticated signed sender; this does not yet support forwarding another origin's profile or delegated edits. The outer relay envelope remains version 1 with exactly the same schema and access rules; the encrypted payload type is not a new plaintext routing field.

A revision hash covers normalized profile contents, source update timestamp and a deterministic ordered document manifest. Received identical revisions deduplicate within one source profile, including repeat sends; different revisions are retained. The reader explicitly selects a saved version. Receipt order and source timestamps do not establish clinical authority, monotonic source versions or conflict resolution. No snapshot overwrites the recipient's local patient vault.

Each document reference carries the original byte SHA-256, size, MIME type, local document ID, recorded date and source. The reader offers a matched original only when its verified sender, source patient ID, source document ID, digest, size and type all match. A filename or byte match alone is insufficient. Missing originals remain labelled as references until separately delivered. Original source records are preserved.

Saved profile snapshots are encrypted in the existing per-account inbox and can be reopened after reload, while the loaded app is offline, and after future sharing is revoked. Decrypted names and details stay in component memory. Received records are not yet merged into the normal patient directory; public deployment, automated syncing, authoritative ownership/claims, normal-workspace assignment integration, shared editing and durable retries remain open.

## Staff assignment acceptance — 27 October

The controlled pilot now supports an Organization offering an assignment, the named professional accepting it, and the assigning Organization revoking future sharing. These are authenticated, server-enforced changes between separate accounts; the earlier in-memory assignment demonstration is not used for this transport.

An operator first approves **one source patient / facility / professional relationship** in `assignmentRoutes/{id}` and binds a directional channel to it with `assignmentRouteId`. The route contains only scoped identifiers and approved device fingerprints. This approval represents the explicitly approved test-account/facility relationship; it is not public facility verification, a Mother ownership claim, or a grant to inspect every local patient. The source profile ID remains source-scoped, not a completed authoritative patient registry. Clinical names, permanent codes and private keys do not enter assignment metadata.

The Organization then creates `staffAssignments/{routeId}` in `pending` state through the pilot UI. Only that route's professional may move it to `accepted`. Only its Organization may move a pending or accepted assignment to `revoked`. Creation/acceptance/revocation retain server timestamps and accountable actor IDs. Schema validation applies to both creation and updates; clients cannot replace routes, remove required fields, change original attribution, delete assignments or revive a revoked assignment. Reassignment requires a fresh approved route and fresh acceptance.

The relay blocks transfer reads and writes until acceptance, and checks all three current approvals and enrolled fingerprints on subsequent requests. A disabled route, revoked assignment, disabled account or changed key blocks future delivery. Existing independently approved direct channels remain separate; assignment revocation does not erase them. It does not change Mother ownership or delete any source records. Previously received encrypted copies remain readable under the existing offline policy.

The source and recipient also check the signed content against the exact approved source account and patient identity. The assigned Mother's children are not implicitly included. As with other encrypted transfers, rules cannot inspect the ciphertext or prove medical truth: a compromised authorized source can misdescribe its own content. No new encryption primitive or server-held clinical key was introduced.

Engineering setup after the three accounts enroll and are approved:

```powershell
node scripts/sharing-operator.mjs approve-assignment-scope <scope-id> <source-uid> <source-patient-id> <facility-uid> <staff-uid>
node scripts/sharing-operator.mjs connect <connection-id> <source-uid> <staff-uid> <scope-id>
```

Both new routes and channels use a create-only precondition, preventing accidental replacement of an existing scope. The operator must never issue a new direct channel to bypass a revoked patient grant. The local emulator operator remains trusted and can bypass rules; public authorization and direct-code proof still require the planned separate service.

The assistant operates this engineering workflow. Patient-directory integration, home-screen assignment cards, permanent-code loading, atomic Mother claims, forwardable referral packages and automatic synchronization are not yet implemented by this slice. Assignment metadata loads online and is not cached as an offline claim of current access. A transaction or refresh interrupted by disconnection must not be interpreted as a confirmed remote result.

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
- Explicit send/fetch only. No automatic profile merge, direct permanent-code loading or Mother-claim implementation in this transport yet. Those demonstrations remain synthetic. Staff acceptance now gates explicitly approved assignment channels in the development pilot; normal patient-workspace integration remains pending.
- Offline opening works for saved documents and profile versions in the already-loaded signed-in pilot. The development server is not an installable offline pilot; a cold offline launch on a new device has not been demonstrated.
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

## Profile continuation verification — 27 October 2026

- Unit suite: 66 passed across 12 files; ESLint passed. Profile tests cover stable source identity, excluded access credentials, separate child identities, malformed snapshots, immutable revision checks, receipt-order deduplication and exact original-document provenance.
- Both sharing browser scenarios passed on the final code. Separate accounts exchanged original documents and profile versions; repeat delivery retained two distinct revisions without duplicates, unshared children stayed absent, matching originals downloaded byte-for-byte, and saved versions reopened offline after revocation.
- The first resumed browser run stopped at sign-up because the local emulators had stopped. After restarting the local services, the complete sharing rerun passed. No application access rule was weakened to resolve that failure.
- Continuation regression checks also passed: TypeScript, production/demo builds with pilot exclusion, 11 rules tests, 26 general browser tests and 16 account browser tests. The optional genuine-Qwen test remains skipped; these results do not establish actual-model, physical-device or cloud readiness.
- The received-profile screen was visually inspected at a 551-pixel viewport. The normal preview was restarted and reloaded successfully on its verified snapshot; no developer-pilot review was assigned to the user.

## Assignment verification — 27 October 2026

- TypeScript, ESLint, production build and demo build passed. Distribution checks now explicitly exclude `assignmentRoutes` and `staffAssignments` as well as the existing pilot markers. The normal distribution bundles remain unchanged.
- Unit suite: 67 passed. Rules suite: 19 passed, including eight assignment tests. The emulator compiled and enforced the updated rules; no production rule deployment occurred.
- Three sharing browser scenarios passed: existing original-document exchange, preserved profile versions, and the new three-account assignment offer/accept/deliver/revoke flow. The last confirms the recipient cannot fetch before acceptance and can reopen its saved profile offline after revocation. External network calls are rejected by these scenarios.
- Account browser regression: 16 passed, one optional actual-Qwen test skipped. Account switching, unlinked children, separate child documents, camera failure/cancellation and original preservation still pass. The received profile was visually inspected at mobile width; the normal user preview remains on its verified snapshot.
- Adversarial rule outcomes: unauthenticated/unbounded queries, outsider reads, forged routes/roles, direct accepted creation, wrong accepting/revoking actors, missing/extra/type-invalid/oversized fields, original-author or creation-time changes, forged timestamps, replayed acceptance, assignment deletion, revoked restoration, channel substitution and orphan scopes were all denied. Simultaneous acceptance and revocation ended revoked. Each source/staff/facility suspension or changed approved fingerprint blocked future transfer access. Independent direct authorization remained usable after assignment revocation.
- No counters or numeric financial fields are introduced. The full generic crypto tamper suite and the exact-source-patient unit check remain passing. These are prototype access rules tested for the controlled local scope; independent protocol and security review remains required before broader release. Technical checks remain the assistant's responsibility, not a task for the nontechnical user.

## Patient workspace continuation — 28 October 2026

Received profiles are now accessible through the ordinary professional and Organization Patients routes in the controlled development build. They have separate Overview, Prescriptions and Reports tabs, explicit immutable-version selection, Back to Patients navigation and original-file downloads matched by source identity, document identity, digest, type and byte count. No local patient is merged or implicitly linked. Unshared children and other accounts/workspaces remain excluded, including direct URLs. A source-scoped profile hash remains a provenance identifier, not an authoritative ownership claim.

The receiver records its checked workspace as local inbox metadata. All readers require both recipient UID and workspace. This is an application cache boundary, not an additional signed cryptographic role claim. Legacy copies lacking a workspace remain encrypted and preserved but hidden until an authorized re-fetch supplies the workspace. Revoked connections cannot perform that re-fetch. The compatibility shortcut that displayed unscoped copies was rejected during automatic approval review and removed. Read/check/write now occurs in a single IndexedDB transaction so concurrent re-fetches cannot overwrite receipt time, ciphertext or workspace.

The expanded four-account profile browser scenario passed: exact original bytes, two preserved versions despite repeated delivery, separate authorized Organization receipt, wrong-workspace/outsider denial, no unshared child exposure and navigation into retained copies while offline after revocation. The other document and assignment scenarios also passed. Unit checks cover strict scope filtering, unsigned kind metadata, tampering and competing legacy annotations. Normal distribution builds still exclude this pilot; full syncing and referral completion are not claimed.

## Received-profile referral drafts — 29 October 2026

Professional received profiles now include local referral preparation against the explicitly selected signed profile version. Saving reopens the verified inbox and stores immutable versions in the existing encrypted account vault; it never merges the Mother into the local patient directory. Source identity, revision, receipt and byte-bound original references are preserved. Unreceived originals stay reference-only. Organization receipts cannot seed a professional draft. Saved drafts remain editable offline after revocation without enabling any new sharing or approval.

The four-account browser scenario verifies version separation, original downloads, selected-version exports, reload, workspace denial and offline retained-copy editing. Unit tests independently cover wrong-patient matching and vault preservation. See `VERIFICATION-2026-10-29.md`. The normal distribution still excludes this pilot. Generic professional enrollment is not verified doctor authority: clinical approval, facility initiation and referral transmission remain unimplemented.

## Facility credentials and exact-version approval — 30 October 2026

The local operator first explicitly enrolls the test facility as an approver, then fixes each professional's named facility and doctor/caregiver category. These are separate from ordinary Organization membership. The professional submits a request; only that facility can approve/reject it or suspend an approved credential. Rejected requests can be resubmitted; suspension is terminal in this stage. Every transition atomically records an immutable attributed history event. No public verification or upload of license/evidence documents is enabled.

Operator-only loopback commands (technical setup remains the assistant's responsibility):

```text
node scripts/sharing-operator.mjs approve-test-facility <facilityUid> <fingerprint>
node scripts/sharing-operator.mjs approve-credential-scope <staffUid> <facilityUid> <doctor|caregiver>
```

An actively approved doctor may approve an exact saved referral version. The immutable server record is namespaced by doctor and draft/version identity, and binds the current credential event, enrolled key and SHA-256 content digest. It contains no clinical plaintext. The app rechecks the digest against the saved facts, patient/source version and original-document references before displaying or exporting an approved copy. Approval is separate from facility initiation, sending, recipient acceptance and handoff. A caregiver credential never confers doctor approval authority.

Confirmed approval receipts are cached inside the existing encrypted account vault, excluded from the old cloud-backup projection, and scoped to the author and professional workspace. Retained copies can reopen/export offline after suspension. Creating an approval still requires an online server check. Missing server results do not erase a previously saved receipt; a conflicting receipt is rejected. This receipt is historical evidence checked against the authenticated relay, not a portable independently verifiable certificate or a current delivery grant. Recipient validation and encrypted approved-document delivery remain subsequent work.

When a professional has a credential scope, pending/rejected/suspended credentials or disabled/changed scope, member, facility or device approval block future direct and assignment transfers. Legacy explicitly enrolled test pairs without a credential scope retain their prior record-exchange permission, but cannot approve referrals. This compatibility path must not be described as public verified-clinician access.

The final local checks cover 28 rules cases, 83 unit tests and all three sharing browser scenarios, including approval/export, fresh approval after edits, offline cached copies and suspension. See `VERIFICATION-2026-10-30.md` for regression and visual evidence. These remain prototype access rules requiring independent review before broader release; the user is not assigned developer security checks.

## Remaining implementation milestones

### Approved referral delivery and initiation — 31 October 2026

The Doctor explicitly sends one approved version to the named credential-review Organization over its approved connection. `channels/{channelId}/referrals/{approvalId}` stores immutable ciphertext plus bounded routing/approval metadata. It requires the active doctor category, current facility/credential event and enrolled device keys. The JOSE package uses the existing ES256 inside ECDH-ES/A256GCM primitives with separate referral content types; it binds the six routing fields, selected draft version, source references and exact approval. Recipient verification also compares the authoritative receipt before local caching. No full profile, original bytes or private profile code is included.

The recipient's separate `matrisync-referral-deliveries-v1` IndexedDB cache retains ciphertext and checked approval metadata. Offline reopening remains available after revocation. Receipt does not grant unrelated patient/profile access. The normal workspace may resolve only an independently received authorized profile.

`channels/{channelId}/referralInitiations/{approvalId}` records immutable explicit Organization initiation for one selected approved Organization destination. The current doctor/facility/connection and destination roles/keys are enforced by rules. Changing the selected destination clears UI confirmation; competing requests cannot overwrite one another. Initiation is not destination transmission, acceptance, arrival or handoff acknowledgement. Current status requires an online check; cached copies do not fabricate progress.

The local sharing server now restricts image/connect destinations to the app and loopback. Browser checks require this CSP and verify that any Firestore connectivity-image probe is blocked by Chromium, with no external responses. External model download is consequently unavailable in this isolated pilot; normal RUHI operation is unchanged. Normal distributions still exclude the pilot. See `VERIFICATION-2026-10-31.md` for exact test evidence and remaining limits.

1. Bind the implemented source-scoped identities and preserved versions to authoritative patient identities and profile loading/claim; integrate approved assignments and authorized records into patient workspaces and prevent revoked-code regrant.
2. Larger encrypted original attachments, durable acknowledged outbox, pagination, restart/retry/conflict handling and a reviewed multi-device/recovery protocol.
3. Forward the exact approved document from the initiating Organization to the selected destination; receiving acceptance/arrival/acknowledgement/closure and correct authorized profile retrieval; source-preserving clinician documentation assistance. Doctor-to-initiating-Organization delivery and initiation are implemented above.
4. Compact handoff protocol plus actual MatriSync hardware or honestly labelled BLE simulator; genuine offline-model acceptance on intended presentation devices. RUHI branding and actual offline inference on the Windows/Edge development machine are already checked.

References: [JOSE CompactEncrypt](https://github.com/panva/jose/blob/main/docs/jwe/compact/encrypt/classes/CompactEncrypt.md), [Firebase Firestore emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore), [Firebase Auth emulator](https://firebase.google.com/docs/emulator-suite/connect_auth). This implements the authorized controlled-account scope in `SUBMISSION-CORE-PLAN.md`; public verification remains deferred.
