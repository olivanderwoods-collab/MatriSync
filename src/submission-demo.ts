import type { AddedRecord } from "./record-entry";
// Sole primary Guest clinical fixture, supplied by the user on 7 November 2026.
// Never imported by a backend seeder; no Auth, Firestore, Storage or IndexedDB writes.
export const DEMO_LABEL = "DEMO / NOT FOR CLINICAL USE";
export const demoDoctor = {
  id: "DOC-DEMO-001", name: "Dr. Olivander Woods", gender: "Male", age: 38,
  designation: "Consultant Obstetrician & Gynaecologist", department: "Obstetrics & Gynaecology",
  specialization: "Obstetrics and Maternal Healthcare", experience: "10 years",
  facility: "MatriSync District Hospital", email: "olivander.woods@demo.matrisync.invalid",
  status: "Active", verification: "Not independently verified", affiliation: "MatriSync District Hospital",
  device: "Local workstation", accessRole: "Healthcare Professional",
};
export const demoPatient = {
  id: "MAT-DEMO-001", name: "Ophelia Frost", doctorId: demoDoctor.id, relationship: "Attending obstetrician",
  admissionAt: "2026-11-07T07:50:00+05:30", assignedAt: "2026-11-07T08:05:00+05:30",
  diagnosis: "Primary postpartum haemorrhage due to suspected uterine atony, complicated by haemorrhagic hypovolaemic shock.",
  estimatedBloodLoss: "1,700 mL", status: "Critical — Emergency Referral",
  bloodGroup: "Not recorded", allergies: "Not recorded", antenatalHistory: "Not available", contact: "Not recorded", birthDate: "Not recorded",
};
export type DemoMedication = { id: string; patientId: string; name: string; strength?: string; dose?: string; route: string; frequency?: string; indication: string; prescribedAt: string; administeredAt?: string; initiatedAt?: string; administration?: string; status: string; prescriberId: string; creatorId: string; administeringPerson: null };
const medication = (number: number, data: Omit<DemoMedication,"id"|"patientId"|"prescriberId"|"creatorId"|"administeringPerson">): DemoMedication => ({ id: `MED-DEMO-${String(number).padStart(3,"0")}`, patientId: demoPatient.id, prescriberId: demoDoctor.id, creatorId: demoDoctor.id, administeringPerson: null, ...data });
export const demoMedications = [
  medication(1,{ name:"Iron and Folic Acid tablet",strength:"Elemental iron 60 mg + folic acid 400 micrograms",prescribedAt:"2026-10-30T15:20:00+05:30",route:"Oral",frequency:"Once daily",indication:"Routine antenatal supplementation",status:"Previously prescribed / ongoing at admission",administration:"Not recorded" }),
  medication(2,{ name:"Oxytocin",dose:"10 IU",route:"Intramuscular",frequency:"Single dose",indication:"Prevention of postpartum haemorrhage after delivery",prescribedAt:"2026-11-07T11:40:00+05:30",administeredAt:"2026-11-07T11:42:00+05:30",status:"Administered" }),
  medication(3,{ name:"Oxytocin",dose:"10 IU",route:"Intravenous, under clinical protocol",frequency:"Emergency dose",indication:"Postpartum haemorrhage with suspected uterine atony",prescribedAt:"2026-11-07T11:57:00+05:30",administeredAt:"2026-11-07T11:58:00+05:30",status:"Administered" }),
  medication(4,{ name:"Ringer's Lactate",route:"Intravenous infusion",administration:"Clinician-directed emergency fluid resuscitation; exact volume and rate not specified",indication:"Circulatory support following severe blood loss",prescribedAt:"2026-11-07T11:59:00+05:30",initiatedAt:"2026-11-07T12:01:00+05:30",status:"Infusion initiated" }),
  medication(5,{ name:"Tranexamic Acid",dose:"1 g",route:"Intravenous over 10 minutes",frequency:"Initial emergency dose",indication:"Postpartum haemorrhage",prescribedAt:"2026-11-07T12:02:00+05:30",initiatedAt:"2026-11-07T12:04:00+05:30",status:"Administered" }),
  medication(6,{ name:"Misoprostol",dose:"800 micrograms",route:"Sublingual",frequency:"Single emergency dose",indication:"Continued postpartum haemorrhage despite initial uterotonic treatment",prescribedAt:"2026-11-07T12:10:00+05:30",administeredAt:"2026-11-07T12:12:00+05:30",status:"Administered" }),
];
export const demoBloodRequest = { id:"BLOOD-DEMO-001",patientId:demoPatient.id,requestedBy:demoDoctor.id,requestedAt:"2026-11-07T12:20:00+05:30",product:"Packed Red Blood Cells (PRBC)",bloodGroup:"O Positive",indication:"Severe blood loss with haemorrhagic shock",crossmatchStatus:"Pending",transfusionStatus:"Not administered" };
export const demoTimeline = [
  ["2026-10-30T15:20:00+05:30","Antenatal supplement prescribed"],
  ["2026-11-07T07:50:00+05:30","Patient admitted"],
  ["2026-11-07T08:05:00+05:30","Dr. Olivander Woods assigned"],
  ["2026-11-07T08:15:00+05:30","Admission blood investigations documented"],
  ["2026-11-07T11:40:00+05:30","Female baby delivered"],
  ["2026-11-07T11:42:00+05:30","Prophylactic oxytocin administered"],
  ["2026-11-07T11:50:00+05:30","Placenta delivered"],
  ["2026-11-07T11:55:00+05:30","Heavy postpartum bleeding identified"],
  ["2026-11-07T11:58:00+05:30","Emergency oxytocin administered"],
  ["2026-11-07T12:01:00+05:30","IV fluid resuscitation initiated"],
  ["2026-11-07T12:04:00+05:30","Tranexamic acid initiated"],
  ["2026-11-07T12:12:00+05:30","Misoprostol administered"],
  ["2026-11-07T12:20:00+05:30","Blood product request created"],
  ["2026-11-07T12:25:00+05:30","Emergency blood results documented"],
  ["2026-11-07T12:40:00+05:30","Emergency hospital referral initiated"],
].map(([at,event],i)=>({id:`EVENT-DEMO-${String(i+1).padStart(3,"0")}`,patientId:demoPatient.id,at,event,source:"User-supplied fictional case",actorId:i===0||i===2?demoDoctor.id:null}));
// Existing PDF artifacts concern another synthetic case. No Ophelia report
// files or results have been located; retain references without invented values.
export const demoReports = [
  {id:"REPORT-DEMO-001",name:"Antenatal ultrasound",at:"2026-10-30",availability:"Original report and findings not available"},
  {id:"REPORT-DEMO-002",name:"Admission blood investigations",at:"2026-11-07T08:15:00+05:30",availability:"Original report and results not available"},
  {id:"REPORT-DEMO-003",name:"Emergency blood investigations",at:"2026-11-07T12:25:00+05:30",availability:"Original report and results not available"},
].map(r=>({...r,patientId:demoPatient.id}));
export function submissionDemoCase(additions: AddedRecord[] = []) {
  return structuredClone({ additions, version:1, dataset:"matrisync-submission-demo-2026-11-07",label:DEMO_LABEL,patient:demoPatient,doctor:demoDoctor,medications:demoMedications,bloodRequest:demoBloodRequest,timeline:demoTimeline,reports:demoReports,
    referral:{id:"REF-DEMO-001",patientId:demoPatient.id,doctorId:demoDoctor.id,reason:demoPatient.diagnosis,at:"2026-11-07T12:40:00+05:30",status:"Emergency referral initiated",clinicalApproval:"Not independently recorded",operationalInitiation:"2026-11-07T12:40:00+05:30",receivingFacility:"Not recorded"} });
}
export type SubmissionDemoCase = ReturnType<typeof submissionDemoCase>;
// Essential transfer snapshot, not the full prescription/audit history.
export function compactDemoHandoff(data = submissionDemoCase()) {
  return { format:"matrisync-demo-preview",version:2,dictionaryVersion:0,label:DEMO_LABEL,encrypted:false,physicalNfcWritten:false,
    patient:[data.patient.id,data.patient.name,data.patient.bloodGroup,data.patient.allergies],
    referral:[data.referral.id,data.referral.at,data.referral.receivingFacility],
    summary:data.patient.diagnosis,bloodLoss:data.patient.estimatedBloodLoss,
    medications:data.medications.map(m=>[m.name,m.dose||"Not recorded",m.strength||"",m.route,m.administeredAt||m.initiatedAt||"Not recorded",m.administeredAt?"Given":m.initiatedAt?"Started":"Administration not recorded"]),
    blood:[data.bloodRequest.product,data.bloodRequest.bloodGroup,data.bloodRequest.crossmatchStatus,data.bloodRequest.transfusionStatus],
    reports:"Original results unavailable" };
}
export function demoBriefLines(d = submissionDemoCase()) {
 return [`${d.patient.name} | ${d.patient.id}`,`Referral: ${d.referral.at} | Destination: ${d.referral.receivingFacility}`,d.patient.diagnosis,
 `Blood loss: ${d.patient.estimatedBloodLoss} | Blood group: ${d.patient.bloodGroup} | Allergies: ${d.patient.allergies}`,
 ...d.medications.map(m=>`${m.name}: ${m.dose||"dose not recorded"}${m.strength?"; strength "+m.strength:""}; ${m.route}; ${m.administeredAt?"given "+m.administeredAt:m.initiatedAt?"started "+m.initiatedAt:"administration not recorded"}`),
 `${d.bloodRequest.product} requested (${d.bloodRequest.bloodGroup}); crossmatch ${d.bloodRequest.crossmatchStatus.toLowerCase()}; ${d.bloodRequest.transfusionStatus.toLowerCase()}. Patient group remains unconfirmed.`,
 "Original investigation results unavailable. Additional local records require clinician review before inclusion."];
}
