import { useEffect, useRef, useState } from "react";
import { allReferralFields, type ReferralFields } from "../referral-draft";
import { referralLabels } from "../referral-document";
import { prepareCompactReview, type ClinicalIdentity, type CompactReview } from "./review";
export function CompactHandoffReview({ patientId, patientName, professionalId, sendingFacilityId, fields, disabled }: {
  patientId: string; patientName: string; professionalId: string; sendingFacilityId: string; fields: ReferralFields; disabled: boolean;
}) {
  const [review, setReview] = useState<CompactReview>(), [sourceVersion, setSourceVersion] = useState("");
  const [included, setIncluded] = useState<readonly string[]>(allReferralFields), [approved, setApproved] = useState(false);
  const [subject, setSubject] = useState<ClinicalIdentity["subject"]>("unknown"), [error, setError] = useState(""), [working, setWorking] = useState(false);
  const generation = useRef(0);
  const version = JSON.stringify([patientId, patientName, professionalId, sendingFacilityId, fields, subject]);
  const current = sourceVersion === version && !disabled;
  useEffect(() => { generation.current++; setApproved(false); setWorking(false); }, [version, disabled]);
  async function prepare(selection: readonly string[] = included) {
    const token = ++generation.current;
    setApproved(false); setError(""); setWorking(true);
    try {
      const identity = review && current ? review.document as unknown as ClinicalIdentity : { patientId, patientName, professionalId, sendingFacilityId, subject, referralId: crypto.randomUUID(), createdAt: new Date().toISOString() };
      // Pick metadata explicitly; never spread a previous selection back into a new one.
      const result = await prepareCompactReview({ patientId: identity.patientId, patientName: identity.patientName, professionalId: identity.professionalId, sendingFacilityId: identity.sendingFacilityId, subject: identity.subject, referralId: identity.referralId, createdAt: identity.createdAt }, fields, selection);
      if (token !== generation.current) return;
      setReview(result); setSourceVersion(version);
    } catch (e) { if (token === generation.current) { setReview(undefined); setError(e instanceof Error ? e.message : "Unable to prepare compact handoff."); } }
    finally { if (token === generation.current) setWorking(false); }
  }
  return <div className="record-form" aria-label="Compact NFC handoff review">
    <label>Handoff subject<select value={subject} disabled={working || disabled} onChange={e => { setSubject(e.target.value as ClinicalIdentity["subject"]); setApproved(false); }}><option value="unknown">Not confirmed</option><option value="mother">Mother</option><option value="baby">Baby</option><option value="both">Mother and baby — identify each value in the entered details</option></select></label>
    <button type="button" className="button secondary" disabled={disabled || working} onClick={() => void prepare()}>Prepare Compact NFC Handoff</button>
    <p className="small">Offline preparation uses your entered text exactly. No clinical abbreviations are approved in dictionary v1. This preview does not create or send a connected referral.</p>
    {error && <p role="alert">{error}</p>}
    {review && !current && <p role="status">Source details changed. Prepare again and review the updated information.</p>}
    {review && current && <>
      <h4>Original information and compact selection</h4>
      <p>Patient: {String(review.document.patientName)} · {String(review.document.patientId)}<br/>Proposed referral: {String(review.document.referralId)}<br/>Prepared: {String(review.document.createdAt)}<br/>Subject: {String(review.document.subject)}<br/>Facility: {String(review.document.sendingFacilityId)} · Professional: {String(review.document.professionalId)}</p>
      <p>Identity and provenance stay included. Select any other omissions yourself. Missing details remain missing and do not prevent approval.</p>
      <table><thead><tr><th>Include</th><th>Original documented information</th><th>Compact handoff</th></tr></thead><tbody>{review.rows.map(row => <tr key={row.key}><td><input type="checkbox" aria-label={`Include ${referralLabels[row.key as keyof typeof referralLabels]}`} checked={row.included} disabled={working} onChange={e => { const next = e.target.checked ? [...included, row.key] : included.filter(k => k !== row.key); setIncluded(next); void prepare(next); }}/></td><td className="preserve-lines"><strong>{referralLabels[row.key as keyof typeof referralLabels]}</strong><br/>{row.original === undefined || row.original === "" ? "Not recorded" : row.original}</td><td className="preserve-lines">{row.included ? row.original === undefined || row.original === "" ? "Not recorded — preserved" : `${row.original}\nExact text; field label encoded` : "Excluded by your selection"}</td></tr>)}</tbody></table>
      <p>Original: {review.sizes.original} bytes · Dictionary: {review.sizes.dictionary} bytes · {review.sizes.compressionApplied ? "Compressed" : "Raw binary"}: {review.sizes.compressed} bytes.<br/>Encrypted size estimate: {review.sizes.finalBytes} bytes, including {review.sizes.encryptionAndFraming + review.sizes.compressionFlag} bytes of encryption/framing/compression metadata.</p>
      <p>Verified tag: 48 bytes. Section A: {review.sizes.sectionA}; transport reservation: {review.sizes.sectionB}; metadata reservation: {review.sizes.sectionC}. Transport events supported: {review.sizes.events}.</p>
      {!review.fits && <p role="status">This selection cannot fit the verified tag allocation. No bytes can be borrowed from transport storage. A larger verified tag is required.</p>}
      <button type="button" className="button secondary" disabled={working || approved} onClick={() => setApproved(true)}>Approve compact selection</button>
      {approved && <p role="status">Selection reviewed for this preview. It is not a sent or saved referral; closing or editing clears this approval.</p>}
      <p>NFC writing remains unavailable for this new format until tag capacity, the bridge protocol and authorized offline section keys are verified. Existing handoff/PDF creation remains available above.</p>
    </>}
  </div>;
}
