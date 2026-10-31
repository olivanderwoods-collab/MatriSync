# Patient identity and permanent-code continuation — 31 October 2026

Status: implementation boundary and next-work contract. This is not an implemented ownership service or an independently reviewed cryptographic protocol.

## Confirmed product behavior

The existing decisions in `SHARING-ACCESS-PLAN.md` remain authoritative. A verified clinician uses the permanent username/code pair without another Mother approval. A signed-in Mother may directly claim an unclaimed clinician-created patient. The first successful claim is atomic; another account cannot replace it. Revoked direct access cannot be recreated with the same pair. Direct and facility-assignment grants remain separate. Saved records remain readable offline after revocation.

These decisions are settled. Public facility onboarding remains deferred; the next implementation must operate only between explicitly approved test accounts.

## Current implementation boundary

Local patient usernames/codes are stored inside the existing encrypted record vault. They are not an authoritative global directory or proof of ownership. The current in-memory linking/claim demonstration is synthetic. The controlled sharing relay has real account/device checks and encrypted transfers, but its operator-approved channels and source-scoped profile IDs do not implement code verification or first ownership claims.

The staff workspace integration does not change that boundary. It offers, accepts and revokes existing approved scopes; it cannot create an owner or a new permanent-code grant. A received profile remains a signed source version rather than a replacement of the recipient's local patient record.

## Required next implementation

1. Specify an authoritative identity service for the controlled environment. Verify authenticated account, active credential category, approved device and account status independently of a requested workspace. Restrict any emulator token acceptance to an explicitly local configuration; an unsigned emulator token must never authenticate a production endpoint.
2. Define username uniqueness/normalization and stable identity mappings before registration. Preserve existing username/code pairs and source IDs; conflicts require explicit resolution, never silent rotation, merging or replacement. Do not equate Auth UID, patient ID, source profile ID or band inventory ID.
3. Implement registration and first claim as server transactions, with idempotency and immutable ownership history. Competing claims must yield one owner. Wrong code, retry, timeout and foreign-owner outcomes must preserve all original records. Link the successful identity without overwriting an existing Mother self-profile.
4. Specify and independently review the permanent-code proof and recipient-key delivery protocol before connecting it to clinical records. A client-provided hash is not by itself an authenticated ownership service. Do not use the permanent code as a record-decryption key or introduce server-held plaintext private keys. Never persist codes in server data, logs or telemetry. Review rate limits, replay binding, device replacement and recovery together with the proof.
5. Bind any successful access request to the exact authenticated recipient device and current authoritative grant. Source-authorized encrypted delivery must preserve signed originals and immutable versions. Distinguish permission granted, delivery pending and records saved. A source device being unavailable must not result in a fabricated successful download or another approval prompt that contradicts the settled product decision.
6. Keep durable revocation history. Reusing the pair cannot erase a revoked direct grant; facility revocation cannot erase an independent direct grant. Deny future fetches, new key delivery and queued publication when authority is revoked, while preserving previously saved offline copies.

## Required evidence before integration

Use separate authenticated synthetic accounts and isolated storage. Verify racing first claims, duplicate registration, wrong code, forged credentials/devices, replay, retries after uncertain responses, source offline/restart, revoked-code attempts and independent grants. Compare original attachment bytes and source revisions. Inspect service storage, request/log surfaces and browser persistence for forbidden plaintext. Run production build exclusion checks until this service is ready for the separately approved final core integration.

No new dependencies or identity backend were introduced by the staff workspace checkpoint. The next implementation must resolve the protocol and authoritative-service boundary above; it must not promote the synthetic UI into ownership authority.
