import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { addDemoRecord, demoRecords, demoRecordFile } from "./demo-records";
import { checkManualRecord } from "./record-entry";
import { RecordVault } from "./record-vault";
import { readVault } from "./vault-storage";
import { compactDemoHandoff, demoBriefLines, submissionDemoCase } from "./submission-demo";
import { demoHandoffLines, demoHandoffHtml, demoHandoffPdf } from "./submission-document";
const manual={title:"Copied medication",dose:"",route:"",administeredAt:"",notes:"Exact supplied text à¦¬à¦¾à¦‚à¦²à¦¾ <script>never execute</script>"};
it("saves guest records and exact original files separately from the source fixture",async()=>{
 const original=submissionDemoCase();
 const r=await addDemoRecord("prescriptions",{manual,source:"Source as supplied",date:"2026-11-09"},"Mother");
 expect((await demoRecords()).find(x=>x.id===r.id)?.manual).toEqual(manual);
 const file=new File(["%PDF-1.7\nSynthetic file"],"test.pdf",{type:"application/pdf"});
 const upload=await addDemoRecord("reports",{file,source:"",date:""},"Doctor");
 expect(await (await demoRecordFile(upload.id))!.text()).toBe(await file.text());
 expect(submissionDemoCase()).toEqual(original);
 const pdfText=demoHandoffLines(submissionDemoCase(await demoRecords())).join("\n");
 expect(pdfText).toContain(manual.notes);expect(pdfText).toContain("test.pdf");expect(pdfText).not.toContain("Synthetic file");
});
it("rejects invalid uploads and field sizes without losing previous records",async()=>{
 const old=await demoRecords();
 await expect(addDemoRecord("reports",{file:new File(["not a pdf"],"bad.pdf",{type:"application/pdf"}),source:"",date:""},"Mother")).rejects.toThrow("content must match");
 expect(await demoRecords()).toEqual(old);
 expect(()=>checkManualRecord({...manual,title:""})).toThrow();expect(()=>checkManualRecord({...manual,notes:"x".repeat(8001)})).toThrow();
});
it("keeps copied manual records encrypted, readable after reload and isolated by workspace",async()=>{
 const uid=crypto.randomUUID(), mother=new RecordVault(uid,async()=>{},"mother");await mother.openOnDevice();await mother.savePatient({name:"Synthetic Mother",birthDate:"",history:""},"self");
 await mother.addManualDocument("self","prescriptions",manual,"Copied source","");const id=mother.data!.documents[0].id;
 expect(JSON.stringify(await readVault(uid))).not.toContain(manual.notes);mother.lock();await mother.openOnDevice();
 expect(mother.data!.documents[0].manual).toEqual(manual);expect(new TextDecoder().decode((await mother.document(id)).bytes)).toContain(manual.notes);
 const professional=new RecordVault(uid,async()=>{},"professional");await professional.openOnDevice();
 await expect(professional.addManualDocument("self","prescriptions",manual,"","")).rejects.toThrow();
 await expect(professional.document(id)).rejects.toThrow();
});
it("separates the concise transfer from complete content-first PDF history",()=>{
 const d=submissionDemoCase(),packet=compactDemoHandoff(d),text=JSON.stringify(packet),lines=demoHandoffLines(d);
 expect(text).not.toContain("prescribedAt");expect(text).not.toContain("timeline");expect(packet.medications).toHaveLength(6);expect(text).toContain("Pending");
 expect(demoBriefLines(d).join("\n")).not.toContain(d.medications[0].prescribedAt);
 expect(lines.indexOf("REPORTS AND INVESTIGATIONS")).toBeLessThan(lines.indexOf("PRESCRIPTION HISTORY AND ATTRIBUTION"));
 for(const m of d.medications)expect(lines.join("\n")).toContain(m.prescribedAt);
 d.patient.name="<script>attack</script>";expect(demoHandoffHtml(d,true)).toContain("&lt;script&gt;");expect(demoHandoffHtml(d,true)).not.toContain("<script>attack");
});

it("exports multiline copied records without flattening lines or omitting content",()=>{
 const d=submissionDemoCase([{id:"test",kind:"reports",title:"Copied report",source:"Test source",date:"",addedAt:"2026-11-09",enteredBy:"Test user",manual:{...manual,notes:"First line\nSecond line"}}]);
 const pdf=new TextDecoder().decode(demoHandoffPdf(d));expect(pdf).toContain("(First line)");expect(pdf).toContain("(Second line)");
});
