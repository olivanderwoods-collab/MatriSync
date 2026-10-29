import { useRecords, VaultGate } from "./records";
import { ReferralDraftEditor, type ReferralReference } from "./referral-drafts";
import type { ReceivedProfile } from "./sharing-profile";
import { matchesProfileOriginal } from "./sharing-profile";
import type { OpenedSharedRecords } from "./sharing-inbox";
import { decodeFile } from "./sharing-crypto";
import { receivedReferralOriginal } from "./shared-referral-source";

export function SharedReferralDrafts({
  uid,
  selected,
  documents,
}: {
  uid: string;
  selected: ReceivedProfile;
  documents: OpenedSharedRecords["documents"];
}) {
  return (
    <VaultGate>
      <ReceivedDraftEditor
        key={`${uid}/${selected.snapshot.profileId}/${selected.snapshot.revision}`}
        uid={uid}
        selected={selected}
        documents={documents}
      />
    </VaultGate>
  );
}
function ReceivedDraftEditor({
  uid,
  selected,
  documents,
}: {
  uid: string;
  selected: ReceivedProfile;
  documents: OpenedSharedRecords["documents"];
}) {
  const { vault, refresh } = useRecords();
  const snapshot = selected.snapshot;
  const origin = {
    profileId: snapshot.profileId,
    profileRevision: snapshot.revision,
    sourceUid: snapshot.sourceUid,
    sourcePatientId: snapshot.sourcePatientId,
    transferId: selected.transferId,
    receivedAt: selected.savedAt,
  };
  function available(reference: ReferralReference) {
    const ref = snapshot.documents.find(
      (d) => d.id === reference.id && d.sha256 === reference.sha256,
    );
    return (
      !!ref &&
      documents.some((d) =>
        matchesProfileOriginal(snapshot, ref, {
          sourceUid: d.sourceUid,
          sourcePatientId: d.document.sourcePatientId,
          sourceDocumentId: d.document.sourceDocumentId,
          sha256: d.sha256,
          type: d.document.type,
          size: decodeFile(d.document.bytes).length,
        }),
      )
    );
  }
  return (
    <ReferralDraftEditor
      drafts={
        vault?.data?.referralDrafts?.filter(
          (d) =>
            d.receivedOrigin?.profileId === snapshot.profileId &&
            d.receivedOrigin.profileRevision === snapshot.revision,
        ) || []
      }
      originals={snapshot.documents}
      sourceNotice={
        <p>
          Using the selected received profile version. Each profile version has
          its own drafts. The Mother's source records remain unchanged. Saved
          copies do not confirm a current sharing grant.
        </p>
      }
      available={available}
      getOriginal={(reference) =>
        receivedReferralOriginal(uid, origin, reference)
      }
      save={async (fields, references, id, version) => {
        if (!vault || vault.uid !== uid)
          throw Error("Open this professional account's records first.");
        const saved = await vault.saveReceivedReferralDraft(
          snapshot.profileId,
          snapshot.revision,
          fields,
          references,
          id,
          version,
        );
        refresh();
        return vault.data!.referralDrafts!.find((d) => d.id === saved)!;
      }}
    />
  );
}
