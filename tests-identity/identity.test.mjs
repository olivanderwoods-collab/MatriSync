import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { CompactSign } from "jose";
import { request } from "node:http";
import { identityServer } from "../scripts/identity/server.mjs";
import { identityTransaction } from "../scripts/identity/local-store.mjs";
import { approveMember, approveTestFacility, approveCredentialScope, operatorWrite } from "../scripts/sharing-operator.mjs";
import { newSharingDevice } from "../src/sharing-crypto.ts";
import { identityVerifier, identityProof, identityDigest, signIdentityCommand, IDENTITY_TYPE } from "../src/identity-proof.ts";

let server, facility, doctor, secondDoctor, mother, otherMother, unverified;
const code = () => `LOCAL-${crypto.randomUUID()}`;
async function account(role) {
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only-key", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `identity-${crypto.randomUUID()}@example.test`, password: "Synthetic-test-42!", returnSecureToken: true }),
  });
  expect(response.ok).toBe(true);
  const auth = await response.json(), device = await newSharingDevice();
  await operatorWrite(`deviceRequests/${auth.localId}`, { encryption: device.encryption, signing: device.signing, keyId: device.keyId }, true);
  await approveMember(auth.localId, role, device.keyId);
  return { uid: auth.localId, token: auth.idToken, device };
}
async function verifyProfessional(actor) {
  await approveCredentialScope(actor.uid, facility.uid, "doctor");
  const event = crypto.randomUUID(), at = new Date().toISOString();
  await operatorWrite(`clinicalCredentials/${actor.uid}`, { status: "approved", createdAt: at, updatedAt: at, updatedBy: facility.uid, lastEventId: event });
  await operatorWrite(`clinicalCredentials/${actor.uid}/events/${event}`, { status: "approved", actorUid: facility.uid, at, previousEventId: "" });
}
async function command(actor, action, input, secret, overrides = {}) {
  const base = { version: 1, requestId: crypto.randomUUID(), issuedAt: new Date().toISOString(),
    uid: actor.uid, keyId: actor.device.keyId, action, input, ...overrides };
  return { ...base, proof: secret ? await identityProof(base, await identityVerifier(input.username, secret)) : "" };
}
async function send(actor, c, options = {}) {
  const signed = options.signed || await signIdentityCommand(c, actor.device.signKey);
  const response = await fetch("http://127.0.0.1:4180/v1/command", { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.token || actor.token}`, ...options.headers },
    body: JSON.stringify({ signedCommand: signed }) });
  return { status: response.status, body: await response.json() };
}
const read = path => identityTransaction(tx => tx.get(path));
async function registered(actor = doctor, sourcePatientId = crypto.randomUUID()) {
  const username = `identity-${crypto.randomUUID()}`, secret = code();
  const input = { username, sourcePatientId, verifier: await identityVerifier(username, secret) };
  const c = await command(actor, "register", input);
  const result = await send(actor, c);
  expect(result.status).toBe(200);
  return { username, secret, c, id: result.body.identityId, profileId: result.body.profileId };
}
beforeAll(async () => {
  server = identityServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(4180, "127.0.0.1", resolve); });
  facility = await account("organization");
  await approveTestFacility(facility.uid, facility.device.keyId);
  [doctor, secondDoctor, mother, otherMother, unverified] = await Promise.all([
    account("professional"), account("professional"), account("mother"), account("mother"), account("professional"),
  ]);
  await verifyProfessional(doctor);
  await verifyProfessional(secondDoctor);
});
afterAll(async () => { if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); });

describe("local authoritative identity metadata", () => {
  it("atomically registers a unique username/source, preserves IDs and safely retries", async () => {
    const p = await registered();
    expect(p.profileId).toBe(await identityDigest(["matrisync-source-profile-v1", doctor.uid, p.c.input.sourcePatientId]));
    expect((await send(doctor, p.c)).body).toMatchObject({ ok: true, replayed: true, outcome: "registered" });
    const duplicateSource = { ...p.c.input, username: `different-${crypto.randomUUID()}` };
    expect((await send(doctor, await command(doctor, "register", duplicateSource))).status).toBe(403);
    expect((await send(secondDoctor, await command(secondDoctor, "register", p.c.input))).status).toBe(403);
    expect((await read(`patientIdentities/${p.id}`)).sourceUid).toBe(doctor.uid);
    const altered = await command(doctor, "register", { ...p.c.input, verifier: "f".repeat(64) }, undefined, { requestId: p.c.requestId });
    expect((await send(doctor, altered)).status).toBe(403);
  });
  it("allows exactly one concurrent first Mother claim and preserves the original source", async () => {
    const p = await registered();
    const commands = await Promise.all([mother, otherMother].map(a => command(a, "claim", { username: p.username }, p.secret)));
    const results = await Promise.all([send(mother, commands[0]), send(otherMother, commands[1])]);
    expect(results.map(r => r.status).sort()).toEqual([200, 403]);
    const owner = results[0].status === 200 ? mother : otherMother;
    const loser = owner === mother ? otherMother : mother;
    const identity = await read(`patientIdentities/${p.id}`);
    expect(identity).toMatchObject({ ownerUid: owner.uid, sourceUid: doctor.uid, profileId: p.profileId, verifier: p.c.input.verifier });
    expect((await send(loser, await command(loser, "claim", { username: p.username }, p.secret))).status).toBe(403);
    expect((await send(owner, await command(owner, "claim", { username: p.username }, p.secret))).body.outcome).toBe("already-owned");
    const another = await registered();
    expect((await send(owner, await command(owner, "claim", { username: another.username }, another.secret))).status).toBe(403);
    expect(await read(`identityOwners/${owner.uid}`)).toMatchObject({ identityId: p.id });
    expect((await read(`patientIdentities/${another.id}`)).ownerUid).toBeNull();
  });
  it("serializes competing username registrations without replacing either source record", async () => {
    const username = `race-${crypto.randomUUID()}`, secret = code();
    const verifier = await identityVerifier(username, secret);
    const commands = await Promise.all([doctor, secondDoctor].map(a => command(a, "register", {
      username, verifier, sourcePatientId: crypto.randomUUID(),
    })));
    const results = await Promise.all([send(doctor, commands[0]), send(secondDoctor, commands[1])]);
    expect(results.map(r => r.status).sort()).toEqual([200, 403]);
    const winner = results[0].status === 200 ? 0 : 1;
    const actors = [doctor, secondDoctor];
    const record = await read(`patientIdentities/${results[winner].body.identityId}`);
    expect(record).toMatchObject({ sourceUid: actors[winner].uid, sourcePatientId: commands[winner].input.sourcePatientId, verifier });
    const loserId = await identityDigest(["matrisync-source-profile-v1", actors[1-winner].uid, commands[1-winner].input.sourcePatientId]);
    expect(await read(`identitySources/${loserId}`)).toBeUndefined();
  });
  it("denies wrong codes, foreign signatures, mismatched accounts, stale requests and schema pollution", async () => {
    const p = await registered();
    expect((await send(secondDoctor, await command(secondDoctor, "connect", { username: p.username }, code()))).status).toBe(403);
    const c = await command(secondDoctor, "connect", { username: p.username }, p.secret);
    expect((await send(doctor, c, { signed: await signIdentityCommand(c, secondDoctor.device.signKey) })).status).toBe(403);
    expect((await send(secondDoctor, c, { signed: await signIdentityCommand(c, doctor.device.signKey) })).status).toBe(403);
    const expired = await command(secondDoctor, "connect", { username: p.username }, p.secret, { issuedAt: "2026-01-01T00:00:00.000Z" });
    expect((await send(secondDoctor, expired)).status).toBe(403);
    const polluted = await new CompactSign(new TextEncoder().encode(JSON.stringify({ ...c, code: p.secret })))
      .setProtectedHeader({ alg: "ES256", typ: IDENTITY_TYPE, kid: secondDoctor.device.keyId }).sign(secondDoctor.device.signKey);
    expect((await send(secondDoctor, c, { signed: polluted })).status).toBe(403);
    expect(await read(`patientIdentities/${p.id}/directGrants/${secondDoctor.uid}`)).toBeUndefined();
  });
  it("creates an independent direct grant and permanently denies code regrant after revocation", async () => {
    const p = await registered();
    const c = await command(secondDoctor, "connect", { username: p.username }, p.secret);
    expect((await send(secondDoctor, c)).body).toMatchObject({ outcome: "connected", clinicalDelivery: "not-integrated" });
    const revoked = await send(doctor, await command(doctor, "revoke", { username: p.username, recipientUid: secondDoctor.uid }));
    expect(revoked.body.outcome).toBe("revoked");
    expect((await send(secondDoctor, await command(secondDoctor, "connect", { username: p.username }, p.secret))).status).toBe(403);
    // Replaying a successful old request only returns its historical receipt.
    expect((await send(secondDoctor, c)).body.replayed).toBe(true);
    expect((await read(`patientIdentities/${p.id}/directGrants/${secondDoctor.uid}`)).status).toBe("revoked");
    expect(await read(`channels/${p.id}`)).toBeUndefined();
    expect(await read(`assignmentRoutes/${p.id}`)).toBeUndefined();
  });
  it("requires current scoped credentials, approved devices and permitted roles", async () => {
    const p = await registered();
    expect((await send(unverified, await command(unverified, "connect", { username: p.username }, p.secret))).status).toBe(403);
    expect((await send(facility, await command(facility, "claim", { username: p.username }, p.secret))).status).toBe(403);
    expect((await send(secondDoctor, await command(secondDoctor, "claim", { username: p.username }, p.secret))).status).toBe(403);
    const original = await read(`clinicalCredentials/${secondDoctor.uid}`);
    await operatorWrite(`clinicalCredentials/${secondDoctor.uid}`, { ...original, status: "suspended" });
    expect((await send(secondDoctor, await command(secondDoctor, "connect", { username: p.username }, p.secret))).status).toBe(403);
    await operatorWrite(`clinicalCredentials/${secondDoctor.uid}`, original);
    const approval = await read(`members/${secondDoctor.uid}`);
    await operatorWrite(`members/${secondDoctor.uid}`, { ...approval, keyId: "a".repeat(64) });
    expect((await send(secondDoctor, await command(secondDoctor, "connect", { username: p.username }, p.secret))).status).toBe(403);
    await operatorWrite(`members/${secondDoctor.uid}`, approval);
  });
  it("moves revocation authority to the first Mother owner without changing the source identity", async () => {
    const owner = await account("mother"), p = await registered();
    expect((await send(secondDoctor, await command(secondDoctor, "connect", { username: p.username }, p.secret))).status).toBe(200);
    expect((await send(owner, await command(owner, "claim", { username: p.username }, p.secret))).status).toBe(200);
    const input = { username: p.username, recipientUid: secondDoctor.uid };
    expect((await send(doctor, await command(doctor, "revoke", input))).status).toBe(403);
    expect((await send(owner, await command(owner, "revoke", input))).body.outcome).toBe("revoked");
    expect((await read(`patientIdentities/${p.id}`)).sourceUid).toBe(doctor.uid);
    expect((await read(`patientIdentities/${p.id}/directGrants/${secondDoctor.uid}`)).revokedBy).toBe(owner.uid);
  });
  it("denies browser origins, unexpected hosts and unauthenticated callers without echoing secrets", async () => {
    const p = await registered();
    for (const headers of [{ Origin: "http://127.0.0.1:4175" }, { "Sec-Fetch-Site": "cross-site" }])
      expect((await send(doctor, p.c, { headers })).status).toBe(403);
    // Node fetch rewrites Host; use an actual HTTP header for the rebinding check.
    const hostStatus = await new Promise((resolve, reject) => {
      const req = request("http://127.0.0.1:4180/v1/command", { method: "POST", headers: { Host: "attacker.example:4180" } }, res => {
        res.resume(); res.on("end", () => resolve(res.statusCode));
      });
      req.on("error", reject); req.end();
    });
    expect(hostStatus).toBe(403);
    const response = await send(doctor, p.c, { token: "not-a-token" });
    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).not.toContain(p.c.input.verifier);
    const stored = JSON.stringify(await read(`patientIdentities/${p.id}`));
    expect(stored).not.toContain(p.secret);
    expect(stored).not.toContain('"d":');
    expect(stored).not.toContain("patientName");
    const parts = doctor.token.split(".");
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    for (const changed of [{ ...claims, aud: "a-live-project" }, { ...claims, exp: 1 }, { ...claims, sub: mother.uid }]) {
      const token = [parts[0], Buffer.from(JSON.stringify(changed)).toString("base64url"), ""].join(".");
      expect((await send(doctor, p.c, { token })).status).toBe(403);
    }
  });
  it("persists ownership across service restart and rate limits authenticated attempts", async () => {
    const uniqueMother = await account("mother");
    const p = await registered(uniqueMother, "self");
    expect((await read(`patientIdentities/${p.id}`)).ownerUid).toBe(uniqueMother.uid);
    await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
    server = identityServer();
    await new Promise(resolve => server.listen(4180, "127.0.0.1", resolve));
    expect((await send(uniqueMother, p.c)).body.replayed).toBe(true);
    const testDoctor = await account("professional");
    await verifyProfessional(testDoctor);
    const wrongCode = code();
    for (let i = 0; i < 20; i++) {
      const response = await send(testDoctor, await command(testDoctor, "connect", { username: p.username }, wrongCode));
      expect(response.body.error).toContain("Identity request denied");
    }
    expect((await read(`identityRateLimits/${testDoctor.uid}`)).count).toBe(20);
    await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
    server = identityServer();
    await new Promise(resolve => server.listen(4180, "127.0.0.1", resolve));
    expect((await send(testDoctor, await command(testDoctor, "connect", { username: p.username }, p.secret))).body.error).toContain("Too many");
    expect(await read(`patientIdentities/${p.id}/directGrants/${testDoctor.uid}`)).toBeUndefined();
  });
});
