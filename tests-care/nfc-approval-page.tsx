import {useState} from "react";
import {createRoot} from "react-dom/client";
import {CompactHandoffReview} from "../src/nfc/compact-review";
import {localSharingDevice} from "../src/sharing-storage";
import {fixtureAuth} from "./nfc-approval-auth";
import "../src/theme.css";
import "../src/styles.css";
const uid="nfc-approval-synthetic-browser-v1";
function Fixture(){
  const [active,setActive]=useState(false),[reason,setReason]=useState("Synthetic exact referral reason."),[error,setError]=useState("");
  return <main className="panel" style={{maxWidth:1000,margin:"1rem auto",padding:"1rem"}}><h1>Local encrypted approval fixture</h1><p>Synthetic account boundary only. Real browser IndexedDB, signing and encryption. No Firebase, BLE or NFC connections.</p>
    {!active?<button className="button primary" onClick={()=>{fixtureAuth.currentUser={uid,isAnonymous:false};setActive(true);}}>Open synthetic account</button>:<>
    <button className="button secondary" onClick={()=>void localSharingDevice(uid).then(()=>setError("Synthetic device key ready.")).catch(e=>setError(String(e)))}>Explicitly prepare synthetic device key</button>
    <label>Source reason<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <CompactHandoffReview patientId="synthetic-approval-case" patientName="Fictional Patient" professionalId={uid} sendingFacilityId="synthetic-facility" fields={{reason,history:"Retain this excluded history in the approved source.",treatment:"",instructions:""}} disabled={false}/>
    </>}{error&&<p role="status">{error}</p>}</main>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
