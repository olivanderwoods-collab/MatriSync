import type {CareEntry} from "./care-model";
const marker="MATRISYNC-MEDICATION-1\n";
export type MedicationSchedule={name:string;dose:string;route:string;timing:string;from:string;until:string};
export function medicationText(value:MedicationSchedule){
 if(!value.name.trim()||Object.values(value).some(v=>typeof v!=="string"||v.length>200))throw Error("Enter a medication name and keep each detail within 200 characters.");
 return marker+JSON.stringify(value);
}
export function medicationSchedule(text:string):MedicationSchedule|undefined{
 if(!text.startsWith(marker))return;
 try{const v=JSON.parse(text.slice(marker.length));if(Object.keys(v).sort().join()!=="dose,from,name,route,timing,until")return;medicationText(v);return v;}catch{return;}
}
export function medicationDisplay(text:string){const value=medicationSchedule(text);return value?Object.entries(value).map(([key,value])=>`${key}: ${value||"Not recorded"}`).join("\n"):text;}
export function MotherCareRecords({entries,section}:{entries:CareEntry[];section?:string}){
 const prescriptions=entries.filter(e=>e.kind==="prescription");
 return <>{section!=="reports"&&<section className="panel"><h3>My medications</h3>{prescriptions.map(e=>{const m=medicationSchedule(e.text);return <article key={e.id} className="local-document"><div><h4>{m?.name||"Prescription recorded by your Doctor"}</h4>{m?<><p>Dose: {m.dose||"Not recorded"} · Timing: {m.timing||"Not recorded"}</p><p>Route: {m.route||"Not recorded"}</p></>:<p>A medication schedule has not been entered separately. Ask your care team for the directions.</p>}</div></article>})}{!prescriptions.length&&<p>No medication schedule recorded.</p>}</section>}
 {section!=="prescriptions"&&<section className="panel"><h3>My reports</h3>{entries.filter(e=>e.kind==="laboratory").map(e=><article key={e.id}><p className="preserve-lines">{e.text}</p></article>)}</section>}
 {section!=="reports"&&<section className="panel"><h3>Medication history</h3>{prescriptions.map(e=>{const m=medicationSchedule(e.text);return m&&<p key={e.id}>{m.name} · From {m.from||"Not recorded"} · Until {m.until||"Not recorded"}</p>})}</section>}</>;
}
