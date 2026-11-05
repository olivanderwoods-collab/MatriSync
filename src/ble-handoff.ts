// MatriSync BLE protocol v1. Values fit the default 23-byte ATT MTU.
export const BLE_SERVICE = "d973f2e0-b19e-4a55-a3e6-77c89601a001";
export const BLE_CONTROL = "d973f2e0-b19e-4a55-a3e6-77c89601a002";
export const BLE_DATA = "d973f2e0-b19e-4a55-a3e6-77c89601a003";
export const BLE_STATUS = "d973f2e0-b19e-4a55-a3e6-77c89601a004";
export const HANDOFF_LIMIT = 32768;
export interface BleCharacteristic {
  readValue(): Promise<DataView>;
  writeValueWithResponse(value: Uint8Array<ArrayBuffer>): Promise<void>;
}
export interface BleLink {
  control: BleCharacteristic;
  data: BleCharacteristic;
  status: BleCharacteristic;
  disconnect(): void;
}
export interface BleDevice extends EventTarget {
  name?: string;
  gatt?: {
    connected: boolean;
    disconnect(): void;
    connect(): Promise<{
      getPrimaryService(
        id: string,
      ): Promise<{ getCharacteristic(id: string): Promise<BleCharacteristic> }>;
    }>;
  };
}
export type BluetoothApi = {
  requestDevice(options: {
    filters: { services: string[] }[];
  }): Promise<BleDevice>;
};
export function bluetoothApi() {
  return (navigator as Navigator & { bluetooth?: BluetoothApi }).bluetooth;
}
export async function connectHandoffDevice(): Promise<{
  device: BleDevice;
  link: BleLink;
}> {
  const api = bluetoothApi();
  if (!globalThis.isSecureContext || !api)
    throw Error(
      "BLE needs a supported browser in a secure context (HTTPS or localhost). Open this app in Chrome or Edge with Bluetooth available.",
    );
  // Keep the chooser directly in the button's user-activation call stack.
  const device = await api.requestDevice({
    filters: [{ services: [BLE_SERVICE] }],
  });
  try {
    if (!device.gatt) throw Error("This device has no GATT connection.");
    const server = await timed(device.gatt.connect()),
      service = await timed(server.getPrimaryService(BLE_SERVICE));
    const control = await timed(service.getCharacteristic(BLE_CONTROL)),
      data = await timed(service.getCharacteristic(BLE_DATA)),
      status = await timed(service.getCharacteristic(BLE_STATUS));
    return {
      device,
      link: {
        control,
        data,
        status,
        disconnect: () => device.gatt?.disconnect(),
      },
    };
  } catch (e) {
    device.gatt?.disconnect();
    throw e;
  }
}
async function timed<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Error(
                "BLE operation timed out. Reconnect and retry; no transfer was confirmed.",
              ),
            ),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export function frame(
  command: number,
  length: number,
  bytes = new Uint8Array(),
) {
  const result = new Uint8Array(5 + bytes.length);
  result[0] = command;
  new DataView(result.buffer).setUint32(1, length, true);
  result.set(bytes, 5);
  return result;
}
function bytes(view: DataView) {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
}
export async function readBleStatus(link: BleLink) {
  const raw = bytes(await timed(link.status.readValue()));
  if (raw.length !== 20 || raw[0] !== 1 || raw[1] > 2 || raw[18])
    throw Error(
      "Device rejected the transfer or uses an unsupported protocol. Reconnect before retrying.",
    );
  const view = new DataView(raw.buffer),
    length = view.getUint32(2, true),
    offset = view.getUint32(6, true);
  if (length > HANDOFF_LIMIT || offset > length)
    throw Error("Invalid device length or progress.");
  return { state: raw[1], length, offset, token: raw.slice(10, 18) };
}
const equal = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
async function digest(packet: Uint8Array<ArrayBuffer>) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", packet));
}
export async function readBleHandoff(
  link: BleLink,
  progress: (n: number) => void = () => {},
) {
  try {
    const start = await readBleStatus(link);
    if (start.state !== 2 || !start.length)
      throw Error("No complete handoff is ready on this device.");
    const result = new Uint8Array(start.length);
    for (let offset = 0; offset < result.length; offset += 16) {
      await timed(link.control.writeValueWithResponse(frame(4, offset)));
      const part = bytes(await timed(link.data.readValue())),
        size = Math.min(16, result.length - offset);
      if (
        part.length !== size + 4 ||
        new DataView(part.buffer).getUint32(0, true) !== offset
      )
        throw Error("Device read-back offset or length mismatch.");
      result.set(part.subarray(4), offset);
      progress(Math.round((100 * (offset + size)) / result.length));
    }
    const end = await readBleStatus(link);
    if (
      end.state !== 2 ||
      end.length !== start.length ||
      !equal(end.token, start.token)
    )
      throw Error(
        "The device handoff changed during reading. Nothing was accepted.",
      );
    return result;
  } catch (e) {
    link.disconnect();
    throw e;
  }
}
export async function sendBleHandoff(
  link: BleLink,
  packet: Uint8Array<ArrayBuffer>,
  progress: (n: number) => void = () => {},
) {
  if (!packet.length || packet.length > HANDOFF_LIMIT)
    throw Error(
      "The encrypted handoff exceeds the device's 32 KiB limit. Nothing was truncated or sent.",
    );
  try {
    const token = crypto.getRandomValues(new Uint8Array(8)),
      hash = await digest(packet);
    await timed(
      link.control.writeValueWithResponse(frame(1, packet.length, token)),
    );
    for (let part = 0; part < 2; part++) {
      const message = new Uint8Array(18);
      message[0] = 2;
      message[1] = part;
      message.set(hash.subarray(part * 16, part * 16 + 16), 2);
      await timed(link.control.writeValueWithResponse(message));
    }
    for (let offset = 0; offset < packet.length; offset += 16) {
      const data = new Uint8Array(4 + Math.min(16, packet.length - offset));
      new DataView(data.buffer).setUint32(0, offset, true);
      data.set(packet.subarray(offset, offset + 16), 4);
      await timed(link.data.writeValueWithResponse(data));
      progress(Math.round((50 * (offset + data.length - 4)) / packet.length));
    }
    await timed(link.control.writeValueWithResponse(new Uint8Array([3])));
    const status = await readBleStatus(link);
    if (
      status.state !== 2 ||
      status.length !== packet.length ||
      !equal(status.token, token)
    )
      throw Error("The device did not confirm this exact handoff.");
    const readBack = await readBleHandoff(link, (n) =>
      progress(50 + Math.round(n / 2)),
    );
    if (!equal(await digest(readBack), hash))
      throw Error(
        "Handoff read-back integrity failed. No BLE success was confirmed.",
      );
  } catch (e) {
    link.disconnect();
    throw e;
  }
}
