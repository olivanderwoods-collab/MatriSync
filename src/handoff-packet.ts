import { HANDOFF_LIMIT } from "./ble-handoff";
import { frameHandoff, unframeHandoff } from "./handoff-frame";
export type HandoffPacket = {
  version: 1;
  channelId: string;
  approvalId: string;
  ciphertext: string;
};
export function parseHandoff(bytes: Uint8Array): HandoffPacket {
  if (!bytes.length || bytes.length > HANDOFF_LIMIT)
    throw Error("Unsupported handoff size.");
  const payload = bytes[0] === 77 ? unframeHandoff(bytes) : bytes;
  const p = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(payload),
  ) as HandoffPacket;
  if (
    !p ||
    p.version !== 1 ||
    Object.keys(p).sort().join(",") !==
      "approvalId,channelId,ciphertext,version" ||
    typeof p.channelId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(p.channelId) ||
    typeof p.approvalId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(p.approvalId) ||
    typeof p.ciphertext !== "string" ||
    !/^[A-Za-z0-9_.-]+$/.test(p.ciphertext) ||
    p.ciphertext.split(".").length !== 5
  )
    throw Error("Unsupported or malformed encrypted handoff.");
  return p;
}
export function encodeHandoff(packet: HandoffPacket) {
  const bytes = new TextEncoder().encode(JSON.stringify(packet));
  if (bytes.length > HANDOFF_LIMIT)
    throw Error(
      "This approved referral is too large for the 32 KiB BLE handoff. Use its organized printed copy, or prepare and approve a shorter version. Nothing was truncated.",
    );
  parseHandoff(bytes);
  return frameHandoff(bytes);
}
