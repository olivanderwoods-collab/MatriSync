// ISOLATED PROTOCOL CANDIDATE. Pinned authority inputs below are synthetic trust,
// not enrollment, Firebase authorization, a key service or a hardware protocol.
import {CompactSign,CompactEncrypt,compactVerify,compactDecrypt,importJWK} from "jose";
import {checkPublicDevice,publicPoint,type PublicDevice,type SharingDevice} from "../src/sharing-crypto";
import {packetDigest,type ExpectedSection} from "./nfc-commit-model";
import {referralBinding} from "../src/nfc/sections";
import type {JournalScope} from "./nfc-commit-journal";

export const AUTH_DOMAIN="matrisync-isolated-nfc-authority-v1";
export const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
export const tokenDigest=(token:string)=>packetDigest(new TextEncoder().encode(token));
const hex=/^[a-f0-9]{64}$/;
const ident=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.length<=200;
const integer=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0;
const generation=(n:unknown):n is number=>integer(n)&&n>0&&n<=0xffffffff;
const hash=(v:unknown):v is string=>typeof v==="string"&&hex.test(v);
function array(v:unknown,length:number):asserts v is unknown[]{if(!Array.isArray(v)||v.length!==length)throw Error("Unsupported NFC authority schema.");}
function publicWire(d:PublicDevice){return[d.keyId,publicPoint(d.encryption),publicPoint(d.signing)];}
function publicRead(v:unknown):PublicDevice{
  array(v,3);if(!hash(v[0]))throw Error("Invalid device identity.");
  const d={keyId:v[0],encryption:publicPoint(v[1] as PublicDevice["encryption"]),signing:publicPoint(v[2] as PublicDevice["signing"])};
  if(JSON.stringify(publicWire(d))!==JSON.stringify(v))throw Error("Noncanonical public device.");return d;
}
export type KeyEnvelopePin={role:"logger"|"receiver";section:"a"|"b";keyId:string;digest:string};
export type Grant={id:string;scope:JournalScope;originalDigest:string;logger:PublicDevice;receiver:PublicDevice;minGeneration:number;maxGeneration:number;epoch:number;notBefore:number;expiresAt:number;envelopes:KeyEnvelopePin[]};
export type Trust={authority:PublicDevice;scope:JournalScope;grantId:string;epoch:number;now:number};
export function grantClaims(g:Grant){return[AUTH_DOMAIN,"grant",1,g.id,g.scope.uid,g.scope.patientId,g.scope.referralId,1,1,g.originalDigest,publicWire(g.logger),publicWire(g.receiver),g.minGeneration,g.maxGeneration,g.epoch,g.notBefore,g.expiresAt,g.envelopes.map(e=>[e.role,e.section,e.keyId,e.digest])];}
function grantRead(v:unknown):Grant{
  array(v,18);
  if(v[0]!==AUTH_DOMAIN||v[1]!=="grant"||v[2]!==1||![v[3],v[4],v[5],v[6]].every(ident)||v[7]!==1||v[8]!==1||!hash(v[9])||!generation(v[12])||!generation(v[13])||v[12]>v[13]||!generation(v[14])||!integer(v[15])||!integer(v[16])||v[16]<=v[15]||v[16]-v[15]>86400000||!Array.isArray(v[17])||v[17].length!==3)throw Error("Invalid or unsupported NFC grant.");
  const logger=publicRead(v[10]),receiver=publicRead(v[11]);
  if(logger.keyId===receiver.keyId)throw Error("Logger and receiver must have distinct identities.");
  const envelopes=v[17].map((e:unknown)=>{
    array(e,4);if(!["logger","receiver"].includes(String(e[0]))||!["a","b"].includes(String(e[1]))||!hash(e[2])||!hash(e[3]))throw Error("Invalid envelope pin.");
    return{role:e[0] as KeyEnvelopePin["role"],section:e[1] as KeyEnvelopePin["section"],keyId:e[2],digest:e[3]};
  });
  const expected=[["logger","b",logger.keyId],["receiver","a",receiver.keyId],["receiver","b",receiver.keyId]];
  if(envelopes.some((e,i)=>JSON.stringify([e.role,e.section,e.keyId])!==JSON.stringify(expected[i]))||new Set(envelopes.map(e=>e.digest)).size!==3)throw Error("Grant must give logger B only and receiver A/B separately.");
  return{id:v[3] as string,scope:{uid:v[4] as string,patientId:v[5] as string,referralId:v[6] as string},originalDigest:v[9],logger,receiver,minGeneration:v[12],maxGeneration:v[13],epoch:v[14],notBefore:v[15],expiresAt:v[16],envelopes};
}
function checkTime(g:Grant,trust:Trust){
  if(!integer(trust.now)||trust.now<g.notBefore||trust.now>=g.expiresAt||g.epoch!==trust.epoch||g.id!==trust.grantId||JSON.stringify(g.scope)!==JSON.stringify({uid:trust.scope.uid,patientId:trust.scope.patientId,referralId:trust.scope.referralId}))throw Error("Grant is expired, revoked by epoch, or outside trusted scope.");
}
export async function signProof(purpose:"grant"|"completion"|"freshness",claims:unknown,device:SharingDevice){
  const payload=bytes(claims),signKey=device.signKey,identity=structuredClone({keyId:device.keyId,encryption:device.encryption,signing:device.signing});
  await checkPublicDevice(identity);
  if(signKey.extractable||signKey.type!=="private")throw Error("Non-extractable signer required.");
  return new CompactSign(payload).setProtectedHeader({alg:"ES256",typ:`${AUTH_DOMAIN}:${purpose}`,kid:identity.keyId}).sign(signKey);
}
export async function verifyProof(token:string,purpose:"grant"|"completion"|"freshness",device:PublicDevice):Promise<unknown>{
  if(typeof token!=="string"||token.length>16384)throw Error("Oversized or missing NFC proof.");
  await checkPublicDevice(device);
  const r=await compactVerify(token,await importJWK(device.signing,"ES256"),{algorithms:["ES256"]});
  if(Object.keys(r.protectedHeader).sort().join(",")!=="alg,kid,typ"||r.protectedHeader.kid!==device.keyId||r.protectedHeader.typ!==`${AUTH_DOMAIN}:${purpose}`||r.payload.length>8192)throw Error("Wrong NFC proof type or key binding.");
  const text=new TextDecoder("utf-8",{fatal:true}).decode(r.payload),value:unknown=JSON.parse(text);
  if(JSON.stringify(value)!==text)throw Error("Noncanonical NFC proof payload.");return value;
}
export async function verifyGrant(token:string,trustInput:Trust){
  const trust=structuredClone(trustInput),g=grantRead(await verifyProof(token,"grant",trust.authority));
  checkTime(g,trust);await checkPublicDevice(g.logger);await checkPublicDevice(g.receiver);return g;
}

// Provisioning candidate helper. Input raw material belongs only to a synthetic
// authorized issuer fixture. No existing non-extractable device key is exported.
export async function sealKeyEnvelope(grantId:string,scope:JournalScope,role:KeyEnvelopePin["role"],section:"a"|"b",recipient:PublicDevice,rawInput:Uint8Array){
  const raw=rawInput.slice(),device=structuredClone(recipient),s=structuredClone(scope);
  if(!ident(grantId)||![s.uid,s.patientId,s.referralId].every(ident)||raw.length!==32||(role==="logger"&&section!=="b")||!["logger","receiver"].includes(role)||!["a","b"].includes(section))throw Error("Invalid section key grant.");
  try{
    await checkPublicDevice(device);
    const material=Array.from(raw,n=>n.toString(16).padStart(2,"0")).join("");
    return await new CompactEncrypt(bytes([AUTH_DOMAIN,"section-key",grantId,s.uid,s.patientId,s.referralId,1,1,role,section,device.keyId,material]))
      .setProtectedHeader({alg:"ECDH-ES",enc:"A256GCM",typ:`${AUTH_DOMAIN}:section-key`,kid:device.keyId}).encrypt(await importJWK(device.encryption,"ECDH-ES"));
  }finally{raw.fill(0);}
}
export async function openKeyEnvelope(input:{grantToken:string;trust:Trust;token:string;device:SharingDevice;role:KeyEnvelopePin["role"];section:"a"|"b"}){
  const {grantToken,token,role,section}=input,device={...structuredClone({keyId:input.device.keyId,encryption:input.device.encryption,signing:input.device.signing}),signKey:input.device.signKey,decryptKey:input.device.decryptKey},trust=structuredClone(input.trust);
  if(typeof token!=="string"||token.length>8192)throw Error("Oversized section key envelope.");
  const g=await verifyGrant(grantToken,trust),target=role==="logger"?g.logger:g.receiver;
  if(device.keyId!==target.keyId||device.decryptKey.extractable)throw Error("Key envelope belongs to a different enrolled device.");
  const pin=g.envelopes.find(e=>e.role===role&&e.section===section&&e.keyId===device.keyId);
  if(!pin||pin.digest!==await tokenDigest(token))throw Error("Key envelope is not pinned by this signed grant.");
  const result=await compactDecrypt(token,device.decryptKey,{keyManagementAlgorithms:["ECDH-ES"],contentEncryptionAlgorithms:["A256GCM"]});
  const h=result.protectedHeader;
  if(Object.keys(h).sort().join(",")!=="alg,enc,epk,kid,typ"||h.typ!==`${AUTH_DOMAIN}:section-key`||h.kid!==device.keyId)throw Error("Wrong key envelope type or recipient.");
  try{
    const v:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(result.plaintext));array(v,12);
    if(!hash(v[11])||JSON.stringify(v.slice(0,11))!==JSON.stringify([AUTH_DOMAIN,"section-key",g.id,g.scope.uid,g.scope.patientId,g.scope.referralId,1,1,role,section,device.keyId]))throw Error("Section key envelope binding differs.");
    const raw=new Uint8Array(v[11].match(/../g)!.map(n=>parseInt(n,16)));
    try{return await crypto.subtle.importKey("raw",raw,"AES-GCM",false,role==="logger"?["encrypt","decrypt"]:["decrypt"]);}finally{raw.fill(0);}
  }finally{result.plaintext.fill(0);}
}

export type LoggerCommitment={grantId:string;grantDigest:string;scope:JournalScope;loggerId:string;receiverId:string;originalDigest:string;generation:number;packetDigest:string;operationId:string;operationDigest:string;imageDigest:string};
export function completionClaims(c:LoggerCommitment){return[AUTH_DOMAIN,"completion",1,c.grantId,c.grantDigest,c.scope.uid,c.scope.patientId,c.scope.referralId,c.loggerId,c.receiverId,c.originalDigest,c.generation,c.packetDigest,c.operationId,c.operationDigest,c.imageDigest];}
export async function verifyCompletion(token:string,grantToken:string,trustInput:Trust){
  const trust=structuredClone(trustInput),g=await verifyGrant(grantToken,trust),v=await verifyProof(token,"completion",g.logger);array(v,16);
  if(v[0]!==AUTH_DOMAIN||v[1]!=="completion"||v[2]!==1||v[3]!==g.id||v[4]!==await tokenDigest(grantToken)||v[5]!==g.scope.uid||v[6]!==g.scope.patientId||v[7]!==g.scope.referralId||v[8]!==g.logger.keyId||v[9]!==g.receiver.keyId||v[10]!==g.originalDigest||!generation(v[11])||v[11]<g.minGeneration||v[11]>g.maxGeneration||!hash(v[12])||!ident(v[13])||!hash(v[14])||!hash(v[15]))throw Error("Logger commitment is outside the signed grant.");
  const commitment:LoggerCommitment={grantId:g.id,grantDigest:v[4] as string,scope:g.scope,loggerId:g.logger.keyId,receiverId:g.receiver.keyId,originalDigest:g.originalDigest,generation:v[11],packetDigest:v[12],operationId:v[13],operationDigest:v[14],imageDigest:v[15]};
  const expected:ExpectedSection={context:{section:"b",dictionaryVersion:1,sequence:commitment.generation,binding:await referralBinding(g.scope.patientId,g.scope.referralId)},packetDigest:commitment.packetDigest};
  return{grant:g,commitment,expected};
}

export type Freshness={grantId:string;grantDigest:string;completionDigest:string;receiverId:string;challenge:string;epoch:number;issuedAt:number;expiresAt:number};
export function freshnessClaims(f:Freshness){return[AUTH_DOMAIN,"freshness",1,f.grantId,f.grantDigest,f.completionDigest,f.receiverId,f.challenge,f.epoch,f.issuedAt,f.expiresAt];}
export async function verifyFreshness(token:string,trustInput:Trust,expected:Omit<Freshness,"issuedAt"|"expiresAt">,challengeCreatedAt:number){
  const trust=structuredClone(trustInput),v=await verifyProof(token,"freshness",trust.authority);array(v,11);
  if(JSON.stringify(v.slice(0,9))!==JSON.stringify(freshnessClaims({...expected,issuedAt:0,expiresAt:0}).slice(0,9))||!hash(v[7])||!integer(v[9])||!integer(v[10])||!integer(trust.now)||!integer(challengeCreatedAt)||v[9]<challengeCreatedAt||trust.now<v[9]||trust.now>=v[10]||v[10]-v[9]>60000||v[10]<=v[9]||trust.now-challengeCreatedAt>=60000||expected.epoch!==trust.epoch)throw Error("Missing, stale or replayed receiver freshness proof.");
  return{...expected,issuedAt:v[9],expiresAt:v[10]} satisfies Freshness;
}

// Counts the actual serialized wire bytes, including base64url, JOSE protected
// headers/ephemeral keys, payloads, signatures/tags, framing and recipient copies.
export function measureAuthorization(grant:string,completion:string,freshness:string,envelopes:readonly string[]){
  const measure=(token:string)=>{
    const parts=token.split("."),decodeLength=(part:string)=>Math.floor(part.length*6/8);
    if(parts.length!==3&&parts.length!==5)throw Error("Unsupported JOSE serialization.");
    return{wireBytes:new TextEncoder().encode(token).length,protectedHeaderBytes:decodeLength(parts[0]),payloadOrCiphertextBytes:decodeLength(parts[parts.length===3?1:3]),signatureOrTagBytes:decodeLength(parts.at(-1)!),nonceBytes:parts.length===5?decodeLength(parts[2]):0,encryptedKeyBytes:parts.length===5?decodeLength(parts[1]):0,delimiterBytes:parts.length-1};
  };
  const details={grant:measure(grant),completion:measure(completion),freshness:measure(freshness),envelopes:envelopes.map(measure)};
  const framed=bytes([AUTH_DOMAIN,"authorization-bundle",1,grant,completion,freshness,[...envelopes]]).length;
  return{...details,tokenBytes:[grant,completion,freshness,...envelopes].reduce((n,t)=>n+new TextEncoder().encode(t).length,0),framedBytes:framed,tagCBytesAvailable:0};
}
