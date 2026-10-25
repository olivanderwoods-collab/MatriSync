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
  validateDocument(document);
  await checkPublicDevice(recipient);
  if (
    context.senderKeyId !== sender.keyId ||
    context.recipientKeyId !== recipient.keyId
  )
    throw Error("The approved device keys changed.");
  const payload = new TextEncoder().encode(
    JSON.stringify({ version: 1, ...context, document }),
  );
  const signed = await new CompactSign(payload)
    .setProtectedHeader({
      alg: "ES256",
      typ: "matrisync-document+jws",
      kid: sender.keyId,
    })
    .sign(sender.signKey);
  const encrypted = await new CompactEncrypt(new TextEncoder().encode(signed))
    .setProtectedHeader({
      alg: "ECDH-ES",
      enc: "A256GCM",
      typ: "matrisync-document+jwe",
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
    opened.protectedHeader.typ !== "matrisync-document+jwe" ||
    opened.protectedHeader.kid !== recipient.keyId
  )
    throw Error("Invalid encrypted header.");
  const signed = await compactVerify(
    new TextDecoder().decode(opened.plaintext),
    await importJWK(sender.signing, "ES256"),
    { algorithms: ["ES256"] },
  );
  if (
    signed.protectedHeader.typ !== "matrisync-document+jws" ||
    signed.protectedHeader.kid !== sender.keyId
  )
    throw Error("Invalid sender signature.");
  const payload = JSON.parse(new TextDecoder().decode(signed.payload));
  if (payload.version !== 1 || !sameContext(payload, expected))
    throw Error("The signed document does not match this transfer.");
  validateDocument(payload.document);
  return payload.document;
}
