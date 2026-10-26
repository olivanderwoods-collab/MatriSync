import {
  CompactEncrypt,
  CompactSign,
  compactDecrypt,
  compactVerify,
  exportJWK,
  generateKeyPair,
  importJWK,
  type JWK,
} from "jose";
import {
  checkProfileSnapshot,
  type SharedProfileSnapshot,
} from "./sharing-profile";

export type SharedContent =
  | { kind: "document"; document: SharedDocument }
  | { kind: "profile"; profile: SharedProfileSnapshot };

export const SHARING_FILE_LIMIT = 256 * 1024;
export type PublicDevice = { encryption: JWK; signing: JWK; keyId: string };
export type SharingDevice = PublicDevice & {
  decryptKey: CryptoKey;
  signKey: CryptoKey;
};
export type TransferContext = {
  id: string;
  channelId: string;
  senderUid: string;
  recipientUid: string;
  senderKeyId: string;
  recipientKeyId: string;
};
export type SharedDocument = {
  name: string;
  type: string;
  bytes: string;
  source: string;
  patientName: string;
  sourcePatientId: string;
  sourceDocumentId: string;
};
export function publicPoint(jwk: JWK): JWK {
  if (
    jwk.kty !== "EC" ||
    jwk.crv !== "P-256" ||
    !/^[A-Za-z0-9_-]{43}$/.test(jwk.x || "") ||
    !/^[A-Za-z0-9_-]{43}$/.test(jwk.y || "") ||
    jwk.d
  )
    throw Error("Invalid public device key.");
  return { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
}
export async function deviceFingerprint(encryption: JWK, signing: JWK) {
  const bytes = new TextEncoder().encode(
    JSON.stringify([publicPoint(encryption), publicPoint(signing)]),
  );
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function checkPublicDevice(device: PublicDevice) {
  if (
    (await deviceFingerprint(device.encryption, device.signing)) !==
    device.keyId
  )
    throw Error("Device fingerprint mismatch.");
  await importJWK(publicPoint(device.encryption), "ECDH-ES");
  await importJWK(publicPoint(device.signing), "ES256");
}
export async function newSharingDevice(): Promise<SharingDevice> {
  const enc = await generateKeyPair("ECDH-ES", {
    crv: "P-256",
    extractable: false,
  });
  const sig = await generateKeyPair("ES256", { extractable: false });
  const encryption = publicPoint(await exportJWK(enc.publicKey)),
    signing = publicPoint(await exportJWK(sig.publicKey));
  return {
    encryption,
    signing,
    keyId: await deviceFingerprint(encryption, signing),
    decryptKey: enc.privateKey,
    signKey: sig.privateKey,
  };
}
export function encodeFile(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > SHARING_FILE_LIMIT)
    throw Error("The sharing pilot accepts nonempty files up to 256 KiB.");
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}
export function decodeFile(base64: string) {
  if (
    typeof base64 !== "string" ||
    base64.length > 350000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
  )
    throw Error("Invalid shared file.");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  if (
    !bytes.length ||
    bytes.length > SHARING_FILE_LIMIT ||
    encodeFile(bytes) !== base64
  )
    throw Error("Invalid shared file.");
  return bytes;
}
function validateDocument(document: SharedDocument) {
  for (const key of [
    "name",
    "type",
    "source",
    "patientName",
    "sourcePatientId",
    "sourceDocumentId",
  ] as const)
    if (
      typeof document[key] !== "string" ||
      document[key].length > (key === "source" ? 500 : 200)
    )
      throw Error("Invalid document metadata.");
  if (
    !document.name ||
    !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
      document.type,
    )
  )
    throw Error("Choose a PDF, PNG, JPEG or WebP document.");
  decodeFile(document.bytes);
}
function sameContext(actual: TransferContext, expected: TransferContext) {
  return (
    [
      "id",
      "channelId",
      "senderUid",
      "recipientUid",
      "senderKeyId",
      "recipientKeyId",
    ] as const
  ).every((k) => actual[k] === expected[k]);
}
export async function encryptTransfer(
  context: TransferContext,
  document: SharedDocument,
  sender: SharingDevice,
  recipient: PublicDevice,
) {
  return encryptContent(
    context,
    { kind: "document", document },
    sender,
    recipient,
  );
}
export async function encryptProfileTransfer(
  context: TransferContext,
  profile: SharedProfileSnapshot,
  sender: SharingDevice,
  recipient: PublicDevice,
) {
  return encryptContent(
    context,
    { kind: "profile", profile },
    sender,
    recipient,
  );
}
async function encryptContent(
  context: TransferContext,
  content: SharedContent,
  sender: SharingDevice,
  recipient: PublicDevice,
) {
  if (content.kind === "document") validateDocument(content.document);
  else
    content = {
      kind: "profile",
      profile: await checkProfileSnapshot(content.profile, context.senderUid),
    };
  await checkPublicDevice(recipient);
  if (
    context.senderKeyId !== sender.keyId ||
    context.recipientKeyId !== recipient.keyId
  )
    throw Error("The approved device keys changed.");
  const payload = new TextEncoder().encode(
    JSON.stringify(
      content.kind === "document"
        ? { version: 1, ...context, document: content.document }
        : { version: 2, ...context, profile: content.profile },
    ),
  );
  const signed = await new CompactSign(payload)
    .setProtectedHeader({
      alg: "ES256",
      typ: `matrisync-${content.kind}+jws`,
      kid: sender.keyId,
    })
    .sign(sender.signKey);
  const encrypted = await new CompactEncrypt(new TextEncoder().encode(signed))
    .setProtectedHeader({
      alg: "ECDH-ES",
      enc: "A256GCM",
      typ: `matrisync-${content.kind}+jwe`,
      kid: recipient.keyId,
    })
    .encrypt(await importJWK(publicPoint(recipient.encryption), "ECDH-ES"));
  if (encrypted.length > 700000)
    throw Error("The encrypted package exceeds the pilot limit.");
  return encrypted;
}
export async function decryptTransfer(
  ciphertext: string,
  expected: TransferContext,
  recipient: SharingDevice,
  sender: PublicDevice,
): Promise<SharedDocument> {
  const content = await decryptSharedTransfer(
    ciphertext,
    expected,
    recipient,
    sender,
  );
  if (content.kind !== "document")
    throw Error("This transfer contains a profile, not an original document.");
  return content.document;
}
export async function decryptSharedTransfer(
  ciphertext: string,
  expected: TransferContext,
  recipient: SharingDevice,
  sender: PublicDevice,
): Promise<SharedContent> {
  if (
    typeof ciphertext !== "string" ||
    ciphertext.length > 700000 ||
    expected.recipientKeyId !== recipient.keyId ||
    expected.senderKeyId !== sender.keyId
  )
    throw Error("Wrong recipient or device key.");
  await checkPublicDevice(sender);
  const opened = await compactDecrypt(ciphertext, recipient.decryptKey, {
    keyManagementAlgorithms: ["ECDH-ES"],
    contentEncryptionAlgorithms: ["A256GCM"],
  });
  if (
    !["matrisync-document+jwe", "matrisync-profile+jwe"].includes(
      opened.protectedHeader.typ || "",
    ) ||
    opened.protectedHeader.kid !== recipient.keyId
  )
    throw Error("Invalid encrypted header.");
  const signed = await compactVerify(
    new TextDecoder().decode(opened.plaintext),
    await importJWK(sender.signing, "ES256"),
    { algorithms: ["ES256"] },
  );
  if (
    signed.protectedHeader.typ !==
      opened.protectedHeader.typ?.replace("+jwe", "+jws") ||
    signed.protectedHeader.kid !== sender.keyId
  )
    throw Error("Invalid sender signature.");
  const payload = JSON.parse(new TextDecoder().decode(signed.payload));
  if (!sameContext(payload, expected))
    throw Error("The signed document does not match this transfer.");
  if (opened.protectedHeader.typ === "matrisync-profile+jwe") {
    if (payload.version !== 2)
      throw Error("Unsupported shared profile version.");
    return {
      kind: "profile",
      profile: await checkProfileSnapshot(payload.profile, expected.senderUid),
    };
  }
  if (payload.version !== 1)
    throw Error("Unsupported shared document version.");
  validateDocument(payload.document);
  return { kind: "document", document: payload.document };
}
