import { useEffect, useRef, useState } from "react";
import {
  bluetoothApi,
  connectHandoffDevice,
  readBleHandoff,
  sendBleHandoff,
  type BleLink,
} from "./ble-handoff";

export function BleHandoffPanel({
  packet,
  onRead,
}: {
  packet?: Uint8Array<ArrayBuffer>;
  onRead?: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>;
}) {
  const connection = useRef<BleLink | undefined>(undefined),
    cleanup = useRef<(() => void) | undefined>(undefined),
    generation = useRef(0);
  const [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const active = generation;
    return () => {
      active.current++;
      cleanup.current?.();
      connection.current?.disconnect();
      connection.current = undefined;
    };
  }, []);
  function disconnect() {
    connection.current?.disconnect();
    connection.current = undefined;
    setName("");
    setNotice("");
  }
  async function connect() {
    const request = ++generation.current;
    cleanup.current?.();
    connection.current?.disconnect();
    connection.current = undefined;
    setName("");
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { device, link } = await connectHandoffDevice();
      if (request !== generation.current) {
        link.disconnect();
        return;
      }
      connection.current = link;
      const lost = () => {
        connection.current = undefined;
        setName("");
        setNotice("");
        setError(
          "BLE disconnected. No unfinished transfer is confirmed. Reconnect and retry.",
        );
      };
      device.addEventListener("gattserverdisconnected", lost);
      cleanup.current = () =>
        device.removeEventListener("gattserverdisconnected", lost);
      setName(device.name || "MatriSync compatible ESP32");
    } catch (e) {
      setError(e instanceof Error ? e.message : "BLE connection failed.");
    } finally {
      setBusy(false);
    }
  }
  async function transfer(send: boolean) {
    const link = connection.current;
    if (!link) return;
    setBusy(true);
    setError("");
    setNotice("");
    setProgress(0);
    try {
      if (send && packet) {
        await sendBleHandoff(link, packet, setProgress);
        if (connection.current !== link)
          throw Error(
            "BLE was cancelled. No active transfer confirmation is shown.",
          );
        setNotice(
          "BLE transfer and exact read-back verified in device RAM. This is not an NFC write or a receiving-team acknowledgement.",
        );
      } else if (!send && onRead) {
        const result = await readBleHandoff(link, setProgress);
        if (connection.current !== link)
          throw Error("BLE was cancelled. Nothing was opened.");
        await onRead(result);
        setNotice(
          "Device packet read and opened for this account. Review the handoff's source-verification status; clinical receiving events remain separate.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Handoff was not confirmed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel"
      aria-label={packet ? "Send handoff over BLE" : "Read handoff over BLE"}
    >
      <h3>
        {packet ? "Send handoff to compatible ESP32" : "Read handoff from compatible ESP32"}
      </h3>
      <p>
        Encrypted handoff using the MatriSync reference GATT protocol. This
        protocol has not yet been integrated with the tested Facility Bridge
        V2.2. Its PN532 tag has only 48 verified bytes, which cannot hold this
        packet. BLE RAM read-back does not confirm NFC storage.
      </p>
      {!bluetoothApi() && (
        <p>
          BLE is unavailable in this browser. Use a Bluetooth-capable Chrome or
          Edge browser on HTTPS or localhost. The organized document remains
          printable.
        </p>
      )}
      {packet && (
        <p>
          Prepared encrypted handoff: {packet.length.toLocaleString()} bytes of
          32,768 available.
        </p>
      )}
      <div className="action-row">
        <button
          className="button secondary"
          disabled={busy || !bluetoothApi()}
          onClick={() => void connect()}
        >
          Connect compatible ESP32
        </button>
        <button
          className="button secondary"
          disabled={!name}
          onClick={disconnect}
        >
          Disconnect / Cancel BLE
        </button>
        {packet && (
          <button
            className="button primary"
            disabled={busy || !name}
            onClick={() => void transfer(true)}
          >
            Send and verify handoff
          </button>
        )}
        {onRead && (
          <button
            className="button secondary"
            disabled={busy || !name}
            onClick={() => void transfer(false)}
          >
            Read and verify handoff
          </button>
        )}
      </div>
      {name && <p>Connected: {name}</p>}
      {busy && <p role="status">Working · {progress}%</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
