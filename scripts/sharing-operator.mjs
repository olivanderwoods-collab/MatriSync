// Explicit local-emulator operator. Never accepts a live service URL or credentials.
import { createHash } from "node:crypto";
import { importJWK } from "jose";
import { pathToFileURL } from "node:url";
const root =
  "http://127.0.0.1:8087/v1/projects/demo-matrisync/databases/(default)/documents";
function segment(value) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value || ""))
    throw Error("Invalid account/connection identifier.");
  return value;
}
function encode(value) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (Array.isArray(value))
    return { arrayValue: { values: value.map(encode) } };
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, encode(v)]),
      ),
    },
  };
}
function decode(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
  return Object.fromEntries(
    Object.entries(value.mapValue?.fields || {}).map(([k, v]) => [
      k,
      decode(v),
    ]),
  );
}
export async function operatorRead(path) {
  const response = await fetch(`${root}/${path}`, {
    headers: { Authorization: "Bearer owner" },
  });
  if (response.status === 404) return undefined;
  if (!response.ok)
    throw Error(`Local relay read failed (${response.status}).`);
  const json = await response.json();
  return decode({ mapValue: { fields: json.fields } });
}
export async function operatorWrite(path, value, createOnly = false) {
  const response = await fetch(
    `${root}/${path}${createOnly ? "?currentDocument.exists=false" : ""}`,
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer owner",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: encode(value).mapValue.fields }),
    },
  );
  if (!response.ok)
    throw Error(`Local relay write failed (${response.status}).`);
}
async function verifiedRequest(uid, expected) {
  segment(uid);
  if (!/^[a-f0-9]{64}$/.test(expected || ""))
    throw Error(
      "Supply the fingerprint obtained from the account's own device.",
    );
  const device = await operatorRead(`deviceRequests/${uid}`);
  if (!device) throw Error("The account must request enrollment first.");
  const points = [device.encryption, device.signing].map((p) => {
    if (
      !p ||
      Object.keys(p).sort().join(",") !== "crv,kty,x,y" ||
      p.kty !== "EC" ||
      p.crv !== "P-256" ||
      !/^[A-Za-z0-9_-]{43}$/.test(p.x) ||
      !/^[A-Za-z0-9_-]{43}$/.test(p.y)
    )
      throw Error("Invalid public device key.");
    return { kty: p.kty, crv: p.crv, x: p.x, y: p.y };
  });
  await importJWK(points[0], "ECDH-ES");
  await importJWK(points[1], "ES256");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(points))
    .digest("hex");
  if (fingerprint !== expected || device.keyId !== expected)
    throw Error("Fingerprint does not match the device's public keys.");
  return device;
}
export async function approveMember(uid, role, fingerprint) {
  if (!["mother", "professional", "organization"].includes(role))
    throw Error("Choose mother, professional or organization.");
  await verifiedRequest(uid, fingerprint);
  const old = await operatorRead(`members/${uid}`);
  if (old && (old.keyId !== fingerprint || old.role !== role || !old.enabled))
    throw Error(
      "Existing membership differs or is revoked. Recovery/reinstatement needs a separate review.",
    );
  await operatorWrite(`members/${uid}`, {
    enabled: true,
    role,
    keyId: fingerprint,
  });
}
export async function approveChannel(
  id,
  senderUid,
  recipientUid,
  assignmentRouteId,
) {
  segment(id);
  segment(senderUid);
  segment(recipientUid);
  if (senderUid === recipientUid || (await operatorRead(`channels/${id}`)))
    throw Error("Use a new connection ID between distinct accounts.");
  const from = await operatorRead(`members/${senderUid}`),
    to = await operatorRead(`members/${recipientUid}`);
  if (!from?.enabled || !to?.enabled)
    throw Error("Both accounts must be explicitly approved first.");
  const sender = await verifiedRequest(senderUid, from.keyId),
    recipient = await verifiedRequest(recipientUid, to.keyId);
  if (assignmentRouteId) {
    segment(assignmentRouteId);
    const route = await operatorRead(`assignmentRoutes/${assignmentRouteId}`);
    if (
      !route?.enabled ||
      route.sourceUid !== senderUid ||
      route.staffUid !== recipientUid ||
      route.sourceKeyId !== sender.keyId ||
      route.staffKeyId !== recipient.keyId
    )
      throw Error("Assignment scope does not match the connection.");
  }
  await operatorWrite(
    `channels/${id}`,
    {
      enabled: true,
      members: [senderUid, recipientUid],
      senderUid,
      recipientUid,
      sender,
      recipient,
      ...(assignmentRouteId ? { assignmentRouteId } : {}),
    },
    true,
  );
}
// Controlled approval of one facility-patient-staff scope. This does not assign
// the patient: the facility must offer it and the named staff must accept it.
export async function approveAssignmentRoute(
  id,
  sourceUid,
  sourcePatientId,
  facilityUid,
  staffUid,
) {
  for (const value of [id, sourceUid, sourcePatientId, facilityUid, staffUid])
    segment(value);
  if (new Set([sourceUid, facilityUid, staffUid]).size !== 3)
    throw Error("Use three distinct approved test accounts.");
  const source = await operatorRead(`members/${sourceUid}`),
    facility = await operatorRead(`members/${facilityUid}`),
    staff = await operatorRead(`members/${staffUid}`);
  if (
    !source?.enabled ||
    !["mother", "professional"].includes(source.role) ||
    !facility?.enabled ||
    facility.role !== "organization" ||
    !staff?.enabled ||
    staff.role !== "professional"
  )
    throw Error(
      "Approve the source, facility and professional before this scope.",
    );
  await verifiedRequest(sourceUid, source.keyId);
  await verifiedRequest(facilityUid, facility.keyId);
  await verifiedRequest(staffUid, staff.keyId);
  const profileId = createHash("sha256")
    .update(
      JSON.stringify([
        "matrisync-source-profile-v1",
        sourceUid,
        sourcePatientId,
      ]),
    )
    .digest("hex");
  await operatorWrite(
    `assignmentRoutes/${id}`,
    {
      enabled: true,
      participants: [sourceUid, facilityUid, staffUid],
      sourceUid,
      sourcePatientId,
      profileId,
      facilityUid,
      staffUid,
      sourceKeyId: source.keyId,
      facilityKeyId: facility.keyId,
      staffKeyId: staff.keyId,
    },
    true,
  );
  return profileId;
}
export async function revokeChannel(id) {
  segment(id);
  const channel = await operatorRead(`channels/${id}`);
  if (!channel) throw Error("Connection not found.");
  await operatorWrite(`channels/${id}`, { ...channel, enabled: false });
}
export async function revokeMember(uid) {
  segment(uid);
  const member = await operatorRead(`members/${uid}`);
  if (!member) throw Error("Member not found.");
  await operatorWrite(`members/${uid}`, { ...member, enabled: false });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [action, ...args] = process.argv.slice(2);
  const actions = {
    approve: approveMember,
    connect: approveChannel,
    "approve-assignment-scope": approveAssignmentRoute,
    "revoke-connection": revokeChannel,
    "revoke-account": revokeMember,
  };
  try {
    if (!actions[action])
      throw Error(
        "Usage: approve <uid> <role> <device-fingerprint> | approve-assignment-scope <id> <source-uid> <source-patient-id> <facility-uid> <staff-uid> | connect <connection-id> <sender-uid> <recipient-uid> [assignment-scope-id] | revoke-connection <id> | revoke-account <uid>",
      );
    await actions[action](...args);
    console.log(
      "Local sharing-pilot operator action completed. No live service was contacted.",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
