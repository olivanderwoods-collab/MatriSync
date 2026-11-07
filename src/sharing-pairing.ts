import type { SharingChannel } from "./sharing-client";

// Public rendezvous information only. Never grants a channel or carries a key.
export function pairingCode(uid: string, keyId: string) {
  return `matrisync-pair-v1:${uid}:${keyId}`;
}
export function matchPairingCode(code: string, uid: string, channels: SharingChannel[]) {
  const match = /^matrisync-pair-v1:([A-Za-z0-9_-]{1,128}):([a-f0-9]{64})$/.exec(code.trim());
  if (!match || match[1] === uid) throw Error("Use the pairing code displayed on the other account's device.");
  const matches = channels.filter(c => c.enabled &&
    ((c.senderUid === uid && c.recipientUid === match[1] && c.recipient.keyId === match[2]) ||
      (c.recipientUid === uid && c.senderUid === match[1] && c.sender.keyId === match[2])));
  if (!matches.length) throw Error("No currently approved connection matches this account and device. Refresh approved connections; pairing cannot grant access.");
  return { channels: matches, fingerprint: match[2], peerUid: match[1] };
}
