import { DEMO_LABEL, submissionDemoCase, type SubmissionDemoCase } from "./submission-demo";
export function demoHandoffLines(d: SubmissionDemoCase) {
  return [DEMO_LABEL, `${d.patient.name} | ${d.patient.id}`, `${d.doctor.name} | ${d.doctor.id}`, d.doctor.facility,
    `Professional verification: ${d.doctor.verification}`,`Admission: ${d.patient.admissionAt}`,`Doctor assigned: ${d.patient.assignedAt}`,
    `Blood group: ${d.patient.bloodGroup}`,`Allergies: ${d.patient.allergies}`,`History: ${d.patient.antenatalHistory}`,
    `Diagnosis: ${d.patient.diagnosis}`,`Estimated blood loss: ${d.patient.estimatedBloodLoss}`,`Current status: ${d.patient.status}`,
    `Referral: ${d.referral.id} | ${d.referral.at}`,`Reason: ${d.referral.reason}`,`Status: ${d.referral.status}`,
    `Clinical approval: ${d.referral.clinicalApproval}`,`Facility operational initiation: ${d.referral.operationalInitiation}`,`Receiving facility: ${d.referral.receivingFacility}`,
    "", "AVAILABLE INVESTIGATION REFERENCES", ...d.reports.map(r=>`${r.name} | ${r.at} | ${r.availability}`),
    "", "MEDICATION HISTORY - USER-SUPPLIED FICTIONAL RECORDS",
    ...d.medications.flatMap(m=>[`${m.id} | ${m.name}`,`Strength/dose: ${m.strength||m.dose||"Not recorded"} | Route: ${m.route}`,`Frequency: ${m.frequency||"Not recorded"} | Indication: ${m.indication}`,`Prescribed: ${m.prescribedAt} | Prescriber/creator: ${m.prescriberId}`,`Administered: ${m.administeredAt||"Not recorded"} | Initiated: ${m.initiatedAt||"Not recorded"}`,`Administering person: Not recorded | Status: ${m.status}`, ...(m.administration?[m.administration]:[]), ""]),
    "SEPARATE BLOOD PRODUCT REQUEST",`${d.bloodRequest.id} | ${d.bloodRequest.product} | Requested group: ${d.bloodRequest.bloodGroup}`,`Requested by ${d.bloodRequest.requestedBy} at ${d.bloodRequest.requestedAt}`,`Indication: ${d.bloodRequest.indication}`,`Crossmatch: ${d.bloodRequest.crossmatchStatus} | Transfusion: ${d.bloodRequest.transfusionStatus}`,
    "Requested product group is not evidence of the patient's confirmed blood group.","", "CLINICAL DEMO TIMELINE",...d.timeline.map(e=>`${e.at} | ${e.event}`),
    "", "No real clinical approval, delivery, NFC programming or receiving-team acceptance is asserted. These user-supplied fictional doses are not treatment recommendations or prescribing defaults."];
}
const escape = (s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]!);
export function demoHandoffHtml(data = submissionDemoCase()) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>MatriSync demo handoff</title><style>@page{size:A4;margin:16mm}body{font:12px/1.5 Arial;color:#173d31;padding:20px}h1{border-bottom:2px solid #168263;padding-bottom:10px}p{white-space:pre-wrap;overflow-wrap:anywhere}footer{border-top:1px solid #168263}@media print{body{padding:0}}</style></head><body><h1>MatriSync · Clinical handoff</h1>${demoHandoffLines(data).map(l=>`<p>${escape(l)||"&nbsp;"}</p>`).join("")}<footer>${DEMO_LABEL}</footer></body></html>`;
}
// Small, dependency-free PDF exporter for this ASCII clinical demonstration.
// Unsupported characters are rejected, never silently removed from records.
export function demoHandoffPdf(data = submissionDemoCase()) {
  const lines=demoHandoffLines(data).flatMap(line=>{
    const normalized=line.replace(/[—–]/g,"-").replace(/[’‘]/g,"'");
    if (/[^\x20-\x7e]/.test(normalized)) throw Error("This PDF exporter cannot preserve a character in this record. Use Print / Save PDF instead.");
    return normalized.match(/.{1,92}(?:\s|$)|\S{1,92}/g)?.map(s=>s.trimEnd())||[""];
  });
  const linesPerPage=52; // Final baseline stays above the footer on A4.
  const pages=Array.from({length:Math.ceil(lines.length/linesPerPage)},(_,i)=>lines.slice(i*linesPerPage,(i+1)*linesPerPage));
  const quote=(s:string)=>s.replace(/([\\()])/g,"\\$1");
  const objects:string[]=["<< /Type /Catalog /Pages 2 0 R >>",`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${4+i*2} 0 R`).join(" ")}] >>`,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  pages.forEach((page,i)=>{
    const stream=`BT /F1 16 Tf 42 795 Td (MatriSync - Clinical handoff) Tj /F1 10 Tf 0 -26 Td 14 TL ${page.map((line,j)=>`${j?"T* ":""}(${quote(line)}) Tj`).join("\n")} ET\nBT /F1 8 Tf 42 28 Td (${DEMO_LABEL} - Page ${i+1} of ${pages.length}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let pdf="%PDF-1.4\n"; const offsets=[0];
  objects.forEach((object,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=pdf.length;
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
export function downloadDemo(bytes: Uint8Array<ArrayBuffer>, name: string, type: string) {
  const url=URL.createObjectURL(new Blob([bytes],{type}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
