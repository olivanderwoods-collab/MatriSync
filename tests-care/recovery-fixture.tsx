import { createRoot } from "react-dom/client";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { CarePage } from "../src/care-page";
import { fixture, seed } from "./recovery-mocks";
import {readCareDraft,readPendingCareHandoff} from "../src/care-storage";
import {careHash} from "../src/care-crypto";
import {unbase64} from "../src/vault-crypto";
import "../src/styles.css";
function Fixture() {
  const [uid, setUid] = useState(fixture.uid);
  const [evidence,setEvidence]=useState("");
  async function inspect(){
    const rows=await Promise.all(["patient-a","patient-b"].map(async id=>{const pending=await readPendingCareHandoff(uid,id),draft=await readCareDraft(uid,id);return {patient:id,operation:pending?{id:pending.handoff.id,status:pending.status,recordedAt:pending.handoff.recordedAt,reason:pending.handoff.fields.reason,packetHash:await careHash(unbase64(pending.handoff.packet))}:null,draft:draft?{revision:draft.revision,cleared:!!draft.cleared,reason:draft.fields.reason}:null};}));
    setEvidence(JSON.stringify({account:uid,explicitCreations:fixture.creates,patients:rows},null,2));
  }
  return <MemoryRouter><main><p>ISOLATED UI TEST · Synthetic data · No Firebase calls</p><label>Fixture account<select value={uid} onChange={e => { fixture.uid = e.target.value; setUid(e.target.value);setEvidence(""); }}><option value="isolated-recovery-doctor">Synthetic Doctor</option><option value="isolated-recovery-other">Other account</option></select></label><button onClick={()=>void inspect()}>Inspect saved test state</button>{evidence&&<pre aria-label="Saved test evidence">{evidence}</pre>}<CarePage uid={uid} role="professional" /></main></MemoryRouter>;
}
await seed();
createRoot(document.getElementById("root")!).render(<Fixture />);
