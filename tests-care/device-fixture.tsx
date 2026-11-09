import {createRoot} from "react-dom/client";
import {useState} from "react";
import {MemoryRouter} from "react-router-dom";
import {createUserWithEmailAndPassword} from "firebase/auth";
import {accountAuth} from "../src/auth";
import {enrollCareDevice} from "../src/care-client";
import {existingSharingDevice} from "../src/sharing-storage";
import {CarePage} from "../src/care-page";
import {RecordsProvider} from "../src/records";
import "../src/styles.css";

if(location.hostname!=="127.0.0.1"||import.meta.env.VITE_FIREBASE_PROJECT_ID!=="demo-matrisync"||import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL!=="http://127.0.0.1:9099")throw Error("Local emulator fixture only");
const auth=await accountAuth();
const {user}=await createUserWithEmailAndPassword(auth,`device-ui-${crypto.randomUUID()}@example.test`,"Local-synthetic-only-42!");
const original=await enrollCareDevice(user.uid);
// Only this newly generated synthetic account can be changed by the fixture.
async function attachOriginal(attach:boolean){
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open("matrisync-sharing-pilot-v1",1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction("devices","readwrite"),store=tx.objectStore("devices");if(attach)store.put(original,user.uid);else store.delete(user.uid);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error);};});
}
function Fixture(){
  const [evidence,setEvidence]=useState("Original synthetic key attached"),[revision,setRevision]=useState(0);
  async function change(attach:boolean){await attachOriginal(attach);setEvidence(attach?"Original synthetic key attached":"Synthetic key detached; retained in fixture memory only");setRevision(n=>n+1);}
  return <MemoryRouter><main className="workspace-main"><h1>Isolated device acceptance</h1><p>Real local Auth/Firestore; no network mocks. No production accounts or data. Test controls are excluded from the application build.</p>
    <button onClick={()=>void change(false)}>Detach synthetic test key</button>{" "}
    <button onClick={()=>void change(true)}>Reattach original test key</button>{" "}
    <button onClick={()=>void existingSharingDevice(user.uid).then(key=>setEvidence(key?`Local identity: ${key.keyId===original.keyId?"original":"different"}`:"Local identity: absent"))}>Inspect local test identity</button>
    <p role="status" aria-label="Test identity evidence">{evidence}</p>
    <RecordsProvider uid={user.uid} workspace="professional"><CarePage key={revision} uid={user.uid} role="professional"/></RecordsProvider>
  </main></MemoryRouter>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
