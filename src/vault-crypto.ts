export const VAULT_ITERATIONS = 600_000;
export type Sealed = { version: 1; iv: string; ciphertext: string };
export type VaultEnvelope = Sealed & { salt: string; revision: string };
export function base64(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 8192)
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
export function unbase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
export function newSalt() {
  return base64(crypto.getRandomValues(new Uint8Array(16)));
}
export async function deriveVaultKey(passphrase: string, salt: string) {
  if (passphrase.length < 12 || passphrase.length > 512)
    throw Error("Use a vault passphrase of 12–512 characters.");
  const bytes = unbase64(salt);
  if (bytes.length !== 16) throw Error("Invalid vault salt.");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: bytes,
      iterations: VAULT_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(
  key: CryptoKey,
  data: Uint8Array<ArrayBuffer>,
  context: string,
): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(`matrisync:v1:${context}`),
      tagLength: 128,
    },
    key,
    data,
  );
  return {
    version: 1,
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(ciphertext)),
  };
}
export async function unseal(
  key: CryptoKey,
  value: Sealed,
  context: string,
): Promise<Uint8Array<ArrayBuffer>> {
  if (value.version !== 1 || unbase64(value.iv).length !== 12)
    throw Error("Unsupported or damaged encrypted record.");
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: unbase64(value.iv),
        additionalData: new TextEncoder().encode(`matrisync:v1:${context}`),
        tagLength: 128,
      },
      key,
      unbase64(value.ciphertext),
    ),
  );
}
