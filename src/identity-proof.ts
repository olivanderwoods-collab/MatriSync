// Review-stage identity protocol. Deliberately not imported by application routes.
// These proofs authorize metadata operations only; they are never record keys.
import { CompactSign } from "jose";

export const IDENTITY_TYPE = "matrisync-identity-command-v1";
const hex = /^[a-f0-9]{64}$/;
const segment = /^[A-Za-z0-9_-]{1,128}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export type IdentityAction = "register" | "claim" | "connect" | "revoke";
export type IdentityInput = {
  username: string;
  sourcePatientId?: string;
  verifier?: string;
  recipientUid?: string;
};
export type IdentityCommand = {
  version: 1;
  requestId: string;
  issuedAt: string;
  uid: string;
  keyId: string;
  action: IdentityAction;
  input: IdentityInput;
  proof: string;
};
function fields(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join() !== [...keys].sort().join())
    throw Error("Invalid identity request fields.");
  return value as Record<string, unknown>;
}
export function normalizeIdentityUsername(value: unknown): string {
  if (typeof value !== "string" || value.length > 80)
    throw Error("Invalid patient username.");
  const result = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(result))
    throw Error("Use a 3–64 character patient username containing letters, numbers, dots, underscores or hyphens.");
  return result;
}
export function checkIdentityCommand(value: unknown): IdentityCommand {
  const c = fields(value, ["version", "requestId", "issuedAt", "uid", "keyId", "action", "input", "proof"]);
  if (c.version !== 1 || typeof c.requestId !== "string" || !uuid.test(c.requestId) ||
      typeof c.uid !== "string" || !segment.test(c.uid) ||
      typeof c.keyId !== "string" || !hex.test(c.keyId) ||
      typeof c.issuedAt !== "string" || !Number.isFinite(Date.parse(c.issuedAt)) ||
      new Date(c.issuedAt).toISOString() !== c.issuedAt ||
      !["register", "claim", "connect", "revoke"].includes(String(c.action)))
    throw Error("Invalid identity request.");
  const action = c.action as IdentityAction;
  const raw = fields(c.input, action === "register"
    ? ["username", "sourcePatientId", "verifier"]
    : action === "revoke" ? ["username", "recipientUid"] : ["username"]);
  const input: IdentityInput = { username: normalizeIdentityUsername(raw.username) };
  // Reject noncanonical wire representations; local identifiers are never rewritten.
  if (input.username !== raw.username) throw Error("Noncanonical patient username.");
  if (action === "register") {
    if (typeof raw.sourcePatientId !== "string" || !segment.test(raw.sourcePatientId) ||
        typeof raw.verifier !== "string" || !hex.test(raw.verifier))
      throw Error("Invalid identity registration.");
    input.sourcePatientId = raw.sourcePatientId;
    input.verifier = raw.verifier;
  }
  if (action === "revoke") {
    if (typeof raw.recipientUid !== "string" || !segment.test(raw.recipientUid))
      throw Error("Invalid access recipient.");
    input.recipientUid = raw.recipientUid;
  }
  if (typeof c.proof !== "string" ||
      (["claim", "connect"].includes(action) ? !hex.test(c.proof) : c.proof !== ""))
    throw Error("Invalid identity proof.");
  return { version: 1, requestId: c.requestId, issuedAt: c.issuedAt,
    uid: c.uid, keyId: c.keyId, action, input, proof: c.proof };
}
export const identityBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const toHex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
export async function identityDigest(value: unknown) {
  return toHex(await crypto.subtle.digest("SHA-256", identityBytes(value)));
}
export async function identityVerifier(username: string, code: string) {
  // Only the existing randomly generated, 122-bit UUID-v4 codes are supported.
  // Short human passwords require a separately reviewed password protocol.
  if (typeof code !== "string" || !code.startsWith("LOCAL-") || !uuid.test(code.slice(6)))
    throw Error("This review-stage protocol requires the existing generated profile code. Do not replace an unsupported code.");
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "HKDF", false, ["deriveBits"]);
  return toHex(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256",
    salt: identityBytes([IDENTITY_TYPE, normalizeIdentityUsername(username)]),
    info: identityBytes("code-verifier-only") }, material, 256));
}
export async function identityProof(command: Omit<IdentityCommand, "proof">, verifier: string) {
  if (!hex.test(verifier)) throw Error("Invalid code verifier.");
  const canonical = checkIdentityCommand({ ...command, proof: "0".repeat(64) });
  const context = { version: canonical.version, requestId: canonical.requestId, issuedAt: canonical.issuedAt,
    uid: canonical.uid, keyId: canonical.keyId, action: canonical.action, input: canonical.input };
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(verifier.match(/../g)!, b => parseInt(b, 16)),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, identityBytes([IDENTITY_TYPE, context])));
}
export async function signIdentityCommand(command: IdentityCommand, signKey: CryptoKey) {
  const checked = checkIdentityCommand(command);
  return new CompactSign(identityBytes(checked))
    .setProtectedHeader({ alg: "ES256", typ: IDENTITY_TYPE, kid: checked.keyId }).sign(signKey);
}
