// ISOLATED NFC COMMIT MODEL v1 — no device driver, UI import, Firebase or key provisioning.
import { sameBinary } from "../src/nfc/binary";
import { type MemoryLayout, sectionWritePlan } from "../src/nfc/layout";
import { type SectionContext, readClinicalSection } from "../src/nfc/sections";
import { readTravel } from "../src/nfc/travel";

export const COMMIT_SLOT_BYTES = 48;
export type TagImage = ReadonlyMap<number, Uint8Array>;
export type ExpectedSection = { context: SectionContext; packetDigest: string };
export type ReadResult = { status: "current"; packet: Uint8Array; value: unknown } | { status: "unverified" | "unavailable" | "not-current"; reason: string };
export type WriteStep = { phase: "invalidate" | "payload" | "descriptor" | "commit"; block: number; bytes: Uint8Array };
export type CommitSnapshot = { version: 1; layout: MemoryLayout; before: [number, number[]][]; packet: number[]; expected: { context: Omit<SectionContext,"binding"> & {binding:number[]}; packetDigest:string }; previous: CommitSnapshot["expected"] | null; original: CommitSnapshot["expected"] | null };
const storedPin=(e:ExpectedSection):CommitSnapshot["expected"]=>({...e,context:{...e.context,binding:[...e.context.binding]}});
const loadedPin=(e:CommitSnapshot["expected"]):ExpectedSection=>({...e,context:{...e.context,binding:new Uint8Array(e.context.binding)}});
const copyContext = (c: SectionContext): SectionContext => ({...c,binding:new Uint8Array(c.binding)});
const copyExpected = (e: ExpectedSection): ExpectedSection => ({context:copyContext(e.context),packetDigest:e.packetDigest});
const hex = (b: Uint8Array) => Array.from(b,n=>n.toString(16).padStart(2,"0")).join("");
export async function packetDigest(bytes: Uint8Array) { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(bytes)))); }

function checkedLayout(value: MemoryLayout): MemoryLayout {
  const layout={...value,blocks:[...value.blocks],a:[...value.a],b:[...value.b],c:[...value.c]};
  const all=[...layout.a,...layout.b,...layout.c];
  if (!layout.a.length || !layout.b.length || layout.c.length<6 || all.length!==layout.blocks.length || new Set(all).size!==all.length || all.some(n=>!layout.blocks.includes(n)) || layout.totalBytes!==all.length*16 || new Set(layout.blocks).size!==layout.blocks.length || layout.blocks.some((n,i)=>i>0&&n<=layout.blocks[i-1])) throw Error("Commit model needs a verified disjoint layout with at least six Section C blocks.");
  sectionWritePlan(new Uint8Array(1),layout,"a"); // Existing manufacturer/trailer/size safeguards.
  return layout;
}
function imageCopy(image: TagImage, layout: MemoryLayout): Map<number,Uint8Array> {
  const copy=new Map<number,Uint8Array>();
  for(const block of layout.blocks){const bytes=image.get(block);if(!(bytes instanceof Uint8Array)||bytes.length!==16)throw Error("Incomplete tag read-back: every allocated block must contain exactly 16 bytes.");copy.set(block,new Uint8Array(bytes));}
  return copy;
}
function slot(layout: MemoryLayout, section: "a" | "b") { return layout.c.slice(section==="a"?0:3,section==="a"?3:6); }
function join(image:TagImage,blocks:readonly number[]) { const result=new Uint8Array(blocks.length*16);blocks.forEach((block,i)=>result.set(image.get(block)!,i*16));return result; }
function equalImage(a:TagImage,b:TagImage,blocks:readonly number[]){return blocks.every(n=>sameBinary(a.get(n)!,b.get(n)!));}
function validateExpected(expected:ExpectedSection) {
  const c=expected.context;
  if(!["a","b"].includes(c.section)||c.dictionaryVersion!==1||!Number.isInteger(c.sequence)||c.sequence<1||c.sequence>0xffffffff||c.binding.length!==16||!/^[a-f0-9]{64}$/.test(expected.packetDigest))throw Error("A trusted supported referral context, generation and exact packet digest are required.");
}
function descriptor(expected:ExpectedSection,length:number){
  validateExpected(expected);
  if(!Number.isInteger(length)||length<61||length>32829)throw Error("Invalid section length.");
  const b=new Uint8Array(48),v=new DataView(b.buffer),c=expected.context;
  b.set([77,67,1,c.section==="a"?1:2]);v.setUint16(4,c.dictionaryVersion);v.setUint16(6,length);v.setUint32(8,c.sequence);
  b.set(expected.packetDigest.match(/../g)!.map(s=>parseInt(s,16)),12);b.set([67,77,73,84],44);return b;
}
async function decode(packet:Uint8Array,key:CryptoKey,context:SectionContext,capacity:number){return context.section==="a"?readClinicalSection(packet,key,context,capacity):readTravel(packet,key,context,capacity);}
class GenerationMismatch extends Error {}
async function pinnedPacket(image:TagImage,layout:MemoryLayout,pin:ExpectedSection){
  validateExpected(pin);
  const c=pin.context,required=[...layout[c.section],...slot(layout,c.section)];
  // Independent readers do not need readable bytes from the other section.
  const read=imageCopy(image,{...layout,blocks:required}),d=join(read,slot(layout,c.section)),v=new DataView(d.buffer);
  if(d[0]!==77||d[1]!==67||d[2]!==1||d[3]!== (c.section==="a"?1:2)||!sameBinary(d.slice(44),new Uint8Array([67,77,73,84])))throw Error("Missing or incomplete completion descriptor.");
  if(v.getUint16(4)!==c.dictionaryVersion||v.getUint32(8)!==c.sequence)throw new GenerationMismatch("Descriptor does not match the independently expected generation/version. No clinical data was returned.");
  const length=v.getUint16(6),body=join(read,layout[c.section]);
  if(length<61||length>body.length||body.slice(length).some(n=>n!==0))throw Error("Incomplete section or unexpected padding.");
  const packet=body.slice(0,length),actual=await packetDigest(packet);
  if(actual!==pin.packetDigest||hex(d.slice(12,44))!==pin.packetDigest)throw Error("Packet differs from the approved operation or completion descriptor.");
  // The hash pin is supplied by trusted state, never by this descriptor. Check
  // the authenticated envelope's public context even when logger lacks A's key.
  const header=new DataView(packet.buffer);
  if(packet[0]!==77||packet[1]!==78||packet[2]!==1||packet[3]!== (c.section==="a"?1:2)||header.getUint16(4)!==c.dictionaryVersion||header.getUint32(6)!==c.sequence||!sameBinary(packet.slice(12,28),c.binding))throw Error("Pinned section belongs to a different context.");
  return packet;
}

// Checks ciphertext against an independently trusted pin, without exposing data
// or implying possession of the section's decryption key.
export async function checkPinnedSection(image:TagImage,layoutInput:MemoryLayout,expected:ExpectedSection){
  await pinnedPacket(image,checkedLayout(layoutInput),copyExpected(expected));
}

export async function inspectCommit(image:TagImage,layoutInput:MemoryLayout,expected?:ExpectedSection,key?:CryptoKey):Promise<ReadResult>{
  // No tag-derived generation may silently supply freshness or authorization.
  if(!expected)return{status:"unverified",reason:"Expected referral and generation are unavailable. Tag data cannot establish freshness."};
  if(!key)return{status:"unverified",reason:"Authorized section key unavailable."};
  try{
    const layout=checkedLayout(layoutInput),pin=copyExpected(expected),packet=await pinnedPacket(image,layout,pin);
    return{status:"current",packet,value:await decode(packet,key,pin.context,layout[`${pin.context.section}Bytes`])};
  }catch(e){return{status:e instanceof GenerationMismatch?"not-current":"unavailable",reason:e instanceof Error?e.message:"Section could not be verified."};}
}

// Immutable approved operation. The separate Node journal retains snapshots;
// this model itself provides neither persistence nor device exclusivity.
export class PendingTagCommit {
  readonly #layout:MemoryLayout;
  readonly #before:Map<number,Uint8Array>;
  readonly #expected:ExpectedSection;
  readonly #steps:WriteStep[];
  readonly #after:Map<number,Uint8Array>;
  readonly #snapshot:CommitSnapshot;
  private constructor(layout:MemoryLayout,before:Map<number,Uint8Array>,expected:ExpectedSection,steps:WriteStep[],snapshot:CommitSnapshot){
    this.#snapshot=structuredClone(snapshot);
    this.#layout=layout;this.#before=before;this.#expected=expected;this.#steps=steps;
    this.#after=imageCopy(before,layout);for(const step of steps)this.#after.set(step.block,step.bytes.slice());
  }
  static async prepare(input:{layout:MemoryLayout;before:TagImage;packet:Uint8Array;context:SectionContext;key:CryptoKey;previous?:ExpectedSection;original?:ExpectedSection}){
    // Capture all mutable caller input before awaiting cryptography.
    const layout=checkedLayout(input.layout),before=imageCopy(input.before,layout),packet=new Uint8Array(input.packet),context=copyContext(input.context),previous=input.previous?copyExpected(input.previous):undefined,original=input.original?copyExpected(input.original):undefined;
    const expected={context,packetDigest:await packetDigest(packet)};validateExpected(expected);
    const payload=sectionWritePlan(packet,layout,context.section);
    await decode(packet,input.key,context,layout[`${context.section}Bytes`]);
    if(context.section==="b"){
      if(!original||original.context.section!=="a"||original.context.sequence!==1||!sameBinary(original.context.binding,context.binding))throw Error("Transport update requires an independently trusted original-handoff pin for the same referral.");
      await pinnedPacket(before,layout,original); // No A decryption key supplied to logger.
    }
    if(previous){
      if(context.section==="a")throw Error("Original handoff is immutable. Transport updates may modify only Section B and its own completion slot.");
      validateExpected(previous);
      if(previous.context.section!==context.section||previous.context.dictionaryVersion!==context.dictionaryVersion||!sameBinary(previous.context.binding,context.binding)||previous.context.sequence===0xffffffff||context.sequence!==previous.context.sequence+1)throw Error("Update must advance exactly one generation of the same authorized referral section.");
      if((await inspectCommit(before,layout,previous,input.key)).status!=="current")throw Error("Original section is not the expected committed predecessor. Preserve it and reconcile first.");
    }else{
      if(context.sequence!==1||join(before,[...layout[context.section],...slot(layout,context.section)]).some(b=>b!==0))throw Error("Initial commit requires an explicitly supplied blank section and generation one. Existing data was not overwritten.");
      if(context.section==="a"&&join(before,[...layout.b,...slot(layout,"b")]).some(b=>b!==0))throw Error("New original handoff requires blank transport storage. Do not mix referrals or erase earlier data.");
    }
    const desc=descriptor(expected,packet.length),blocks=slot(layout,context.section);
    const steps:WriteStep[]=[{phase:"invalidate",block:blocks[2],bytes:new Uint8Array(16)},...payload.map(w=>({phase:"payload" as const,block:w.block,bytes:w.data})),{phase:"descriptor",block:blocks[0],bytes:desc.slice(0,16)},{phase:"descriptor",block:blocks[1],bytes:desc.slice(16,32)},{phase:"commit",block:blocks[2],bytes:desc.slice(32)}];
    return new PendingTagCommit(layout,before,expected,steps,{version:1,layout,before:[...before].map(([n,b])=>[n,[...b]]),packet:[...packet],expected:storedPin(expected),previous:previous?storedPin(previous):null,original:original?storedPin(original):null});
  }
  snapshot(){return structuredClone(this.#snapshot);}
  // Revalidate the retained original operation; never re-encrypt, write or advance.
  static async restore(value:CommitSnapshot,key:CryptoKey){
    const s=structuredClone(value);
    const bytes=(v:unknown):v is number[]=>Array.isArray(v)&&v.every(n=>Number.isInteger(n)&&n>=0&&n<=255);
    if(s?.version!==1||!bytes(s.packet)||!Array.isArray(s.before)||s.before.some(e=>!Array.isArray(e)||e.length!==2||!Number.isInteger(e[0])||!bytes(e[1])||e[1].length!==16)||new Set(s.before.map(e=>e[0])).size!==s.before.length||[s.expected,s.previous,s.original].some(p=>p!==null&&(!p||!bytes(p.context?.binding)||p.context.binding.length!==16)))throw Error("Invalid pending operation snapshot.");
    const restored=await PendingTagCommit.prepare({layout:s.layout,before:new Map(s.before.map(([n,b])=>[n,new Uint8Array(b)])),packet:new Uint8Array(s.packet),context:loadedPin(s.expected).context,key,previous:s.previous?loadedPin(s.previous):undefined,original:s.original?loadedPin(s.original):undefined});
    if(JSON.stringify(restored.snapshot())!==JSON.stringify(s))throw Error("Pending operation snapshot differs from validated original bytes or expectations.");
    return restored;
  }
  expected(){return copyExpected(this.#expected);}
  steps(){return this.#steps.map(s=>({...s,bytes:s.bytes.slice()}));}
  baseline(){return imageCopy(this.#before,this.#layout);}
  finalImage(){return imageCopy(this.#after,this.#layout);}
  // Reconciliation needs exact full-layout readback as well as authenticated
  // target bytes. A transport update cannot confirm after changing A or A's slot.
  async reconcile(image:TagImage,key:CryptoKey){
    const read=imageCopy(image,this.#layout);
    if(!equalImage(read,this.#after,this.#layout.blocks))return{status:"unconfirmed" as const,reason:"Read-back does not match the exact approved final image. Preserve the pending operation."};
    const result=await inspectCommit(read,this.#layout,this.#expected,key);
    return result.status==="current"?{status:"confirmed-in-model" as const,expected:this.expected()}:{status:"unconfirmed" as const,reason:result.reason};
  }
  // Explicit retry only. Recognize a sequential prefix, optionally one torn
  // 16-byte write with arbitrary byte mixtures of its before/after values.
  // Other changes, a different generation or damage to another section refuse.
  retryFrom(image:TagImage){
    const read=imageCopy(image,this.#layout),prefix=imageCopy(this.#before,this.#layout);
    let reachable=equalImage(read,prefix,this.#layout.blocks);
    for(const step of this.#steps){
      const old=prefix.get(step.block)!,observed=read.get(step.block)!;
      const others=this.#layout.blocks.filter(n=>n!==step.block);
      if(equalImage(read,prefix,others)&&observed.every((v,i)=>v===old[i]||v===step.bytes[i]))reachable=true;
      prefix.set(step.block,step.bytes.slice());
    }
    if(!reachable&&!equalImage(read,this.#after,this.#layout.blocks))throw Error("Read-back is not a recognized interruption of this exact operation. Do not overwrite; reconcile authority and tag state.");
    // No re-encryption, new nonce, sequence increment or clinical changes.
    return new PendingTagCommit(this.#layout,read,this.#expected,this.#steps.map(s=>({...s,bytes:s.bytes.slice()})),this.#snapshot);
  }
  begin(){return new CommitReadbackSession(this.#layout,this.#before,this.#steps);}
}

class CommitReadbackSession {
  #index=0;
  readonly #image:Map<number,Uint8Array>;
  readonly #steps:WriteStep[];
  readonly #blocks:readonly number[];
  constructor(layout:MemoryLayout,before:TagImage,steps:WriteStep[]){this.#image=imageCopy(before,layout);this.#steps=steps.map(s=>({...s,bytes:s.bytes.slice()}));this.#blocks=[...layout.blocks];}
  next():WriteStep|undefined{const s=this.#steps[this.#index];return s?{...s,bytes:s.bytes.slice()}:undefined;}
  acceptReadback(image:TagImage){
    const s=this.#steps[this.#index];if(!s)throw Error("No write is awaiting read-back.");
    const expected=new Map(this.#image);expected.set(s.block,s.bytes);
    if(this.#blocks.some(n=>!(image.get(n) instanceof Uint8Array)||image.get(n)!.length!==16)||!equalImage(image,expected,this.#blocks))throw Error("Exact read-back failed. No next write or completion was confirmed.");
    this.#image.set(s.block,s.bytes.slice());this.#index++;
  }
  get complete(){return this.#index===this.#steps.length;}
}
