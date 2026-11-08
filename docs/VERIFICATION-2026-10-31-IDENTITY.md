# Identity metadata checkpoint — 31 October 2026

Implemented after `bcab125`: a separate local authoritative identity service and candidate code-proof helper. No app routes, design, existing records, clinical channels or security rules were changed. No deployment or new dependency installation occurred.

## Evidence

- 89 unit tests across 21 files, including five new proof/schema/canonicalization tests.
- 12 identity tests: nine real local Auth/Firestore/HTTP scenarios plus three transaction-adapter failure tests. Separate accounts and actual enrolled ES256 device signatures are used. Fictional test accounts only; tests do not clear existing databases.
- 40 Firestore rule tests passed. The new case denies client reads/lists/writes/deletes across identity verifiers, ownership, source indexes, direct grants, receipts, events and rate limits.
- ESLint, TypeScript, demo build and production build passed. Explicit exclusion markers keep the identity helper out of app bundles.
- Production remains cache `92e95aac48bc`, main asset `index-CgIeYTFk.js`; demo remains cache `713512e824ac`, main asset `index-DQjrZRgx.js`. These match the previous staff-workspace checkpoint. No new UI or browser journey is claimed for the metadata endpoint. The previous 4 sharing, 26 general and 18 account browser checks belong to `bcab125`, not new identity end-to-end acceptance.
- The service module also imports directly under installed Node 24.22.1, without Vitest's transform adapter. No extra build runtime is required locally.

Identity scenarios verify unique username/source registration, competing registrations, racing first Mother claims, safe exact retries, conflicting request IDs, preserving the original source/verifier, no replacement of another owner or owned identity, wrong code, account/signature mismatch, stale commands, schema pollution, current credential/device enforcement, prohibited Organization role, terminal revocation, stale-success replay without regrant, owner-controlled revocation after claim, origin/host/token rejection, no raw code/private key/clinical fields in the inspected identity document, restart persistence and rate limiting that survives restart. No clinical channel/assignment is created by a direct metadata grant.

A repeated race uncovered Firestore transaction-abort errors embedded in an HTTP-success streaming response. The adapter was corrected to classify that failure and retry with the previous transaction context. Focused adapter tests cover the failure and ambiguous commit responses; subsequent competing claim/registration runs passed. A Host-header test initially used Node fetch, which rewrites that header; it now uses an actual raw HTTP request and verifies rejection.

Logs: ignored `.local-tools/identity-unit.log`, `identity-service-final.log`, `identity-rules.log`, `identity-lint.log`, `identity-build-demo.log`, `identity-build-production.log`. The endpoint shuts down after integration tests. Existing local emulator state is transient and is not durable production storage.

## Boundary

This is a tested local metadata foundation, not a finished code-loading/claim journey. The candidate proof has not received independent review. Source-key delivery, client registration binding, encrypted profile loading, local self-profile conflict handling, recovery and final core integration remain open. See [protocol and next gates](PATIENT-IDENTITY-REVIEW-STAGE.md). Developer testing remains the assistant's responsibility; no user developer-build test is requested.
