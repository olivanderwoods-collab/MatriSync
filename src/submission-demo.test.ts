import { expect,it } from "vitest";
import { writeFileSync } from "node:fs";
import { compactDemoHandoff,submissionDemoCase } from "./submission-demo";
import { demoHandoffLines,demoHandoffPdf } from "./submission-document";
import { scriptedCompanion } from "./ai/scripted";
it("creates exactly one deterministic linked case, six medicines and a separate pending blood request",()=>{
 const a=submissionDemoCase(),b=submissionDemoCase();expect(a).toEqual(b);expect(a.medications).toHaveLength(6);expect(new Set(a.medications.map(m=>m.id)).size).toBe(6);
 for(const m of a.medications){expect(m.patientId).toBe(a.patient.id);expect(m.prescriberId).toBe(a.doctor.id);expect(m.creatorId).toBe(a.doctor.id);expect(m.administeringPerson).toBeNull();for(const value of [m.prescribedAt,m.administeredAt,m.initiatedAt].filter(Boolean))expect(value).toMatch(/\+05:30$/);}
 expect(a.medications[0].administeredAt).toBeUndefined();expect(a.medications[4].initiatedAt).toBe("2026-11-07T12:04:00+05:30");expect(a.medications[4].administeredAt).toBeUndefined();
 expect(a.bloodRequest.crossmatchStatus).toBe("Pending");expect(a.bloodRequest.transfusionStatus).toBe("Not administered");
 const times=a.timeline.map(t=>Date.parse(t.at));expect(times).toEqual([...times].sort((x,y)=>x-y));
 a.patient.name="Changed test copy";expect(submissionDemoCase().patient.name).toBe("Ophelia Frost");expect(b.patient.bloodGroup).toBe("Not recorded");
});
it("builds current-data PDF and compact preview without asserting encryption, NFC success or missing report findings",()=>{
 const d=submissionDemoCase();d.patient.name="Ophelia Export Check";
 expect(demoHandoffLines(d).join("\n")).toContain("Ophelia Export Check");
 const bytes=demoHandoffPdf(d);expect(new TextDecoder().decode(bytes)).toContain("Ophelia Export Check");
 expect(compactDemoHandoff(d).encrypted).toBe(false);expect(compactDemoHandoff(d).physicalNfcWritten).toBe(false);expect(compactDemoHandoff(d).dictionaryVersion).toBe(0);
 writeFileSync(".local-tools/ophelia-handoff-check.pdf",demoHandoffPdf());
});
it("provides labelled-script content without generative requirements and routes urgent language to human care",()=>{
 expect(scriptedCompanion("Hello",true)).toContain("MatriSathi");
 expect(scriptedCompanion("Show my prescriptions",true)).toContain("six records");
 expect(scriptedCompanion("Show my reports",true)).toContain("not available");
 expect(scriptedCompanion("I am bleeding heavily",true)).toMatch(/urgent|emergency|immediate/i);
 expect(scriptedCompanion("Recommend a medicine dose",true)).toBeUndefined();
});
