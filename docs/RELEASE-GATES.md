# MatriSync release gates

## Latest approved access rules — 25 October 2026

The user explicitly chose **Keep live facility verification deferred for now** after reviewing the next-stage authority question. Keep that service disabled and continue independent local work; do not treat this as permission to choose a bootstrap authority.

The synthetic credential-review and retained-copy tests now exercise these rules, but do not close the live verification/E2EE gates below. Initial facility authority and approver appointment are still unresolved; the test's fixed verified facility is not a production bootstrap mechanism.

Latest confirmed choices: verified facilities approve their clinicians; revoked staff retain readable previously saved offline copies but cannot receive future sharing. See [sharing implementation contract](SHARING-ACCESS-PLAN.md). These choices are settled; initial facility verification, key recovery, grant enforcement and protocol review are still release gates.

Follow [DECISIONS-2026-10-25.md](DECISIONS-2026-10-25.md). Permanent username + profile code grants verified clinicians direct access; a signed-in Mother directly claims an unclaimed clinician-created profile with that pair. These replace the earlier matching-only/second-approval requirement for those two flows. The synthetic implementation is not live authorization.

- [ ] Authoritatively verify clinician roles; deny self-declared or forged roles even with valid identifiers.
- [ ] Enforce unique identities, atomic single-owner claims, authenticated recipient-key delivery, abuse controls and an approved recovery/revocation policy. Never permit a code to restore a revoked direct grant.
- [ ] Implement real cross-account E2EE; local clinician-created profiles currently cannot be retrieved by a Mother account.
- [ ] Keep compact band handoff separate from full-profile retrieval; retain Sync NFC Band wording.
- [ ] Verify professional credentials/facility affiliations and family linkage separately from saving local forms.

## Account roles — user requirement, 23 October 2026

The same credentials can currently open Mother/Caregiver, Healthcare Professional and Healthcare Organization workspaces. The user explicitly permits this for testing now and requires it fixed before the final build. Keep this requirement open until tested; UI hiding alone does not satisfy it.

- [ ] Define approved account roles and multi-role membership rules; do not infer professional/facility authority from a sign-up choice or route.
- [ ] Enforce role and record permissions in the authoritative backend and relevant local access paths, not only navigation.
- [ ] A mother-only account cannot obtain professional or organization privileges through login selection, a direct URL or a crafted request.
- [ ] Verified facility membership, the approved direct-access rules and accepted staff assignments govern shared records; enforce the separately reviewed revocation rules.
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
