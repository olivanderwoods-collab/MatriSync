import { useState } from "react";
import { useRecords } from "./records";
import { patientSummary } from "./patient-summary";
import { printReferralDocument } from "./referral-document";
export function PatientSummaryPanel() {
  const { vault } = useRecords();
  const [html, setHtml] = useState(""), [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <section className="panel" aria-label="Personal care summary">
    <h2>Your care summary</h2><p>Create a readable summary of your saved profile and uploaded document list for your care team. Clinical approval and the encrypted referral handoff remain separate.</p>
    <button className="button secondary" disabled={busy} onClick={async () => {
      setBusy(true); setError(""); setHtml("");
      try {
        if (!vault || !(await vault.openOnDevice())) throw Error("Open your existing records first.");
        const patient = vault?.data?.patients.find(p => p.id === "self");
        if (!patient) throw Error("Save your Mother profile before creating a summary.");
        setHtml(patientSummary(patient, vault!.data!.documents.filter(d => d.patientId === "self"), new Date().toISOString()));
      } catch (e) { setError(e instanceof Error ? e.message : "Cannot create summary."); }
      finally { setBusy(false); }
    }}>Create care summary</button>
    {html && <>
      <iframe title="Personal care summary preview" sandbox="" srcDoc={html} style={{ width: "100%", height: 480, border: "1px solid #adc7bc", marginTop: 16 }} />
      <button className="button primary" onClick={() => void printReferralDocument(html).catch(e => setError(String(e)))}>Print / Save PDF</button>
      <p className="small">Choose Save as PDF in the print dialog. This is a snapshot; regenerate it after editing your profile.</p>
    </>}{error && <p role="alert">{error}</p>}
  </section>;
}
