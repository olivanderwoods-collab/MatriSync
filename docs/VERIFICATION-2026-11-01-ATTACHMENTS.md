# Larger encrypted originals — 1 November 2026

Continued the existing approved attachment/outbox work after `3097351`. Original documents up to 10 MiB now use bounded immutable encrypted parts when their ciphertext exceeds the old inline limit. Interrupted sender uploads resume from the same durable encrypted package and reuse existing parts. Old inline documents remain readable. Existing records, device keys, recipient bindings and visual design are preserved.

Read [the attachment protocol](ENCRYPTED-ATTACHMENT-PROTOCOL.md) for the exact storage schema, authority checks, publication boundary, exposed metadata and limitations. This is local-emulator/test-account evidence; nothing was deployed or enabled in the normal distribution.

## Checks

- 96 unit tests in 23 files passed. New tests sign/encrypt, chunk, assemble and decrypt an actual 10 MiB original with exact byte equality; reject missing, reordered and substituted chunks; validate manifest/index/length/character bounds; round-trip the full file limit and reject an oversized original.
- All 44 emulator rule tests passed. New paths are tested against omitted/extra/malformed fields, forged metadata, invalid timestamps, wrong indexes/sizes, absent staging, mismatching final manifests, unauthorized users, enumeration, overwrite/delete attempts, unpublished recipient reads, revocation and key changes. A current credentialed assigned professional can receive; pending assignment and subsequent suspension deny access.
- All six sharing browser journeys passed together, including both staff-assignment journeys, legacy original delivery, durable-outbox recovery, the new 10 MiB scenario, and the full profile/referral/destination receiving-event journey.
- The full-size browser scenario passed separately. It interrupts the second chunk transaction, confirms only one part and no discoverable final transfer, reloads and resumes without choosing the source again, and checks that the first part and timestamp remain unchanged. All parts and exactly one final manifest are stored. Relay fields contain neither the private filename nor original base64.
- The same scenario removes a synthetic relay part after publication, confirms receiver rejection with no partial saved document, restores that exact part, and verifies the entire downloaded 10 MiB original. After revocation and reload, the saved original remains byte-identical offline. There are no uncaught page errors. Failure injection exists only in isolated browser tests.
- ESLint, TypeScript, demo and production builds passed. Normal production remains cache `92e95aac48bc`, asset `index-CgIeYTFk.js`; demo remains `713512e824ac`, asset `index-DQjrZRgx.js`. The new chunk marker is explicitly checked for exclusion from both distributions.
- The preserved normal preview responded HTTP 200 on5173 with `/assets/index-CgIeYTFk.js`. The in-app browser listed its existing MatriSync tab, but its control adapter returned `browser.user is unavailable`; no new visual inspection is claimed. No navigation, reload, session change or record clearing was performed there. The actual changed journey was exercised by the developer browser tests above.

## Investigation notes

The initial credentialed chunk test exceeded the rule document-access cap. Reusing a single credential-scope read and keeping recipient chunk authority tied to the immutable final manifest resolved it without removing credential/assignment validation. Rules cannot establish that every part exists: client final publication occurs last and receivers validate completeness before persistence. Staging/final IDs and already written parts remain immutable; an authorized sender may fill a missing part after an incomplete final publication.

An initial unit assertion attempted to deeply compare millions of byte entries and exhausted its worker heap. Native byte equality fixed the assertion; the complete 10 MiB cryptographic test now passes. Browser fault injection initially missed the transaction URL query string, and an offline-reload assertion initially disabled networking before app initialization; both test mechanics were corrected, with the full scenario rerun successfully.

Evidence is in `src/sharing-chunks.test.ts`, `tests-rules/{sharing,assignments}.test.ts`, `tests-sharing/documents.spec.ts` and ignored `.local-tools/chunks-*.log`. Schema/query analysis is retained in ignored `.local-tools/chunks-rules-analysis.txt` and `chunks-query-inventory.txt`. Older general/account/identity counts belong to their dated checkpoints, not this turn.

## Remaining scope

This is sender upload recovery, not persistent partial-download recovery or streaming crypto. Whole-file processing and the self-encrypted outbox need additional memory/storage. History pagination/pruning and abandoned encrypted-staging cleanup are still absent. Identity proof/recipient-key review and actual loading/claim, acknowledged shared edits/conflict handling, source-preserving documentation assistance, actual BLE transport and final core integration remain unfinished. Public facility onboarding remains deferred. All developer verification stays with the assistant.
