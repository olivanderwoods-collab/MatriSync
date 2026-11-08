# Complete controlled sharing history — 1 November 2026

Continues `c60c14b`. Previously, connection lists, staff assignment routes and record receiving each stopped at 20 results. A source could send an original/profile that the recipient could no longer reach after enough newer deliveries. An active assignment or its connection could also disappear behind older metadata.

The existing controls now traverse server pages of at most 20 records. No rule limit, authority requirement, record schema, key or original file is changed. Connection/assignment queries keep their participant filters. Transfer queries keep descending server creation time. A document-snapshot cursor carries the document ID as the tie-breaker, so equal timestamps do not skip records. Both direct receiving and the integrated staff receiving action use the same paginated record path.

## Receiving and authority

Every page checks online state and the signed-in account. Metadata lists recheck the approved account, workspace and enrolled device. Record receiving rechecks the current channel and assignment; changed participants, device fingerprints or assignment patient scope stop the scan. Existing server rules independently authorize every query and attachment part read. A previous page or saved cursor cannot authorize later downloads after revocation.

Each document/profile still passes the existing signature, ciphertext, context, original-file and assignment checks before durable inbox storage. The count represents records checked, including immutable copies already saved; it is not a count of newly created records. If a later page fails, the error reports how many records were checked before stopping. The direct sharing screen refreshes its saved inbox even on failure. Earlier verified copies remain available; no partial document is accepted and no overall success is reported.

Retry starts from the newest page and safely rechecks existing copies. The immutable inbox keeps its original ciphertext, provenance and saved timestamp. This does not implement automatic synchronization or a persistent incremental-download cursor. The UI explains that older deliveries are included and that saved progress remains after interruption.

## Verification

- 96 unit tests in 23 files passed, including existing immutable-inbox and original-byte preservation checks.
- All 45 rule tests passed. A new emulator case creates 21 entries with identical timestamps, retrieves 20 then the exact remaining ID, denies limit 21, revokes the channel and denies the same continuation query.
- The new browser journey uses 21 approved connections, 21 real encrypted originals with identical relay timestamps, and an older encrypted profile. Offline injection during the twentieth inbox save stops the scan; 20 saved documents remain visible and survive reload. Retry verifies all 22 transfers, retrieves the older profile and remaining original, preserves all earlier saved timestamps, and downloads byte-identical original data. Revocation blocks another fetch while retaining all copies. No uncaught page errors occurred.
- The existing staff-assignment browser journey now places the active scope after 20 preserved inactive scopes. Facility offer, named-staff acceptance and scoped delivery remain reachable and pass. The other controls retain their existing authorization behavior.
- All seven sharing browser journeys passed together: both assignment journeys, the new history/retry scenario, 10 MiB interrupted attachment recovery, legacy original delivery, concurrent outbox retry, and the full profile/referral/destination receiving-event journey.
- ESLint, TypeScript, demo and production builds passed. Normal production remains cache `92e95aac48bc` / asset `index-CgIeYTFk.js`; demo remains `713512e824ac` / `index-DQjrZRgx.js`. Sharing stays excluded from both distributions.
- Restored the unchanged normal preview on port 5173 from `.local-tools/review-staff-workspaces-20261031`, opened it in the in-app browser and verified the actual script asset. Browser records were not cleared or migrated. Current preview handle is browser 3, tab 1; the earlier adapter problem did not recur in the new browser session.

The local emulators had stopped between sessions. A simultaneous restart collided on their logging port 4500 and terminated the combined Auth launcher; starting Auth alone resolved the collision without changing app permissions or clearing existing browser storage. An initial fault-injection attempt targeted REST while the web SDK uses its query stream; the test now interrupts via the isolated page's online state during its twentieth inbox save. A transaction-completion listener initially ran after the next-page continuation; injection now happens before the save completes, and the app waits for durable completion before stopping. Test hooks are not shipped in application code.

Evidence: `tests-rules/sharing.test.ts`, `tests-sharing/{documents,assignments}.spec.ts`, and ignored `.local-tools/pagination-*.log`. No dependency downloads, cloud deployment, rules edits, production activation or user developer testing.

## Limits and next work

Pages are current server reads, not one atomic snapshot of all history. Newer arrivals during a scan may require another explicit fetch. A corrupt or unauthorized package stops the scan; it is not silently skipped. Restart currently rechecks older saved copies, and whole-file crypto retains the existing memory/storage costs. This change removes the 20-result truncation in these three paths; it does not paginate separate referral/credential histories, prune outbox/staging data or implement shared editing.

Identity proof/recipient-key review and actual loading/claim integration, acknowledged shared edits/conflicts, documentation assistance, BLE transport and final combined-core rehearsal remain unfinished. Public facility onboarding stays deferred.
