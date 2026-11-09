import {useEffect,useRef,useState} from "react";
import {AddRecord} from "./record-entry-form";
import {approveMotherRecord,listMotherRecords,submitMotherRecord,type ReviewableRecord} from "./care-intake";
import {careHash} from "./care-crypto";
import {useRecords} from "./records";
import type {CareView} from "./care-model";
import type {AddedRecord,RecordInput,RecordKind} from "./record-entry";
export function CareRecordReview({uid,view,mother,doctor,onlyKind}:{uid:string;view:CareView;mother:boolean;doctor:boolean;onlyKind?:RecordKind}){
 const {vault,refresh}=useRecords(),[records,setRecords]=useState<ReviewableRecord[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false),[checked,setChecked]=useState<Record<string,boolean>>({});
 const pending=useRef<{fingerprint:string;record:AddedRecord;digest?:string}|undefined>(undefined);
 async function reload(){setRecords(await listMotherRecords(uid,view));}
 useEffect(()=>{let live=true;setRecords([]);listMotherRecords(uid,view).then(r=>{if(live)setRecords(r);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[uid,view]);
 async function add(kind:RecordKind,input:RecordInput){
  if(!vault)throw Error("Open your local record vault first.");
  const fingerprint=JSON.stringify([view.id,kind,input.manual,input.source,input.date,input.file?.name,input.file?.size,input.file?.lastModified]);
  if(!pending.current||pending.current.fingerprint!==fingerprint){
   await vault.openOnDevice();if(!vault.data?.patients.some(p=>p.id==="self"))await vault.savePatient({name:view.profile.name,birthDate:view.profile.birthDate,history:""},"self");
   if(input.manual)await vault.addManualDocument("self",kind,input.manual,input.source,input.date);else await vault.addDocument("self",kind,input.file!,input.source,input.date);
   const local=vault.data!.documents.at(-1)!;
   pending.current={fingerprint,record:{id:local.id,kind,title:input.manual?.title||input.file!.name,source:input.source,date:input.date,addedAt:local.addedAt,enteredBy:uid,...(input.manual?{manual:input.manual}:{fileName:input.file!.name})},...(input.file?{digest:await careHash(new Uint8Array(await input.file.arrayBuffer()))}:{})};refresh();
  }
  await submitMotherRecord(uid,view,pending.current.record,pending.current.digest);pending.current=undefined;await reload();
 }
 return <section className="panel"><h3>{mother?"My prescriptions and reports":"Mother-submitted records for review"}</h3>
 {mother&&<><p>Entered details are shared encrypted with your paired care team. Original PDFs and photos stay on this device. Submitted copies cannot be edited or deleted; the Doctor's approval is permanent.</p>{(onlyKind?[onlyKind]:["prescriptions","reports"] as RecordKind[]).map(kind=><div key={kind}><h4>Add {kind==="reports"?"report":"prescription copy"}</h4><AddRecord kind={kind} onSave={input=>add(kind,input)}/></div>)}</>}
 {!records.length&&<p>No submitted copies available.</p>}
 {records.filter(r=>!onlyKind||r.record.kind===onlyKind).map(r=><article className="local-document" key={r.id}><div><h4>{r.record.title}</h4>{r.record.manual&&<><p>Dose: {r.record.manual.dose||"Not recorded"} · Timing: {r.record.manual.administeredAt||"Not recorded"}</p>{!mother&&<p>Route: {r.record.manual.route||"Not recorded"}</p>}{(!mother||r.record.kind==="reports")&&<p className="preserve-lines">{r.record.manual.notes}</p>}</>}{r.record.fileName&&<p>Original: {r.record.fileName} · Stored on the Mother's device</p>}<p>{r.approved?`Approved by ${r.approved.reviewerName} on ${r.approved.approvedAt} · Read only`:"Awaiting Doctor review"}</p>
 {doctor&&!r.approved&&<><label className="check-row"><input type="checkbox" checked={!!checked[r.id]} onChange={e=>setChecked({...checked,[r.id]:e.target.checked})}/>I reviewed the original separately and approve this exact submitted copy.</label><button className="button secondary" disabled={busy||!checked[r.id]} onClick={()=>void(async()=>{setBusy(true);setError("");try{await approveMotherRecord(uid,view.id,r.id,!!checked[r.id]);await reload();}catch(e){setError(e instanceof Error?e.message:"Approval failed");}finally{setBusy(false);}})()}>Approve record</button></>}
 {!mother&&<p className="small">Submitted {r.createdAt} · Account {r.ownerUid} · Document date: {r.record.date||"Not recorded"} · Source: {r.record.source||"Not recorded"}</p>}</div></article>)}{error&&<p role="alert">{error}</p>}
 </section>;
}
