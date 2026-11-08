import { useEffect, useState } from "react";
import type { ReferralDraft } from "./referral-draft";
import {
  checkReferralApproval,
  referralApprovalId,
  type ReferralApproval,
} from "./referral-approval";
import { approveReferralVersion } from "./sharing-referral-approval";
import {
  approvedReferralDocumentHtml,
  downloadReferralDocument,
  printReferralDocument,
} from "./referral-document";
import { sharingAccount } from "./sharing-client";
import { useRecords } from "./records";
import { SendApprovedReferral } from "./referral-delivery-panel";

export function ReferralReview({
  uid,
  draft,
  versionId,
}: {
  uid: string;
  draft: ReferralDraft;
  versionId: string;
}) {
  const { vault, refresh } = useRecords();
  const cached = vault?.data?.referralApprovals?.find(
    (a) => a.id === referralApprovalId(draft, versionId),
  );
  const [reviewed, setReviewed] = useState(false),
    [approval, setApproval] = useState<ReferralApproval>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    if (cached)
      void (async () => {
        await sharingAccount(uid);
        await checkReferralApproval(draft, versionId, cached);
        await sharingAccount(uid);
        if (live) setApproval(cached);
      })().catch((e) => {
        if (live)
          setError(
            e instanceof Error
              ? e.message
              : "The saved approval could not be checked.",
          );
      });
    return () => {
      live = false;
    };
  }, [cached, draft, versionId, uid]);
  async function rememberApproval() {
    if (!vault || vault.uid !== uid)
      throw Error("Open this professional account's records first.");
    const saved = await vault.cacheReferralApproval(draft.id, versionId);
    if (saved) {
      setApproval(saved);
      refresh();
    }
    return saved;
  }
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await sharingAccount(uid);
      await work();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Approval could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function exportApproved(print: boolean) {
    if (!approval) return;
    const html = await approvedReferralDocumentHtml(draft, versionId, approval);
    await sharingAccount(uid);
    if (print) await printReferralDocument(html);
    else downloadReferralDocument(html, true);
    setNotice(
      "Approved copy requested. The copy is outside the encrypted vault; it does not initiate or send a referral.",
    );
  }
  return (
    <section className="panel" aria-label="Doctor review">
      <h3>Doctor review of this version</h3>
      <p>
        Review the saved facts and referenced originals above. Approval is
        recorded only for this version. Facility initiation and sending remain
        separate.
      </p>
      <button
        className="button secondary"
        disabled={busy}
        onClick={() =>
          void act(async () => {
            const saved = await rememberApproval();
            setNotice(
              saved
                ? "The exact saved version's approval was confirmed."
                : "No server approval was found for this version. Any previously saved receipt is preserved.",
            );
          })
        }
      >
        Check saved approval
      </button>
      {!approval ? (
        <>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={busy}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            I have reviewed this exact saved version and its source references.
          </label>
          <button
            className="button secondary"
            disabled={busy || !reviewed}
            onClick={() =>
              void act(async () => {
                const saved = await approveReferralVersion(
                  uid,
                  draft,
                  versionId,
                );
                setApproval(saved);
                try {
                  await rememberApproval();
                } catch {
                  throw Error(
                    "Doctor approval was recorded, but its offline copy could not be saved. Check saved approval to retry.",
                  );
                }
                setNotice(
                  "Doctor approval recorded for this version. Nothing was initiated or sent.",
                );
              })
            }
          >
            Approve this version
          </button>
          <p className="small">
            Online verification of an active facility-approved doctor credential
            is required. Caregiver credentials cannot approve a referral.
          </p>
        </>
      ) : (
        <>
          <p>Doctor approval recorded · Delivery status recorded separately</p>
          <p>Approved on {new Date(approval.createdAt).toLocaleString()}</p>
          <p className="record-id">Approved by account: {approval.doctorUid}</p>
          <div className="action-row">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void act(() => exportApproved(false))}
            >
              Download approved copy
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void act(() => exportApproved(true))}
            >
              Print approved copy / Save as PDF
            </button>
          </div>
          <p className="small">
            This is a historical approval of these contents. It does not confirm
            current credentials or a current sharing grant.
          </p>
          <SendApprovedReferral
            uid={uid}
            draft={draft}
            versionId={versionId}
            facilityUid={approval.facilityUid}
          />
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
