import { timingSafeEqual } from "node:crypto";
import { compactVerify, decodeJwt, decodeProtectedHeader, importJWK } from "jose";
import { checkIdentityCommand, identityDigest, identityProof, IDENTITY_TYPE } from "../../src/identity-proof.ts";
import { identityTransaction } from "./local-store.mjs";

const deny = () => ({ ok: false, error: "Identity request denied. No ownership or access change was made." });
const hex = /^[a-f0-9]{64}$/;
const segment = /^[A-Za-z0-9_-]{1,128}$/;
// This module has no production mode. Emulator tokens are unsigned and are not
// production credentials. Device signatures provide the additional actor binding.
async function localAccount(token) {
  if (typeof token !== "string" || token.length > 8192) throw Error("Invalid local authentication.");
  const claims = decodeJwt(token), header = decodeProtectedHeader(token);
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== "none" || claims.aud !== "demo-matrisync" ||
      claims.iss !== "https://securetoken.google.com/demo-matrisync" ||
      !segment.test(claims.sub || "") || !Number.isInteger(claims.exp) || claims.exp <= now ||
      !Number.isInteger(claims.iat) || claims.iat > now + 30 ||
      !Number.isInteger(claims.auth_time) || claims.auth_time > now + 30 ||
      claims.firebase?.sign_in_provider !== "password") throw Error("Invalid local authentication.");
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:lookup?key=emulator-only-key", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw Error("Invalid local authentication.");
  const account = (await response.json()).users?.[0];
  if (!account || account.localId !== claims.sub || account.disabled ||
      Number(account.validSince || 0) > claims.auth_time) throw Error("Invalid local authentication.");
  return claims.sub;
}
async function authority(tx, uid, keyId) {
  const member = await tx.get(`members/${uid}`), device = await tx.get(`deviceRequests/${uid}`);
  if (!member?.enabled || member.keyId !== keyId || !device || device.keyId !== keyId ||
      !["mother", "professional"].includes(member.role)) throw Error("Identity authority denied.");
  const points = [device.encryption, device.signing].map(p => {
    if (!p || Object.keys(p).sort().join() !== "crv,kty,x,y" || p.kty !== "EC" || p.crv !== "P-256" ||
        !/^[A-Za-z0-9_-]{43}$/.test(p.x) || !/^[A-Za-z0-9_-]{43}$/.test(p.y)) throw Error("Invalid enrolled device.");
    return { kty: p.kty, crv: p.crv, x: p.x, y: p.y };
  });
  if (await identityDigest(points) !== keyId) throw Error("Invalid enrolled device.");
  if (member.role === "professional") {
    // Unlike the legacy transport pilot, identity never accepts an unscoped clinician.
    const scope = await tx.get(`credentialScopes/${uid}`), credential = await tx.get(`clinicalCredentials/${uid}`);
    if (!scope?.enabled || scope.staffUid !== uid || scope.staffKeyId !== keyId ||
        !segment.test(scope.facilityUid || "") || scope.facilityUid === uid ||
        !["doctor", "caregiver"].includes(scope.category) || credential?.status !== "approved")
      throw Error("Verified clinical authority required.");
    const facility = await tx.get(`members/${scope.facilityUid}`), approver = await tx.get(`facilityApprovers/${scope.facilityUid}`);
    if (!facility?.enabled || facility.role !== "organization" || facility.keyId !== scope.facilityKeyId ||
        !approver?.enabled || approver.keyId !== scope.facilityKeyId) throw Error("Verified facility authority required.");
  }
  return { role: member.role, device };
}
export async function processIdentityCommand(token, signed) {
  const uid = await localAccount(token);
  if (typeof signed !== "string" || signed.length > 8192) throw Error("Invalid signed command.");
  const header = decodeProtectedHeader(signed);
  if (Object.keys(header).sort().join() !== "alg,kid,typ" || header.alg !== "ES256" ||
      header.typ !== IDENTITY_TYPE || !hex.test(header.kid || "")) throw Error("Invalid identity signature header.");
  return identityTransaction(async tx => {
    const actor = await authority(tx, uid, header.kid);
    const verified = await compactVerify(signed, await importJWK(actor.device.signing, "ES256"), { algorithms: ["ES256"] });
    const c = checkIdentityCommand(JSON.parse(new TextDecoder().decode(verified.payload)));
    if (c.uid !== uid || c.keyId !== header.kid || Math.abs(Date.now() - Date.parse(c.issuedAt)) > 120000)
      throw Error("Expired or mismatched identity command.");
    const now = new Date().toISOString();
    const id = await identityDigest([IDENTITY_TYPE, c.input.username]);
    const requestId = await identityDigest([IDENTITY_TYPE, uid, c.requestId]);
    const digest = await identityDigest(c);
    const receipt = await tx.get(`identityRequests/${requestId}`);
    const identity = await tx.get(`patientIdentities/${id}`);
    const rate = await tx.get(`identityRateLimits/${uid}`);
    const timestamp = Date.now();
    const inWindow = rate && Number.isSafeInteger(rate.startedAt) && timestamp >= rate.startedAt && timestamp - rate.startedAt < 60000;
    if (inWindow && rate.count >= 20) return { ok: false, error: "Too many identity attempts. Try again in a minute." };
    const rateValue = { startedAt: inWindow ? rate.startedAt : timestamp, count: inWindow ? rate.count + 1 : 1 };
    const fail = () => { tx.put(`identityRateLimits/${uid}`, rateValue); return deny(); };
    if (receipt) {
      if (receipt.digest !== digest) return fail();
      tx.put(`identityRateLimits/${uid}`, rateValue);
      // This is an operation receipt, never a claim that a grant is still active.
      return { ...receipt.result, replayed: true };
    }
    let nextIdentity, nextGrant, grantUid, nextOwner, sourceId;
    let outcome;
    if (c.action === "register") {
      if (actor.role === "mother" && c.input.sourcePatientId !== "self") return fail();
      sourceId = await identityDigest(["matrisync-source-profile-v1", uid, c.input.sourcePatientId]);
      const source = await tx.get(`identitySources/${sourceId}`);
      const owner = actor.role === "mother" ? await tx.get(`identityOwners/${uid}`) : undefined;
      if (identity) {
        if (identity.sourceUid !== uid || identity.sourcePatientId !== c.input.sourcePatientId ||
            identity.sourceKeyId !== c.keyId || identity.verifier !== c.input.verifier || source?.identityId !== id) return fail();
        outcome = "already-registered";
      } else {
        if (source || owner) return fail();
        nextIdentity = { version: 1, username: c.input.username, profileId: sourceId,
          sourceUid: uid, sourcePatientId: c.input.sourcePatientId, sourceKeyId: c.keyId,
          verifier: c.input.verifier, ownerUid: actor.role === "mother" ? uid : null,
          createdAt: now, claimedAt: actor.role === "mother" ? now : null };
        if (actor.role === "mother") nextOwner = { identityId: id, profileId: sourceId, claimedAt: now };
        outcome = "registered";
      }
    } else {
      if (!identity) return fail();
      if (c.action === "revoke") {
        if (uid !== identity.ownerUid && !(identity.ownerUid === null && uid === identity.sourceUid)) return fail();
        grantUid = c.input.recipientUid;
        const old = await tx.get(`patientIdentities/${id}/directGrants/${grantUid}`);
        if (!old) return fail();
        nextGrant = { ...old, status: "revoked", updatedAt: now, revokedBy: uid };
        outcome = old.status === "revoked" ? "already-revoked" : "revoked";
      } else {
        const { proof, ...context } = c;
        const expected = await identityProof(context, identity.verifier);
        if (!timingSafeEqual(Buffer.from(proof, "hex"), Buffer.from(expected, "hex"))) return fail();
        if (c.action === "claim") {
          if (actor.role !== "mother" || (identity.ownerUid && identity.ownerUid !== uid)) return fail();
          const owner = await tx.get(`identityOwners/${uid}`);
          if (owner && owner.identityId !== id) return fail();
          if (identity.ownerUid === uid) outcome = "already-owned";
          else {
            // Claiming a clinician-created profile neither merges nor overwrites local records.
            nextIdentity = { ...identity, ownerUid: uid, claimedAt: now };
            nextOwner = { identityId: id, profileId: identity.profileId, claimedAt: now };
            outcome = "claimed";
          }
        } else {
          if (actor.role !== "professional") return fail();
          grantUid = uid;
          const old = await tx.get(`patientIdentities/${id}/directGrants/${uid}`);
          if (old && (old.status !== "active" || old.keyId !== c.keyId)) return fail();
          nextGrant = old || { status: "active", recipientUid: uid, keyId: c.keyId,
            createdAt: now, updatedAt: now, revokedBy: null };
          outcome = old ? "already-connected" : "connected";
        }
      }
    }
    const result = { ok: true, outcome, identityId: id, profileId: (nextIdentity || identity).profileId,
      recordedAt: now, clinicalDelivery: "not-integrated" };
    tx.put(`identityRateLimits/${uid}`, rateValue);
    if (nextIdentity) tx.put(`patientIdentities/${id}`, nextIdentity, !identity);
    if (sourceId && !identity) tx.put(`identitySources/${sourceId}`, { identityId: id }, true);
    if (nextOwner) tx.put(`identityOwners/${uid}`, nextOwner, !identity?.ownerUid);
    if (nextGrant) tx.put(`patientIdentities/${id}/directGrants/${grantUid}`, nextGrant);
    tx.put(`identityRequests/${requestId}`, { digest, result }, true);
    tx.put(`patientIdentities/${id}/events/${requestId}`, { action: c.action, outcome,
      actorUid: uid, actorKeyId: c.keyId, recipientUid: grantUid || null, at: now }, true);
    return result;
  });
}
