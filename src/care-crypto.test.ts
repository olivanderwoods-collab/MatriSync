import "fake-indexeddb/auto";
import {describe,expect,it} from "vitest";
import {CompactEncrypt,importJWK} from "jose";
import {existingSharingDevice,localSharingDevice} from "./sharing-storage";
import {newSharingDevice} from "./sharing-crypto";
import {jsonBytes,unwrapCare,unwrapCareBytes,wrapCare} from "./care-crypto";

describe("care decryption preserves device identity",()=>{
  it("leaves an absent identity absent when opening encrypted saved data",async()=>{
    const uid=crypto.randomUUID(),original=await newSharingDevice();
    const envelope=await wrapCare({id:"synthetic-case",reason:"Original text"},original);
    await expect(unwrapCare(uid,envelope)).rejects.toThrow("No replacement key was created");
    await expect(unwrapCareBytes(uid,envelope)).rejects.toThrow("saved device key is missing");
    expect(await existingSharingDevice(uid)).toBeUndefined();
  });
  it("does not generate an identity while rejecting an invalid received packet",async()=>{
    const uid=crypto.randomUUID();
    await expect(unwrapCareBytes(uid,"broken-packet")).rejects.toThrow("saved device key is missing");
    expect(await existingSharingDevice(uid)).toBeUndefined();
  });
  it("reads exact data using the existing non-extractable key",async()=>{
    const uid=crypto.randomUUID(),device=await localSharingDevice(uid);
    const original={id:"synthetic-case",reason:"Original\nmanual text",missing:"",packet:"unchanged"};
    const envelope=await wrapCare(original,device);
    expect(await unwrapCare(uid,envelope)).toEqual(original);
    expect((await existingSharingDevice(uid))?.keyId).toBe(device.keyId);
    expect((await existingSharingDevice(uid))?.decryptKey.extractable).toBe(false);
  });
  it("does not replace a different local identity on decryption failure",async()=>{
    const uid=crypto.randomUUID(),local=await localSharingDevice(uid),other=await newSharingDevice();
    await expect(unwrapCare(uid,await wrapCare({id:"other-case"},other))).rejects.toThrow();
    expect((await existingSharingDevice(uid))?.keyId).toBe(local.keyId);
  });
  it("still rejects encrypted envelopes with the wrong purpose or key identifier",async()=>{
    const uid=crypto.randomUUID(),device=await localSharingDevice(uid);
    for(const [typ,kid] of [["another-purpose",device.keyId],["matrisync-care+jwe","another-key"]]){
      const envelope=await new CompactEncrypt(jsonBytes({id:"synthetic-case"})).setProtectedHeader({alg:"ECDH-ES",enc:"A256GCM",typ,kid}).encrypt(await importJWK(device.encryption,"ECDH-ES"));
      await expect(unwrapCare(uid,envelope)).rejects.toThrow("another enrolled device");
      expect((await existingSharingDevice(uid))?.keyId).toBe(device.keyId);
    }
  });
});
