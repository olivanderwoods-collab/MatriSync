import { describe, expect, it } from "vitest";
import { compactVerify } from "jose";
import { newSharingDevice } from "./sharing-crypto";
import { checkIdentityCommand, identityProof, identityVerifier, normalizeIdentityUsername, signIdentityCommand, type IdentityCommand } from "./identity-proof";

const code = "LOCAL-12345678-1234-4234-8234-123456789abc";
const command = (): IdentityCommand => ({ version: 1, requestId: crypto.randomUUID(), issuedAt: new Date().toISOString(),
  uid: "test-mother", keyId: "a".repeat(64), action: "claim", input: { username: "example.mother" }, proof: "b".repeat(64) });
describe("review-stage identity proofs", () => {
  it("normalizes directory lookup without accepting arbitrary path or Unicode aliases", () => {
    expect(normalizeIdentityUsername(" Example.Mother ")).toBe("example.mother");
    for (const value of ["../", "a/b", "ab", "éxample", "x".repeat(65), null])
      expect(() => normalizeIdentityUsername(value)).toThrow();
  });
  it("preserves generated codes and separates verifiers by canonical username", async () => {
    const key = await identityVerifier(" Example.Mother ", code);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(await identityVerifier("example.mother", code)).toBe(key);
    expect(await identityVerifier("different", code)).not.toBe(key);
    expect(await identityVerifier("example.mother", "LOCAL-12345678-1234-4234-8234-123456789abd")).not.toBe(key);
    for (const value of ["123456", "LOCAL-12345678-1234-1234-8234-123456789abc", code.toLowerCase()])
      await expect(identityVerifier("example.mother", value)).rejects.toThrow("Do not replace");
  });
  it("binds proof to account, device, request, operation, username and timestamp", async () => {
    const { proof: _, ...c } = command();
    expect(_).toBeTruthy();
    const verifier = await identityVerifier(c.input.username, code);
    const proof = await identityProof(c, verifier);
    expect(await identityProof({ input: c.input, action: c.action, keyId: c.keyId, uid: c.uid,
      issuedAt: c.issuedAt, requestId: c.requestId, version: 1 }, verifier)).toBe(proof);
    for (const changed of [
      { ...c, uid: "other" }, { ...c, keyId: "c".repeat(64) }, { ...c, requestId: crypto.randomUUID() },
      { ...c, action: "connect" as const }, { ...c, input: { username: "another" } }, { ...c, issuedAt: "2026-01-01T00:00:00.000Z" },
    ]) expect(await identityProof(changed, verifier)).not.toBe(proof);
  });
  it("rejects schema pollution, misplaced secrets, malformed proof and noncanonical wire names", () => {
    for (const value of [{ ...command(), code }, { ...command(), proof: "a" }, { ...command(), version: 2 },
      { ...command(), input: { username: "Example.Mother" } },
      { ...command(), input: { username: "example.mother", verifier: "a".repeat(64) } }])
      expect(() => checkIdentityCommand(value)).toThrow();
  });
  it("signs the canonical request with an enrolled device without including its private key or code", async () => {
    const device = await newSharingDevice();
    const c = { ...command(), keyId: device.keyId };
    const signed = await signIdentityCommand(c, device.signKey);
    const { importJWK } = await import("jose");
    const { payload, protectedHeader } = await compactVerify(signed, await importJWK(device.signing, "ES256"));
    expect(JSON.parse(new TextDecoder().decode(payload))).toEqual(c);
    expect(protectedHeader.kid).toBe(device.keyId);
    expect(new TextDecoder().decode(payload)).not.toContain(code);
  });
});
