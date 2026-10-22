import { OFFLINE_MODEL } from "./config";
export type Capability = {
  supported: boolean;
  message: string;
  availableBytes?: number;
};
export async function capability(): Promise<Capability> {
  try {
    if (!isSecureContext || !("gpu" in navigator) || !("caches" in globalThis))
      return {
        supported: false,
        message:
          "Offline AI needs a secure browser with WebGPU and local cache support.",
      };
    const gpu = navigator.gpu as {
      requestAdapter: () => Promise<{
        features: { has: (value: string) => boolean };
      } | null>;
    };
    const adapter = await gpu.requestAdapter();
    if (!adapter?.features.has("shader-f16"))
      return {
        supported: false,
        message:
          "This device does not support the WebGPU features required by this model.",
      };
    const storage = await navigator.storage?.estimate();
    const availableBytes =
      storage?.quota !== undefined && storage?.usage !== undefined
        ? Math.max(0, storage.quota - storage.usage)
        : undefined;
    return {
      supported: true,
      message:
        "WebGPU detected. Model initialization will check available memory.",
      availableBytes,
    };
  } catch {
    return {
      supported: false,
      message:
        "Device compatibility could not be checked. The rest of MatriSync remains available.",
    };
  }
}
export async function installed() {
  if (!(await caches.has(OFFLINE_MODEL.cache))) return false;
  const cache = await caches.open(OFFLINE_MODEL.cache);
  return (
    (await (
      await cache.match(`${location.origin}/offline-ai-installed`)
    )?.text()) === OFFLINE_MODEL.revision
  );
}
export async function removeModel() {
  await caches.delete(OFFLINE_MODEL.cache);
}
export function modelWorker() {
  return new Worker(new URL("./offline.worker.ts", import.meta.url), {
    type: "module",
  });
}
export const mb = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;
