// Test peripheral only: no real BLE/NFC claim. Shared by separate test clients.
import type { Page } from "@playwright/test";
import { BLE_CONTROL, BLE_DATA, BLE_STATUS } from "../src/ble-handoff";
export function simulatedPeripheral() {
  let staged = new Uint8Array(),
    committed = new Uint8Array(),
    token = new Uint8Array(8),
    committedToken = token;
  let hash = new Uint8Array(32),
    offset = 0,
    cursor = 0,
    state = 0,
    error = 0;
  const call = async (uuid: string, input?: number[]): Promise<number[]> => {
    if (input) {
      const b = Uint8Array.from(input),
        view = new DataView(b.buffer);
      if (uuid === BLE_CONTROL) {
        if (b[0] === 1 && b.length === 13) {
          const n = view.getUint32(1, true);
          if (!n || n > 32768) throw Error("capacity");
          staged = new Uint8Array(n);
          offset = 0;
          token = b.slice(5);
          hash = new Uint8Array(32);
          state = 1;
          error = 0;
        } else if (b[0] === 2 && b.length === 18 && b[1] < 2)
          hash.set(b.slice(2), b[1] * 16);
        else if (b[0] === 3) {
          const digest = new Uint8Array(
            await crypto.subtle.digest("SHA-256", staged),
          );
          if (offset !== staged.length || digest.some((v, i) => v !== hash[i]))
            error = 1;
          else {
            committed = staged.slice();
            committedToken = token.slice();
            state = 2;
          }
        } else if (b[0] === 4) cursor = view.getUint32(1, true);
        else throw Error("control");
      } else if (uuid === BLE_DATA) {
        const start = view.getUint32(0, true);
        if (
          start !== offset ||
          b.length > 20 ||
          start + b.length - 4 > staged.length
        )
          throw Error("offset");
        staged.set(b.slice(4), offset);
        offset += b.length - 4;
      }
      return [];
    }
    if (uuid === BLE_STATUS) {
      const b = new Uint8Array(20),
        v = new DataView(b.buffer);
      b[0] = 1;
      b[1] = state;
      v.setUint32(2, state === 2 ? committed.length : staged.length, true);
      v.setUint32(6, state === 2 ? committed.length : offset, true);
      b.set(state === 2 ? committedToken : token, 10);
      b[18] = error;
      return [...b];
    }
    if (uuid === BLE_DATA) {
      const b = new Uint8Array(4 + Math.min(16, committed.length - cursor));
      new DataView(b.buffer).setUint32(0, cursor, true);
      b.set(committed.subarray(cursor, cursor + 16), 4);
      return [...b];
    }
    throw Error("characteristic");
  };
  return {
    call,
    packet: () => committed.slice(),
    corrupt: () => {
      committed[committed.length - 5] ^= 1;
    },
  };
}
export async function installPeripheral(
  page: Page,
  peripheral: ReturnType<typeof simulatedPeripheral>,
) {
  await page.exposeFunction("testBleCall", peripheral.call);
  await page.evaluate(() => {
    const call = (
      window as unknown as {
        testBleCall: (uuid: string, bytes?: number[]) => Promise<number[]>;
      }
    ).testBleCall;
    const device = new EventTarget() as EventTarget & {
      name: string;
      gatt: unknown;
    };
    device.name = "TEST PERIPHERAL · No physical BLE";
    const gatt = {
      connected: false,
      async connect() {
        gatt.connected = true;
        return {
          async getPrimaryService() {
            return {
              async getCharacteristic(uuid: string) {
                return {
                  async readValue() {
                    if (!gatt.connected) throw Error("Disconnected");
                    return new DataView(
                      Uint8Array.from(await call(uuid)).buffer,
                    );
                  },
                  async writeValueWithResponse(bytes: Uint8Array) {
                    if (!gatt.connected) throw Error("Disconnected");
                    await call(uuid, [...bytes]);
                  },
                };
              },
            };
          },
        };
      },
      disconnect() {
        gatt.connected = false;
        device.dispatchEvent(new Event("gattserverdisconnected"));
      },
    };
    device.gatt = gatt;
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: { requestDevice: async () => device },
    });
  });
}
