import {
  decryptSharedTransfer,
  decodeFile,
  type SharingDevice,
  type SharedDocument,
} from "./sharing-crypto";
import { contentDigest, type ReceivedProfile } from "./sharing-profile";
import { transfersForWorkspace, type SavedTransfer } from "./sharing-storage";

export type OpenedSharedRecords = {
  profiles: ReceivedProfile[];
  documents: { sourceUid: string; document: SharedDocument; sha256: string }[];
};
// Pure decoder: UI callers must confirm current Auth before and after this work.
// The authenticated receiver recorded recipientRole when delivery was verified.
export async function readSharedInbox(
  uid: string,
  role: string,
  saved: SavedTransfer[],
  device: SharingDevice,
): Promise<OpenedSharedRecords> {
  const result: OpenedSharedRecords = { profiles: [], documents: [] };
  for (const item of transfersForWorkspace(saved, uid, role)) {
    const content = await decryptSharedTransfer(
      item.ciphertext,
      item,
      device,
      item.sender,
    );
    if (content.kind === "profile")
      result.profiles.push({
        snapshot: content.profile,
        savedAt: item.savedAt,
        transferId: item.id,
      });
    else
      result.documents.push({
        sourceUid: item.senderUid,
        document: content.document,
        sha256: await contentDigest(decodeFile(content.document.bytes)),
      });
  }
  return result;
}
