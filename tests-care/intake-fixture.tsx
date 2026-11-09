import {createRoot} from "react-dom/client";
import {useState} from "react";
import {MemoryRouter} from "react-router-dom";
import {createUserWithEmailAndPassword,signInWithEmailAndPassword} from "firebase/auth";
import {accountAuth} from "../src/auth";
import {assignCareStaff,enrollCareDevice,grantCareProfile,loadCareProfile,motherLoginEmail,registerCareProfile} from "../src/care-client";
import {CareRecordReview} from "../src/care-records-panel";
import {RecordsProvider,MotherLocalCopies} from "../src/records";
import type {CareView} from "../src/care-model";
import "../src/styles.css";
if(location.hostname!=="127.0.0.1"||import.meta.env.VITE_FIREBASE_PROJECT_ID!=="demo-matrisync"||import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL!=="http://127.0.0.1:9099")throw Error("Local emulator fixture only");
const auth=await accountAuth(), password="Local-synthetic-only-42!",run=crypto.randomUUID();
const people:Record<string,{uid:string;email:string;password:string}>={};
for(const name of ["facility","doctor"]){const email=`intake-ui-${name}-${run}@example.test`,result=await createUserWithEmailAndPassword(auth,email,password);people[name]={uid:result.user.uid,email,password};await enrollCareDevice(result.user.uid);}
const operatorUrl=`http://127.0.0.1:8086/v1/projects/demo-matrisync/databases/(default)/documents/careFacilities/${people.facility.uid}`;
if(!(await fetch(operatorUrl,{method:"PATCH",headers:{Authorization:"Bearer owner","Content-Type":"application/json"},body:JSON.stringify({fields:{name:{stringValue:"Synthetic UI facility"},enabled:{booleanValue:true}}})})).ok)throw Error("Fixture seed failed");
await signInWithEmailAndPassword(auth,people.facility.email,password);
await assignCareStaff(people.facility.uid,people.doctor.uid,"Synthetic UI Doctor","doctor",true);
const patient=await registerCareProfile(people.facility.uid,{name:"Synthetic UI Mother",birthDate:"",sourceLocalId:crypto.randomUUID(),sourceUid:people.facility.uid},true);
await grantCareProfile(people.facility.uid,patient.view,people.doctor.uid);
people.mother={uid:patient.view.motherUid!,email:motherLoginEmail(patient.id),password:patient.code};
await signInWithEmailAndPassword(auth,people.mother.email,patient.code);
const initial=await loadCareProfile(people.mother.uid,patient.id,patient.code);
function Fixture(){const [role,setRole]=useState("mother"),[view,setView]=useState<CareView>(initial),[error,setError]=useState("");return <MemoryRouter><main className="workspace-main"><h1>Isolated record review acceptance</h1><p>Synthetic local Auth/Firestore accounts. No production calls.</p><label>Test actor<select value={role} onChange={e=>{const next=e.target.value;void(async()=>{try{await signInWithEmailAndPassword(auth,people[next].email,people[next].password);const loaded=await loadCareProfile(people[next].uid,patient.id,next==="mother"?patient.code:undefined);setView(loaded);setRole(next);}catch(e){setError(String(e));}})();}}><option value="mother">Mother</option><option value="doctor">Doctor</option></select></label><RecordsProvider key={role} uid={people[role].uid} workspace={role==="mother"?"mother":"professional"}><CareRecordReview uid={people[role].uid} view={view} mother={role==="mother"} doctor={role==="doctor"} onlyKind="prescriptions"/>{role==="mother"&&<MotherLocalCopies kind="prescriptions"/>}</RecordsProvider>{error&&<p role="alert">{error}</p>}</main></MemoryRouter>}
createRoot(document.getElementById("root")!).render(<Fixture/>);
