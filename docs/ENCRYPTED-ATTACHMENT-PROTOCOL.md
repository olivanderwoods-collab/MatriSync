# Resumable original attachments — 1 November 2026

This extends the controlled local sharing pilot after `3097351`. Existing signed document payloads, recipient bindings, keys, local records and received-copy schema remain unchanged. The maximum original is now 10 MiB. The normal and demo distributions still exclude the pilot.

## Publication and recovery

The sender validates the original, signs its complete source/context envelope and encrypts it to the approved recipient as before. The durable outbox seals the exact recipient ciphertext and source content to the existing sender device before any publication. Ciphertexts up to 700,000 characters retain the legacy inline version-1 relay format. Larger ciphertexts use a version-2 relay manifest with sender/recipient IDs and key IDs, total ciphertext length, SHA-256 and chunk count. These transport versions are independent of the unchanged signed payload versions.

An immutable staging manifest is created at `channels/{channel}/uploads/{transferId}`. Its `chunks/{index}` contain up to 400,000 ASCII JWE characters each, an integer index and a server timestamp. The manifest permits 2–70 chunks and at most 28,000,000 ciphertext characters, sufficient for the full signed/encrypted 10 MiB original. All chunks except the last have exactly 400,000 characters; the last has the exact remaining length.

Each write is a transaction that creates a missing record or verifies every expected field of an existing record. A different envelope or part is never overwritten. Explicit resume after reload reuses the original ID, ciphertext and boundaries. Already stored parts retain their original timestamps. Only after all parts have been acknowledged does the client create the matching final manifest in `transfers/{transferId}`. A confirming server read is required before local outbox acknowledgement. Relay storage confirmation is not recipient receipt.

## Authority and validation

All operations require the existing current account, approved devices, active connection and applicable credential/accepted-assignment checks. Staging manifests are individually readable only by the sender. Parts are individually readable by the sender with matching staging scope, or by the recipient with matching final-transfer scope. Upload/part enumeration, client updates and deletes are denied. Manifest and chunk creation use strict field/type/size/index/time validators. The normal `firestore.rules` file is unchanged.

The current-credential helper uses one cached scope read rather than separate existence and data reads, allowing the tested credentialed Mother-to-assigned-clinician path to remain within the rule document-access limit. A missing scope retains the existing explicitly enrolled legacy test-pair behavior; a present scope still requires full current approval. This does not grant unscoped clinicians identity or doctor-approval authority.

Rules enforce immutable matching manifests, but cannot prove that all 70 parts exist or validate cryptographic content within their evaluation limits. An authorized sender can publish an incomplete final manifest, or create missing immutable parts later. Creating staging metadata at an already used transfer ID is also possible; it cannot replace that final record. The client refuses conflicting records. No client may modify stored parts. Recipient verification is therefore mandatory even for a published manifest.

The receiver bounds the manifest, gets every expected part under current rules, validates index/length/characters, verifies the assembled SHA-256, then verifies the existing authenticated encryption, sender signature, exact transfer context and document validation. Assignment content checks still apply. Only the complete verified ciphertext is saved to the existing encrypted inbox; missing or damaged packages produce no partial saved document. Successfully saved originals remain readable offline after revocation.

## Limits

The relay can observe routing IDs, device fingerprints, timestamps, encrypted size/count and a ciphertext digest; names and original bytes remain encrypted. Sender resume is durable. Receiving restarts from the first part; there is no persistent partial-download cache. Whole-document crypto and the sealed outbox require memory and additional local storage; quota failures remain errors, not acknowledged deliveries. This is bounded chunk transport, not streaming cryptography.

Abandoned encrypted staging data and acknowledged outbox history are not automatically pruned. Connection/transfer listing remains bounded to 20 and is not paginated. Automatic background sync, acknowledged shared edits/conflicts, referral outbox, multi-device recovery, identity/key integration and deployment remain separate unfinished work. Public facility onboarding stays deferred.
