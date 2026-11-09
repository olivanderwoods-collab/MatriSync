import {useState} from "react";
import {Link} from "react-router-dom";
type Patient={id:string;name:string;birthDate:string};
const patientsKey="matrisync-demo-intake-v1",pairKey="matrisync-demo-pairing-v1";
export function localDemoPatients():Patient[]{return JSON.parse(localStorage.getItem(patientsKey)||"[]");}
export function DemoMotherPairing(){
 const [code,setCode]=useState("");
 return <section className="panel"><h2>Pair with a facility</h2><p>This Guest code works once in the Organization demo on this browser. Signed-in pairing uses an expiring code for the facility you choose.</p><button className="button secondary" onClick={()=>{const value={code:`DEMO-${crypto.randomUUID()}`,expires:Date.now()+1800000};localStorage.setItem(pairKey,JSON.stringify(value));setCode(value.code);}}>Generate pairing code</button>{code&&<p className="record-id">{code} · Expires in 30 minutes</p>}</section>;
}
export function DemoIntake(){
 const [mode,setMode]=useState(""),[patients,setPatients]=useState(localDemoPatients),[message,setMessage]=useState("");
 return <section className="panel"><h2>Add patient</h2><div className="action-row"><button className="button secondary" onClick={()=>setMode("manual")}>Add patient manually</button><button className="button secondary" onClick={()=>setMode("pair")}>Load with Mother's pairing code</button><button className="button secondary" onClick={()=>setMode("nfc")}>Connect MatriSync Device / Scan NFC</button></div>
 {mode==="manual"&&<form className="record-form" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget),patient={id:`LOCAL-${crypto.randomUUID()}`,name:String(form.get("name")).trim(),birthDate:String(form.get("birthDate"))};if(!patient.name)return;const next=[...localDemoPatients(),patient];localStorage.setItem(patientsKey,JSON.stringify(next));setPatients(next);setMode("");setMessage("Patient saved in this browser's Guest workspace.");}}><label>Mother name<input name="name" required maxLength={120}/></label><label>Date of birth<input name="birthDate" type="date"/></label><button className="button primary">Register patient</button><p>Fictional details only. Guest profiles remain on this browser.</p></form>}
 {mode==="pair"&&<form className="record-form" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget),saved=JSON.parse(localStorage.getItem(pairKey)||"null");if(!saved||saved.code!==String(form.get("code")).trim()||saved.expires<=Date.now()){setMessage("Use an unused, current pairing code from the Mother demo on this browser.");return;}localStorage.removeItem(pairKey);setMessage("Ophelia Frost's profile loaded. Open her profile below.");setMode("");}}><label>Mother-generated pairing code<input name="code" required autoComplete="off"/></label><button className="button primary">Load paired profile</button></form>}
 {mode==="nfc"&&<p>Encrypted device receipts require your invited facility account. <Link to="/auth/login?role=organization">Sign in to connect the MatriSync Device</Link>. The existing bridge still needs protocol integration; no NFC scan is simulated here.</p>}
 {message&&<p role="status">{message}</p>}{patients.map(p=><p key={p.id}><Link to={`/organization/patients/${p.id}/overview`}>{p.name}</Link> · {p.id}</p>)}</section>;
}
export function DemoBasicPatient({id,role,section}:{id:string;role:string;section:string}){
 const p=localDemoPatients().find(p=>p.id===id);
 if(!p)return <p>Patient not found on this browser.</p>;
 return <><h1>{p.name}</h1><nav className="tabs"><Link to={`/${role}/patients/${id}/overview`}>Profile</Link><Link to={`/${role}/patients/${id}/referrals`}>Referral Handoff</Link></nav><section className="panel">{section==="referrals"?<><h2>Referral Handoff</h2><p>No handoff has been received for this patient.</p></>:<><h2>Patient profile</h2><p>{p.id}</p><p>Date of birth: {p.birthDate||"Not recorded"}</p><p>No clinical records entered. This profile is stored locally in the Guest workspace.</p></>}</section></>;
}
