import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { appendCodebook, codebookV1, dictionary, entryFor, fieldId, reviewedTerm, validateCodebook } from "./dictionary";
import { compressBinary, decodeBinary, encodeBinary, expandBinary, sameBinary, type NfcValue } from "./binary";
import { assertSectionFits, currentTagEvidence, memoryLayout, sectionWritePlan } from "./layout";
import { openSection, prepareSection, readClinicalSection, referralBinding, sealSection, SECTION_OVERHEAD, type SectionContext } from "./sections";
import { decodeTravel, encodeTravel, eventCapacity, prepareTravel, readTravel, type TravelLog } from "./travel";
import { prepareCompactReview } from "./review";
import { CompactHandoffReview } from "./compact-review";
import { orderedTravel, reconstructSections } from "./reconstruction";

const identity = { patientId: "SYN-P001", referralId: "SYN-R001", subject: "mother" as const, patientName: "Fictional Patient", createdAt: "2026-11-10T09:00:00.000Z", sendingFacilityId: "SYN-F1", professionalId: "SYN-D1" };
const source = { reason: "Recorded referral reason", history: "", treatment: "", instructions: "", allergies: "Status unknown", bloodGroup: "", drugsGiven: "Not documented" };
const synthetic: NfcValue = { ...identity, allergies: [{ subject: "mother", status: "present", name: "Synthetic substance", negation: false }, { subject: "baby", status: "unknown", name: null }], medications: [{ subject: "mother", name: "Synthetic medicine", dose: 1.25, unit: "test-unit", route: "synthetic-route", status: "prescribed", prescribedAt: "2026-11-10T09:00:00.000Z", administeredAt: null }], observations: [{ subject: "baby", name: "Synthetic measurement", value: 0, unit: "test-unit", measuredAt: "2026-11-10T08:55:00.123Z", recordedAt: "2026-11-10T08:56:00.456Z", qualifier: "reported" }], reason: "Source text — no finding was inferred." };
const full1k = memoryLayout({ model: "classic-1k", verifiedDataBlocks: Array.from({length: 63}, (_, i) => i + 1).filter(b => b % 4 !== 3), reservedBlocks: [] }); // Synthetic capacity, NOT evidence about the user's tag.
const key = () => crypto.subtle.generateKey({name: "AES-GCM", length: 256}, false, ["encrypt", "decrypt"]);
const context = async (section: "a" | "b" = "a", sequence = 1): Promise<SectionContext> => ({ section, sequence, dictionaryVersion: 1, binding: await referralBinding(identity.patientId, identity.referralId) });
afterEach(() => vi.unstubAllGlobals());

describe("NFC structural dictionary", () => {
  it("freezes stable IDs and retains structural/clinical distinctions", () => {
    validateCodebook(codebookV1); expect(fieldId("patientId")).toBe(1); expect(fieldId("sequence")).toBe(55);
    for (const e of codebookV1.entries) expect(entryFor(fieldId(e.term)).term).toBe(e.term);
    expect(reviewedTerm("PCM")).toBeUndefined(); expect(reviewedTerm("Paracetamol")).toBeUndefined();
  });
  it("refuses unknown identifiers, fields and versions without guessing", () => {
    expect(() => entryFor(900)).toThrow(/Unknown/); expect(() => dictionary(2)).toThrow(/Unsupported/); expect(() => encodeBinary({ arbitraryClinicalLabel: "test" })).toThrow(/Nothing was omitted/);
  });
  it("permits append-only reviewed imports but never activates them implicitly", () => {
    const next = { version: 2, entries: [...codebookV1.entries, { id: 100, code: "TEST", term: "Synthetic reviewed term", category: "terminology" as const, subject: "both" as const, synonyms: [], introducedIn: 2, status: "reviewed" as const, approvedAt: "2026-11-10", reviewReference: "synthetic-test-only" }] };
    expect(appendCodebook(codebookV1, next).version).toBe(2); expect(reviewedTerm("Synthetic reviewed term", next)?.id).toBe(100);
    expect(() => dictionary(2)).toThrow();
    expect(() => appendCodebook(codebookV1, { ...next, entries: next.entries.slice(1) })).toThrow();
    expect(() => appendCodebook(codebookV1, { ...next, entries: next.entries.map(e => e.id === 1 ? {...e, term: "babyId"} : e) })).toThrow();
    expect(() => validateCodebook({ ...next, entries: next.entries.map(e => e.id === 100 ? {...e, reviewReference: ""} : e) })).toThrow();
  });
});
describe("Deterministic binary encoding", () => {
  it("pins the wire vector independently of object property order", () => {
    expect([...encodeBinary({ patientId: "X", subject: "mother" })]).toEqual([77,67,1,0,1,8,2,1,5,1,88,3,5,6,109,111,116,104,101,114]);
    expect(sameBinary(encodeBinary({patientId:"X",subject:"mother"}), encodeBinary({subject:"mother",patientId:"X"}))).toBe(true);
  });
  it("retains mother/baby, negations, dose precision and both times exactly", () => expect(decodeBinary(encodeBinary(synthetic))).toEqual(synthetic));
  it.each(["present", "absent", "unknown", "no known allergy", "not asked"])("retains allergy distinction %s", status => expect(decodeBinary(encodeBinary({allergies:{status}}))).toEqual({allergies:{status}}));
  it("distinguishes omitted, null, empty, false, zero and negative zero", () => {
    const values: NfcValue[] = [{}, {value:null}, {value:""}, {value:false}, {value:0}, {value:-0}, {value:-1.255}];
    for (const value of values) expect(decodeBinary(encodeBinary(value))).toEqual(value);
  });
  it("preserves Unicode and rejects invalid code points", () => {
    const text = "\ufeffমা 👶 café\n negative—not positive";
    expect(decodeBinary(encodeBinary({text}))).toEqual({text}); expect(() => encodeBinary({text:"\ud800"})).toThrow(/Unicode/);
  });
  it("rejects every truncation and unsupported/trailing/duplicate data", () => {
    const b = encodeBinary(synthetic);
    for (let n = 0; n < b.length; n++) expect(() => decodeBinary(b.slice(0,n))).toThrow();
    expect(() => decodeBinary(new Uint8Array([...b,0]))).toThrow();
    const version = b.slice(); version[4] = 2; expect(() => decodeBinary(version)).toThrow(/version/);
    expect(() => decodeBinary(new Uint8Array([77,67,1,0,1,8,1,99,0]))).toThrow(/Unknown/);
    expect(() => decodeBinary(new Uint8Array([77,67,1,0,1,8,2,1,0,1,0]))).toThrow(/order/);
    expect(() => decodeBinary(new Uint8Array([77,67,1,0,1,6,1]))).toThrow(/Unapproved/);
    expect(() => decodeBinary(new Uint8Array([77,67,1,0,1,3,128,0]))).toThrow(/Noncanonical/);
  });
  it("bounds depth, values, non-finite numbers and bytes", () => {
    expect(() => encodeBinary({value:NaN})).toThrow(); expect(() => encodeBinary({value:Infinity})).toThrow();
    expect(() => encodeBinary({text:"a".repeat(32768)})).toThrow(); expect(() => encodeBinary({events:Array(513).fill(null)})).toThrow();
    let nested: NfcValue = null; for(let i=0;i<14;i++) nested={value:nested}; expect(() => encodeBinary(nested)).toThrow();
  });
  it("compresses only when smaller and works without a compressor", async () => {
    const raw=encodeBinary({text:"Repeated exact information. ".repeat(80)}), compressed=await compressBinary(raw);
    expect(compressed[0]).toBe(1); expect(compressed.length).toBeLessThan(raw.length); expect(await expandBinary(compressed)).toEqual(raw);
    const tiny=await compressBinary(encodeBinary(null)); expect(tiny[0]).toBe(0);
    vi.stubGlobal("CompressionStream",undefined); expect((await compressBinary(raw))[0]).toBe(0);
  });
  it("encodes exact canonical timestamps while retaining offsets and uncertain text", () => {
    for (const recordedAt of ["2026-11-10T12:23:34.567Z", "2026-11-10T17:53:34.567+05:30", "2026-11-10", "time unknown"]) expect(decodeBinary(encodeBinary({recordedAt}))).toEqual({recordedAt});
    expect(encodeBinary({recordedAt:"2026-11-10T12:23:34.567Z"}).length).toBe(17);
  });
  it("refuses compressed expansion bombs and invalid compression flags", async () => {
    const stream=new Blob([new Uint8Array(65536)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const compressed=new Uint8Array(await new Response(stream).arrayBuffer());
    await expect(expandBinary(new Uint8Array([1,...compressed]))).rejects.toThrow(/limit/);
    await expect(expandBinary(new Uint8Array([2,0]))).rejects.toThrow();
  });
});
describe("NFC section memory", () => {
  it("keeps 48 verified bytes honest: no space for a clinical section", () => {
    expect(memoryLayout(currentTagEvidence)).toMatchObject({totalBytes:48,aBytes:0,bBytes:16,cBytes:32}); expect(eventCapacity(16)).toBe(0);
    expect(() => assertSectionFits(new Uint8Array(1),memoryLayout(currentTagEvidence),"a")).toThrow(/borrowed/);
  });
  it("splits hypothetical 1K data blocks without taking the transport reservation", () => {
    expect(full1k).toMatchObject({totalBytes:752,aBytes:400,bBytes:256,cBytes:96}); expect(eventCapacity(full1k.bBytes)).toBe(6);
    expect(() => assertSectionFits(new Uint8Array(401),full1k,"a")).toThrow();
    const writes=sectionWritePlan(new Uint8Array(400).fill(9),full1k,"a"); expect(writes.map(w=>w.block)).toEqual(full1k.a); expect(writes.some(w=>full1k.b.includes(w.block)||full1k.c.includes(w.block))).toBe(false);
  });
  it.each([0,3,7,63,127,143,255])("rejects unsafe block %s", block => expect(()=>memoryLayout({model:"classic-4k",verifiedDataBlocks:[block],reservedBlocks:[]})).toThrow());
  it("excludes pre-reserved blocks and refuses invented unknown-tag capacity", () => {
    expect(memoryLayout({...currentTagEvidence,reservedBlocks:[5]}).blocks).not.toContain(5);
    expect(()=>memoryLayout({...currentTagEvidence,verifiedDataBlocks:[4,5,6,8]})).toThrow();
    expect(()=>memoryLayout({...currentTagEvidence,verifiedDataBlocks:[4,4]})).toThrow();
    expect(()=>sectionWritePlan(new Uint8Array(1),{...full1k,b:full1k.a},"a")).toThrow(/Unsafe/);
  });
});
describe("Independent authenticated sections", () => {
  it("encrypts and reconstructs offline without any fetch or AI", async () => {
    vi.stubGlobal("fetch",vi.fn(()=>{throw Error("Network disabled");})); const k=await key(), c=await context();
    const result=await prepareSection(synthetic,k,c,4096);
    expect(await readClinicalSection(result.packet,k,c,4096)).toEqual(synthetic); expect(fetch).not.toHaveBeenCalled();
    expect(result.sizes.final).toBe(result.sizes.compressed+1+SECTION_OVERHEAD);
  });
  it("rejects every altered byte, truncation and wrong key", async () => {
    const k=await key(), c=await context(), p=await sealSection(new Uint8Array([1,2,3]),k,c,100);
    for(let i=0;i<p.length;i++){const bad=p.slice();bad[i]^=1;await expect(openSection(bad,k,c,100)).rejects.toThrow();}
    for(let i=0;i<p.length;i++) await expect(openSection(p.slice(0,i),k,c,100)).rejects.toThrow();
    await expect(openSection(p,await key(),c,100)).rejects.toThrow(/authentication/);
  });
  it("binds referral, section, version and expected sequence", async () => {
    const k=await key(), c=await context(), p=await sealSection(new Uint8Array([1]),k,c,100);
    for(const changed of [{...c,section:"b" as const},{...c,sequence:2},{...c,binding:await referralBinding("other","other")},{...c,dictionaryVersion:2}]) await expect(openSection(p,k,changed,100)).rejects.toThrow();
    const p2=await sealSection(new Uint8Array([1]),k,c,100); expect(p2).not.toEqual(p);
    await expect(sealSection(new Uint8Array([1]),k,c,60)).rejects.toThrow(/requires 61/);
    const extractable=await crypto.subtle.generateKey({name:"AES-GCM",length:256},true,["encrypt","decrypt"]); await expect(sealSection(new Uint8Array([1]),extractable,c,100)).rejects.toThrow(/non-extractable/);
  });
  it("a transport update leaves A byte-identical; torn B does not invalidate A", async () => {
    const ak=await key(),bk=await key(),a=await context(),b=await context("b"),original=await prepareSection({...identity,reason:"Exact original"},ak,a,full1k.aBytes), before=original.packet.slice();
    const log:TravelLog={tripStartedAt:1794301200000,events:[{kind:"bloodPressure",subject:"mother",source:"manual",clockQuality:"unverified",elapsedSeconds:61,recordedElapsedSeconds:75,value:120,secondValue:80}]};
    const bp=await prepareTravel(log,bk,b,full1k.bBytes);
    expect(await readTravel(bp,bk,b,full1k.bBytes)).toEqual(log);
    expect(sectionWritePlan(bp,full1k,"b").some(w=>full1k.a.includes(w.block))).toBe(false);
    await expect(readTravel(bp.slice(0,-1),bk,b,full1k.bBytes)).rejects.toThrow();
    expect(original.packet).toEqual(before); expect(await readClinicalSection(before,ak,a,full1k.aBytes)).toEqual({...identity,reason:"Exact original"});
    const changed=await prepareTravel({...log,events:[...log.events,{...log.events[0],elapsedSeconds:90}]},bk,{...b,sequence:2},full1k.bBytes);
    await expect(readTravel(changed,bk,b,full1k.bBytes)).rejects.toThrow(/stale/);
    const reconstructed=await reconstructSections({packet:before,key:ak,context:a,capacity:full1k.aBytes},{packet:bp.slice(0,-1),key:bk,context:b,capacity:full1k.bBytes});
    expect(reconstructed.original.status).toBe("verified"); expect(reconstructed.transport.status).toBe("unavailable");
  });
  it("does not accept an authenticated payload under another patient binding", async()=>{
    const k=await key(),c=await context(),result=await prepareSection({...identity,patientId:"another"},k,c,4096);
    await expect(readClinicalSection(result.packet,k,c,4096)).rejects.toThrow(/identity/);
    const unavailable=await reconstructSections({packet:result.packet,context:c,capacity:4096},{context:await context("b"),capacity:256});
    expect(unavailable.original.status).toBe("unavailable");expect(unavailable.transport.status).toBe("missing");
  });
});
describe("Travel bounds and clinical review", () => {
  const event={kind:"temperature" as const,subject:"baby" as const,source:"reported" as const,clockQuality:"unverified" as const,elapsedSeconds:4,recordedElapsedSeconds:10,value:37.125,secondValue:null};
  it("bounds events and keeps exact time/subject/quality/values", () => {
    const log={tripStartedAt:1000,events:Array.from({length:6},()=>({...event}))};
    expect(decodeTravel(encodeTravel(log,256),256)).toEqual(log);
    const timeline=orderedTravel({...log,events:[{...event,elapsedSeconds:20},event]});
    expect(timeline.map(row=>row.index)).toEqual([1,0]); expect(timeline[0].eventTime).toBe("1970-01-01T00:00:05.000Z"); expect(timeline[0].recordedTime).toBe("1970-01-01T00:00:11.000Z");
    expect(()=>encodeTravel({...log,events:[...log.events,event]},256)).toThrow(/full/);
    expect(()=>encodeTravel({...log,events:[{...event,kind:"invented"} as never]},256)).toThrow();
    expect(()=>encodeTravel({...log,events:[{...event,secondValue:0}]},256)).toThrow();
    expect(()=>encodeTravel({...log,events:[{...event,elapsedSeconds:-1}]},256)).toThrow();
    const encoded=encodeTravel(log,256); for(let n=0;n<encoded.length;n++) expect(()=>decodeTravel(encoded.slice(0,n),256)).toThrow();
  });
  it("retains blank/missing values and only excludes explicitly selected fields", async () => {
    const all=Object.keys(source), result=await prepareCompactReview(identity,source,all);
    expect(result.document).toEqual({...identity,...source}); expect(result.fits).toBe(false);
    const selected=await prepareCompactReview(identity,source,all.filter(k=>k!=="history")); expect(selected.document.history).toBeUndefined(); expect(selected.rows.find(r=>r.key==="history")?.included).toBe(false); expect(source.history).toBe("");
    const unsupported = {...source,unapproved:"test"};
    await expect(prepareCompactReview(identity,unsupported,all)).rejects.toThrow(/Unencodable/);
  });
  it("renders the authorized preparation action with explicit integration limits", () => {
    const html=renderToStaticMarkup(createElement(CompactHandoffReview,{...identity,fields:source,disabled:false}));
    expect(html).toContain("Prepare Compact NFC Handoff"); expect(html).toContain("No clinical abbreviations are approved"); expect(html).not.toContain("Send to device");
  });
  it("reports actual byte budgets for representative synthetic handoffs", async () => {
    const k=await key(),c=await context();
    for(const [name,value] of [["minimal",{...identity,reason:"Transfer recorded by doctor"}],["detailed",synthetic]] as const){
      const result=await prepareSection(value,k,c,4096);
      const report={name,...result.sizes,sectionA:full1k.aBytes,sectionB:full1k.bBytes,sectionC:full1k.cBytes,events:eventCapacity(full1k.bBytes),remainingA:full1k.aBytes-result.sizes.final};
      console.info("NFC synthetic byte budget",JSON.stringify(report));
      expect(result.packet.length).toBe(result.sizes.final);
    }
  });
});
