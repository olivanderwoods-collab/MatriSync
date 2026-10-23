# MatriSync release gates

## Account roles — user requirement, 23 October 2026

The same credentials can currently open Mother/Caregiver, Healthcare Professional and Healthcare Organization workspaces. The user explicitly permits this for testing now and requires it fixed before the final build. Keep this requirement open until tested; UI hiding alone does not satisfy it.

- [ ] Define approved account roles and multi-role membership rules; do not infer professional/facility authority from a sign-up choice or route.
- [ ] Enforce role and record permissions in the authoritative backend and relevant local access paths, not only navigation.
- [ ] A mother-only account cannot obtain professional or organization privileges through login selection, a direct URL or a crafted request.
- [ ] Verified facility membership, patient sharing/consent and accepted staff assignments govern access to shared records; revocation is enforced.
- [ ] Cross-role testing is isolated to development/test configuration and synthetic data; the final build cannot enable it accidentally.
- [ ] Verify allowed access and denied cross-role/cross-account access, including stale sessions and offline cached records.

Temporary cross-role testing must not be used as authorization for live shared clinical records. Keep the current development behavior during the pending design review; do not claim role enforcement is complete.

## Related unresolved decisions

The [confirmed 23 October decisions](DECISIONS-2026-10-23.md) resolve referral authority/navigation, financial scope, caregiver terminology, record unlocking and synthetic-first sharing. Existing records must be preserved through migration. Real clinical AI, shared access and BLE/NFC success must not be represented as working before their separate acceptance checks pass.

- [ ] Remove all Guest/demo fixtures from the final product, not just their labels. The synthetic assignment module is already excluded from production bundles; the earlier Guest preview still exists and must be retired for final release.
- [ ] Implement and independently review end-to-end sharing: authenticated recipient keys, encrypted key envelopes, consent, device enrollment/recovery, revocation and offline cache policy. Device-local automatic encryption is not completed E2EE sharing.
- [ ] Confirm server content/key blindness; only authorized connected profiles can decrypt patient records/files. Test forged roles, replayed requests, unaccepted/revoked assignments and account/device substitutions.
- [ ] Verify original-record and attachment preservation during all migrations. Legacy device-access migration requires the original passphrase once; never reset records to hide a migration failure.
- [ ] Validate camera capture and local-file flows on intended phones; desktop file-input checks do not establish real camera compatibility.
