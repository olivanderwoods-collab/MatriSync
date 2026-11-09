import "fake-indexeddb/auto";
import { beforeEach, expect, it, vi } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { localSharingDevice } from "./sharing-storage";
import { allReferralFields, emptyReferralFields } from "./referral-draft";
import { compactCarePacket, compactCarePayload, compactCareWrapper, expandCarePayload, expandCareWrapper, readCarePacket } from "./care-handoff-codec";
import { signCare, verifyCare, wrapCare, wrapCareBytes, unwrapCareBytes, jsonBytes } from "./care-crypto";
import { frameHandoff } from "./handoff-frame";
const auth=vi.hoisted(()=>({uid:""}));
vi.mock("./auth",()=>({accountAuth:async()=>({currentUser:{uid:auth.uid,isAnonymous:false}})}));
beforeEach(()=>{auth.uid=crypto.randomUUID();});
function payload() { return {version:1,id:crypto.randomUUID(),caseId:crypto.randomUUID(),sourceUid:auth.uid,sourceName:"Synthetic Doctor",sourceFacility:"source-facility",recipientUid:"recipient",recordedAt:"2026-11-09T10:00:00.000Z",profile:{name:"Synthetic Mother",birthDate:"",sourceLocalId:"local-id",sourceUid:auth.uid},fields:{...emptyReferralFields(),reason:"Manual referral reason",allergies:"",usg:"Not supplied"}}; }
it("round trips every field, absent versus blank, Unicode and exact medication text",()=>{
 const p=payload(); p.fields=Object.fromEntries(allReferralFields.map((key,i)=>[key,`Field ${i}: বাংলা · 10 mg\nSecond line`])) as typeof p.fields;
 expect(expandCarePayload(compactCarePayload(p))).toEqual(p);
 const sparse=payload(); expect(expandCarePayload(compactCarePayload(sparse))).toEqual(sparse);
 expect(expandCarePayload(compactCarePayload(sparse)).fields).not.toHaveProperty("bloodGroup");
 expect(()=>expandCarePayload([99])).toThrow(); expect(()=>expandCarePayload([...compactCarePayload(sparse),"extra"])).toThrow();
});
it("reduces a fully authenticated handoff and preserves exact JWE and approved content",async()=>{
 const p=payload(),sender=await localSharingDevice(auth.uid),recipient=await localSharingDevice("recipient");
 const legacy=await wrapCare({signed:await signCare(auth.uid,p),sender:{keyId:sender.keyId,encryption:sender.encryption,signing:sender.signing}},recipient);
 const oldPacket=frameHandoff(jsonBytes({kind:"care-referral",id:p.id,ciphertext:legacy}));
 const compact=await wrapCareBytes(await compactCareWrapper(await signCare(auth.uid,compactCarePayload(p)),sender),recipient);
 const packet=compactCarePacket(p.id,compact);
 const parsed=readCarePacket(packet); expect(parsed.ciphertext).toBe(compact); expect(parsed.id).toBe(p.id);
 const wrapper=await expandCareWrapper(await unwrapCareBytes("recipient",parsed.ciphertext));
 expect(expandCarePayload(await verifyCare(wrapper.signed,wrapper.sender))).toEqual(p);
 expect(packet.length).toBeLessThan(oldPacket.length*0.7);
 expect(()=>compactCarePacket(p.id,compact,48)).toThrow("Nothing was truncated");
 const corrupt=packet.slice(); corrupt[80]^=1; expect(()=>readCarePacket(corrupt)).toThrow();
 mkdirSync(".local-tools",{recursive:true}); writeFileSync(".local-tools/handoff-size.json",JSON.stringify({fictionalSample:true,legacyBytes:oldPacket.length,compactBytes:packet.length,savedPercent:Math.round(100*(1-packet.length/oldPacket.length)),verifiedTagBytes:48},null,2));
});
it("continues to read and verify original JSON handoffs",async()=>{
 const p=payload(),sender=await localSharingDevice(auth.uid),recipient=await localSharingDevice("recipient");
 const ciphertext=await wrapCare({signed:await signCare(auth.uid,p),sender:{keyId:sender.keyId,encryption:sender.encryption,signing:sender.signing}},recipient);
 const packet=readCarePacket(frameHandoff(jsonBytes({kind:"care-referral",id:p.id,ciphertext})));
 const wrapper=await expandCareWrapper(await unwrapCareBytes("recipient",packet.ciphertext));
 expect(expandCarePayload(await verifyCare(wrapper.signed,wrapper.sender))).toEqual(p);
});
it("uses the plain compact fallback when compression is unavailable",async()=>{
 const p=payload(),sender=await localSharingDevice(auth.uid),signed=await signCare(auth.uid,compactCarePayload(p));
 vi.stubGlobal("CompressionStream",undefined);
 try {const bytes=await compactCareWrapper(signed,sender); expect(bytes[0]).toBe(0); const decoded=await expandCareWrapper(bytes); expect(decoded.signed).toBe(signed); expect(decoded.sender.keyId).toBe(sender.keyId);} finally {vi.unstubAllGlobals();}
});
it("bounds decompression and rejects broken encoding",async()=>{
 const compressed=new Uint8Array(await new Response(new Blob([new Uint8Array(1024*1024+1)]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
 const bomb=new Uint8Array(compressed.length+1); bomb[0]=1; bomb.set(compressed,1);
 await expect(expandCareWrapper(bomb)).rejects.toThrow("safe decoding limit");
 await expect(expandCareWrapper(new Uint8Array([1,255,255]))).rejects.toThrow();
 await expect(expandCareWrapper(new Uint8Array([9]))).rejects.toThrow("Unsupported");
});
