// Local component acceptance only; excluded from the production entry/build.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CompactHandoffReview } from "../src/nfc/compact-review";
import "../src/theme.css";
import "../src/styles.css";
function Fixture() {
  const [reason, setReason] = useState("Clinician-entered synthetic transfer reason."), [disabled, setDisabled] = useState(false);
  return <main className="panel" style={{maxWidth:1000,margin:"1rem auto",padding:"1rem"}}>
    <h1>Synthetic NFC review acceptance</h1><p>Component-only fixture. No account, cloud, BLE, NFC or patient records are connected.</p>
    <label>Source referral reason<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <label><input type="checkbox" checked={disabled} onChange={e=>setDisabled(e.target.checked)}/>Lock source as pending approval</label>
    <CompactHandoffReview patientId="SYN-P001" patientName="Fictional Patient" professionalId="SYN-D1" sendingFacilityId="SYN-F1" fields={{reason,history:"History retained in full case only if excluded here.",treatment:"",instructions:"",allergies:"Not recorded",drugsGiven:"Synthetic recorded medicine details — copied exactly."}} disabled={disabled}/>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
