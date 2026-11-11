import {describe,it,expect,vi,afterEach} from "vitest";
import {memoryLayout,currentTagEvidence,type MemoryLayout} from "../src/nfc/layout";
import {prepareSection,referralBinding,type SectionContext} from "../src/nfc/sections";
import {prepareTravel,type TravelLog} from "../src/nfc/travel";
import {PendingTagCommit,inspectCommit,packetDigest,type TagImage} from "./nfc-commit-model";

const layout=memoryLayout({model:"classic-1k",verifiedDataBlocks:Array.from({length:63},(_,i)=>i+1).filter(b=>b%4!==3),reservedBlocks:[]});
const blank=()=>new Map(layout.blocks.map(n=>[n,new Uint8Array(16)]));
const clone=(image:TagImage)=>new Map([...image].map(([n,b])=>[n,b.slice()]));
const key=()=>crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
const identity={patientId:"SYN-COMMIT-P1",referralId:"SYN-COMMIT-R1",patientName:"Fictional Patient",professionalId:"SYN-D1",sendingFacilityId:"SYN-F1",createdAt:"2026-11-11T00:00:00.000Z",subject:"mother"};
async function fixture(){
  const [ak,bk]=await Promise.all([key(),key()]),binding=await referralBinding(identity.patientId,identity.referralId);
  const a:SectionContext={section:"a",sequence:1,dictionaryVersion:1,binding},b:SectionContext={...a,section:"b"};
  const original=await prepareSection({...identity,reason:"Exact original clinician-entered synthetic reason."},ak,a,layout.aBytes);
  const ap=await PendingTagCommit.prepare({layout,before:blank(),packet:original.packet,key:ak,context:a});
  const log:TravelLog={tripStartedAt:1794355200000,events:[{kind:"heartRate",subject:"mother",source:"manual",clockQuality:"unverified",elapsedSeconds:30,recordedElapsedSeconds:35,value:80,secondValue:null}]};
  const bp=await PendingTagCommit.prepare({layout,before:ap.finalImage(),packet:await prepareTravel(log,bk,b,layout.bBytes),key:bk,context:b,original:ap.expected()});
  const b2={...b,sequence:2};
  const next=await PendingTagCommit.prepare({layout,before:bp.finalImage(),packet:await prepareTravel({...log,events:[...log.events,{...log.events[0],elapsedSeconds:60,recordedElapsedSeconds:65,value:81}]},bk,b2,layout.bBytes),key:bk,context:b2,previous:bp.expected(),original:ap.expected()});
  return{ak,bk,a,b,ap,bp,next,original};
}
afterEach(()=>vi.unstubAllGlobals());
describe("Isolated Section C commit model",()=>{
  it("fits two independent 48-byte descriptors within C and changes only owned blocks",async()=>{
    const f=await fixture();expect(layout).toMatchObject({aBytes:400,bBytes:256,cBytes:96});
    for(const [p,s] of [[f.ap,"a"],[f.next,"b"]] as const){
      const steps=p.steps(),owned=[...layout[s],...layout.c.slice(s==="a"?0:3,s==="a"?3:6)];
      expect(steps.every(w=>owned.includes(w.block))).toBe(true);
      expect(steps[0]).toMatchObject({phase:"invalidate",block:owned.at(-1)});expect(steps[0].bytes).toEqual(new Uint8Array(16));
      expect(steps.at(-1)?.phase).toBe("commit");expect(steps.at(-1)?.bytes.slice(-4)).toEqual(new Uint8Array([67,77,73,84]));
      const untouched=layout.blocks.filter(n=>!owned.includes(n));expect(untouched.map(n=>p.finalImage().get(n))).toEqual(untouched.map(n=>p.baseline().get(n)));
    }
  });
  it("requires verified capacity and refuses the actual 48-byte map",async()=>{
    const f=await fixture();await expect(PendingTagCommit.prepare({layout:memoryLayout(currentTagEvidence),before:new Map([[4,new Uint8Array(16)],[5,new Uint8Array(16)],[6,new Uint8Array(16)]]),packet:f.original.packet,key:f.ak,context:f.a})).rejects.toThrow(/six Section C/);
    for(const unsafe of [{...layout,c:[...layout.c.slice(0,5)]},{...layout,b:layout.a},{...layout,blocks:[...layout.blocks,4]},{...layout,totalBytes:999},{...layout,c:[0,...layout.c.slice(1)]}] as MemoryLayout[])await expect(PendingTagCommit.prepare({layout:unsafe,before:blank(),packet:f.original.packet,key:f.ak,context:f.a})).rejects.toThrow();
  });
  it("will not overwrite an existing section, skip generations or replace original A",async()=>{
    const f=await fixture();
    await expect(PendingTagCommit.prepare({layout,before:f.ap.finalImage(),packet:f.original.packet,key:f.ak,context:f.a})).rejects.toThrow(/blank/);
    const newerA={...f.a,sequence:2},packet=(await prepareSection(identity,f.ak,newerA,400)).packet;
    await expect(PendingTagCommit.prepare({layout,before:f.ap.finalImage(),packet,key:f.ak,context:newerA,previous:f.ap.expected()})).rejects.toThrow(/immutable/);
    const step3={...f.b,sequence:3},log:TravelLog={tripStartedAt:0,events:[]};
    await expect(PendingTagCommit.prepare({layout,before:f.bp.finalImage(),packet:await prepareTravel(log,f.bk,step3,256),key:f.bk,context:step3,previous:f.bp.expected(),original:f.ap.expected()})).rejects.toThrow(/exactly one/);
  });
  it("requires externally pinned context, generation and digest; never trusts the tag alone",async()=>{
    const f=await fixture();
    expect((await inspectCommit(f.ap.finalImage(),layout)).status).toBe("unverified");
    expect((await inspectCommit(f.ap.finalImage(),layout,f.ap.expected())).status).toBe("unverified");
    expect((await inspectCommit(f.bp.finalImage(),layout,f.next.expected(),f.bk)).status).toBe("not-current");
    expect((await inspectCommit(f.next.finalImage(),layout,f.bp.expected(),f.bk)).status).toBe("not-current");
    const bad={...f.ap.expected(),packetDigest:"0".repeat(64)};expect((await inspectCommit(f.ap.finalImage(),layout,bad,f.ak)).status).toBe("unavailable");
    const wrong=f.ap.expected();wrong.context.binding[0]^=1;expect((await inspectCommit(f.ap.finalImage(),layout,wrong,f.ak)).status).toBe("unavailable");
  });
  it("blocks advancing the writer until exact read-back, including final commit",async()=>{
    const f=await fixture(),session=f.next.begin(),image=f.next.baseline();let count=0;
    while(session.next()){
      const step=session.next()!;
      // Missing/changed evidence cannot advance this step, even if a no-op write
      // would happen to equal the previous bytes.
      const wrong=clone(image);wrong.get(step.block)![0]^=255;
      expect(()=>session.acceptReadback(wrong)).toThrow(/read-back/);expect(session.next()).toEqual(step);
      image.set(step.block,step.bytes);session.acceptReadback(image);count++;
    }
    expect(count).toBe(f.next.steps().length);expect(session.complete).toBe(true);
    expect(await f.next.reconcile(image,f.bk)).toMatchObject({status:"confirmed-in-model"});
    expect(()=>session.acceptReadback(image)).toThrow(/No write/);
  });
  it("recovers lost final acknowledgement only from the same complete image",async()=>{
    const f=await fixture(),steps=f.next.steps(),image=f.next.baseline(),session=f.next.begin();
    for(const step of steps){image.set(step.block,step.bytes);if(step.phase!=="commit")session.acceptReadback(image);}
    expect(session.complete).toBe(false);
    expect((await f.next.reconcile(image,f.bk)).status).toBe("confirmed-in-model");
    expect((await f.next.reconcile(f.bp.finalImage(),f.bk)).status).toBe("unconfirmed");
    expect((await f.next.reconcile(image,await key())).status).toBe("unconfirmed");
  });
  it("detects interruption at every block and every byte boundary for A initialization and B update",async()=>{
    const f=await fixture();let cases=0;
    for(const [plan,k,other,otherKey] of [[f.ap,f.ak,undefined,undefined],[f.next,f.bk,f.ap.expected(),f.ak]] as const){
      const prefix=plan.baseline();
      for(const step of plan.steps()){
        for(let cut=0;cut<=16;cut++){
          const torn=clone(prefix),bytes=torn.get(step.block)!;bytes.set(step.bytes.subarray(0,cut));
          const exact=[...plan.finalImage()].every(([n,b])=>same(torn.get(n)!,b));
          const result=await plan.reconcile(torn,k);expect(result.status).toBe(exact?"confirmed-in-model":"unconfirmed");
          const decoded=await inspectCommit(torn,layout,plan.expected(),k);expect(decoded.status==="current").toBe(exact);
          if(other)expect((await inspectCommit(torn,layout,other,otherKey)).status).toBe("current");
          const retry=plan.retryFrom(torn);expect(retry.expected()).toEqual(plan.expected());expect(retry.finalImage()).toEqual(plan.finalImage());
          cases++;
        }
        prefix.set(step.block,step.bytes);
      }
    }
    expect(cases).toBe((f.ap.steps().length+f.next.steps().length)*17);
    console.info(`NFC commit interruption boundaries verified: ${cases}`);
  });
  it("supports noncontiguous torn byte mixtures but refuses unrelated damage",async()=>{
    const f=await fixture(),prefix=f.next.baseline();
    for(const step of f.next.steps()){
      const mixed=clone(prefix);for(let i=0;i<16;i++)if(i%2===0)mixed.get(step.block)![i]=step.bytes[i];
      expect(f.next.retryFrom(mixed).finalImage()).toEqual(f.next.finalImage());prefix.set(step.block,step.bytes);
    }
    const damaged=f.next.baseline();damaged.get(layout.a[0])![0]^=1;expect(()=>f.next.retryFrom(damaged)).toThrow(/recognized interruption/);
    const future=f.next.finalImage();future.get(layout.c[3])![11]=3;expect(()=>f.next.retryFrom(future)).toThrow();
  });
  it("refuses skipped payload, early commit, replayed descriptor and corrupted completion",async()=>{
    const f=await fixture(),early=f.next.baseline();
    for(const s of f.next.steps().filter(s=>s.phase!=="payload"))early.set(s.block,s.bytes);
    expect((await inspectCommit(early,layout,f.next.expected(),f.bk)).status).toBe("unavailable");
    const replay=f.next.finalImage();for(const n of layout.c.slice(3,6))replay.set(n,f.bp.finalImage().get(n)!);
    expect((await inspectCommit(replay,layout,f.next.expected(),f.bk)).status).toBe("not-current");
    for(const n of layout.c.slice(3,6))for(let i=0;i<16;i++){
      const corrupt=f.next.finalImage();corrupt.get(n)![i]^=1;
      expect((await inspectCommit(corrupt,layout,f.next.expected(),f.bk)).status).not.toBe("current");
    }
  });
  it("does not invalidate A if B loses its key or completion descriptor",async()=>{
    const f=await fixture(),image=f.next.finalImage();image.set(layout.c[5],new Uint8Array(16));
    expect((await inspectCommit(image,layout,f.next.expected(),f.bk)).status).toBe("unavailable");
    expect((await inspectCommit(image,layout,f.ap.expected(),f.ak)).status).toBe("current");
    const unchanged=f.next.finalImage();unchanged.get(layout.a[0])![0]^=1;
    expect((await inspectCommit(unchanged,layout,f.next.expected(),f.bk)).status).toBe("current");
    expect((await f.next.reconcile(unchanged,f.bk)).status).toBe("unconfirmed");
  });
  it("bounds reads, zero padding and supported format; uses no network",async()=>{
    const f=await fixture();vi.stubGlobal("fetch",vi.fn(()=>{throw Error("Network forbidden");}));
    const incomplete=f.next.finalImage();incomplete.delete(layout.b[0]);expect((await inspectCommit(incomplete,layout,f.next.expected(),f.bk)).status).toBe("unavailable");
    expect((await inspectCommit(incomplete,layout,f.ap.expected(),f.ak)).status).toBe("current");
    await expect(f.next.reconcile(incomplete,f.bk)).rejects.toThrow(/Incomplete/);
    const padded=f.next.finalImage();padded.get(layout.b.at(-1)!)![15]=1;expect((await inspectCommit(padded,layout,f.next.expected(),f.bk)).status).toBe("unavailable");
    expect((await inspectCommit(f.next.finalImage(),layout,f.next.expected(),f.bk)).status).toBe("current");expect(fetch).not.toHaveBeenCalled();
  });
  it("protects pending bytes/context and returned steps from caller mutation",async()=>{
    const f=await fixture(),expected=f.next.expected(),baseline=f.next.baseline(),final=f.next.finalImage();
    expected.context.binding.fill(0);baseline.get(layout.a[0])!.fill(0);final.get(layout.b[0])!.fill(0);f.next.steps()[0].bytes.fill(255);
    expect((await f.next.reconcile(f.next.finalImage(),f.bk)).status).toBe("confirmed-in-model");
    const step=f.next.begin().next()!;step.bytes.fill(255);expect(f.next.steps()[0].bytes).toEqual(new Uint8Array(16));
  });
  it("pins the descriptor layout and packet digest independently",async()=>{
    const f=await fixture(),image=f.ap.finalImage(),desc=new Uint8Array(48);layout.c.slice(0,3).forEach((n,i)=>desc.set(image.get(n)!,i*16));
    expect([...desc.slice(0,6)]).toEqual([77,67,1,1,0,1]);
    const v=new DataView(desc.buffer);expect(v.getUint16(6)).toBe(f.original.packet.length);expect(v.getUint32(8)).toBe(1);
    expect(Array.from(desc.slice(12,44),n=>n.toString(16).padStart(2,"0")).join("")).toBe(await packetDigest(f.original.packet));
    expect([...desc.slice(44)]).toEqual([67,77,73,84]);
  });
  it("requires a trusted A pin for B updates without giving the logger an A key",async()=>{
    const f=await fixture(),packet=await prepareTravel({tripStartedAt:0,events:[]},f.bk,f.b,256);
    await expect(PendingTagCommit.prepare({layout,before:f.ap.finalImage(),packet,key:f.bk,context:f.b})).rejects.toThrow(/trusted original/);
    const wrong=f.ap.expected();wrong.packetDigest="0".repeat(64);
    await expect(PendingTagCommit.prepare({layout,before:f.ap.finalImage(),packet,key:f.bk,context:f.b,original:wrong})).rejects.toThrow(/differs/);
    const other=f.ap.expected();other.context.binding.fill(0);
    await expect(PendingTagCommit.prepare({layout,before:f.ap.finalImage(),packet,key:f.bk,context:f.b,original:other})).rejects.toThrow(/same referral/);
    const stale=blank();stale.get(layout.b[0])![0]=1;
    await expect(PendingTagCommit.prepare({layout,before:stale,packet:f.original.packet,key:f.ak,context:f.a})).rejects.toThrow(/blank transport/);
  });
});
function same(a:Uint8Array,b:Uint8Array){return a.length===b.length&&a.every((v,i)=>v===b[i]);}
