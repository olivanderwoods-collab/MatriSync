import { submissionDemoCase } from "../submission-demo";
import { safetyCheck } from "./safety";
// Deterministic navigation/read-back, never represented as model inference.
export function scriptedCompanion(input:string,demo:boolean):string|undefined {
  const text=input.trim().toLowerCase().replace(/[.!?]+$/g,"");
  const safety=safetyCheck(input);
  if (safety && ["self-harm","danger","crisis","maternal","child"].includes(safety.kind)) return safety.text;
  if (demo) {
    const d=submissionDemoCase();
    const facts:Record<string,string>={
      "what is my name":`The fictional demo patient's name is ${d.patient.name}, ID ${d.patient.id}.`,
      "who is my doctor":`The recorded demo doctor is ${d.doctor.name}, ${d.doctor.id}. Verification: ${d.doctor.verification}.`,
      "what is my blood group":`Patient blood group: ${d.patient.bloodGroup}. The blood product request does not establish the patient's blood group.`,
      "what are my allergies":`Allergies: ${d.patient.allergies}. This does not mean there are no allergies.`,
      "show my profile":`${d.patient.name}, ${d.patient.id}. Stage: postpartum. Doctor: ${d.doctor.name}. Blood group and allergies are not recorded. Open My Health to see the source case.`,
    };
    if (facts[text]) return `DEMO / NOT FOR CLINICAL USE. ${facts[text]}`;
  }
  if (/^(hi|hello|hey|good morning|good evening)( ruhi)?$/.test(text)) return "Hello! I'm RUHI. I'm here to help you find your records and talk about your day. How are you feeling?";
  if (/^(how are you|how are you doing|hello, how are you)$/.test(text)) return "I'm ready to help. I don't have feelings, but I can listen and help you find information in MatriSync. How has your day been?";
  if (/^(what is matrisync|what can you do|help)$/.test(text)) return "MatriSync organizes maternal records and referral handoffs. Open My Health for prescriptions and reports. I can help you navigate; I cannot diagnose or choose treatment.";
  if (/^(where (are|can i find) my reports|show my reports|find reports)$/.test(text)) return demo?"Open My Health → Reports. The Ophelia Frost demo lists three investigation references, but their original files and results are not available. No findings have been invented.":"Open My Health → Reports to see documents saved on this device. Uploaded originals are not transferred between facilities in this MVP.";
  if (/^(show my (medicines|prescriptions)|what was prescribed|explain my prescriptions)$/.test(text)) {
    if(!demo) return "Open My Health → Prescriptions for clinician-authored records. I can read explicitly reviewed text, but I cannot recommend a medicine, dose or treatment change. Ask your treating clinician to explain your prescription.";
    const d=submissionDemoCase();return `DEMO / NOT FOR CLINICAL USE. The fictional case has six records: ${d.medications.map(m=>m.name).join("; ")}. Open My Health → Prescriptions for the separate prescription and administration times. The PRBC request is separate, crossmatch pending, transfusion not administered. These are supplied demo records, not advice.`;
  }
  if (/^(show my referral|explain (my|the) referral|where is my referral)$/.test(text)) return "Referral handoffs are managed in the care team's workspace. Please ask your treating clinician to explain your care plan.";
  if (/demo|limitations/.test(text)) return "This is a submission prototype. Fictional examples are marked DEMO / NOT FOR CLINICAL USE. Scripted responses are labelled; optional local model replies are labelled Offline AI. Original uploaded files stay local. NFC integration and clinical validation remain incomplete.";
  if (/^(i feel lonely|i feel sad|i am tired|i feel overwhelmed)( today)?$/.test(text)) return "I'm sorry today feels difficult. You can tell me what's been happening. It may help to speak with someone you trust and ask for practical support. If you feel unsafe or your symptoms worry you, seek professional help promptly.";
  if (/^(general wellbeing|how can i look after my wellbeing)$/.test(text)) return "Make space to rest when you can and ask trusted people for support. Keep your care team's appointments and discuss symptoms or treatment questions with them. I cannot assess your condition or replace professional care.";
  return undefined;
}
