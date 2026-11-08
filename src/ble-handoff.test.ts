import { it, expect } from "vitest";
import { simulatedPeripheral } from "../tests-sharing/ble-device";
import {
  BLE_CONTROL,
  BLE_DATA,
  BLE_STATUS,
  sendBleHandoff,
  readBleHandoff,
  type BleLink,
} from "./ble-handoff";
import { encodeHandoff, parseHandoff } from "./handoff-packet";
function link(peripheral = simulatedPeripheral()) {
  let connected = true;
  const characteristic = (uuid: string) => ({
    readValue: async () => {
      if (!connected) throw Error("Disconnected");
      return new DataView(Uint8Array.from(await peripheral.call(uuid)).buffer);
    },
    writeValueWithResponse: async (value: Uint8Array) => {
      if (!connected) throw Error("Disconnected");
      await peripheral.call(uuid, [...value]);
    },
  });
  const result: BleLink = {
    control: characteristic(BLE_CONTROL),
    data: characteristic(BLE_DATA),
    status: characteristic(BLE_STATUS),
    disconnect: () => {
      connected = false;
    },
  };
  return { result, peripheral, connected: () => connected };
}
it("writes bounded chunks and verifies complete byte-exact read-back, including the size boundary", async () => {
  const l = link(),
    packet = crypto.getRandomValues(new Uint8Array(32768)),
    progress: number[] = [];
  await sendBleHandoff(l.result, packet, (n) => progress.push(n));
  expect(l.peripheral.packet()).toEqual(packet);
  expect(await readBleHandoff(l.result)).toEqual(packet);
  expect(progress.at(-1)).toBe(100);
  await expect(sendBleHandoff(l.result, new Uint8Array(32769))).rejects.toThrow(
    "limit",
  );
});
it("rejects wrong offsets, corrupt read-back and disconnects without reporting success", async () => {
  for (const failure of ["offset", "corrupt", "disconnect"] as const) {
    const l = link(),
      originalRead = l.result.data.readValue,
      originalWrite = l.result.control.writeValueWithResponse;
    if (failure !== "disconnect")
      l.result.data.readValue = async () => {
        const v = await originalRead();
        v.setUint8(
          failure === "offset" ? 0 : 4,
          v.getUint8(failure === "offset" ? 0 : 4) ^ 1,
        );
        return v;
      };
    else
      l.result.control.writeValueWithResponse = async (v) => {
        await originalWrite(v);
        l.result.disconnect();
      };
    await expect(
      sendBleHandoff(l.result, new Uint8Array([1, 2, 3])),
    ).rejects.toThrow();
    expect(l.connected()).toBe(false);
  }
});
it("requires a complete ready packet and strict encrypted handoff structure", async () => {
  await expect(readBleHandoff(link().result)).rejects.toThrow("No complete");
  const packet = {
    version: 1 as const,
    channelId: "channel",
    approvalId: "approval",
    ciphertext: "header..iv.cipher.tag",
  };
  expect(parseHandoff(encodeHandoff(packet))).toEqual(packet);
  for (const p of [
    { ...packet, version: 2 },
    { ...packet, channelId: "../foreign" },
    { ...packet, profileCode: "secret" },
    { ...packet, ciphertext: "plaintext" },
  ])
    expect(() =>
      parseHandoff(new TextEncoder().encode(JSON.stringify(p))),
    ).toThrow();
  expect(() =>
    encodeHandoff({ ...packet, ciphertext: "a".repeat(33000) }),
  ).toThrow("too large");
});
