import { useEffect, useState } from "react";
import { sharingAccount } from "./sharing-client";
import { localSharingDevice } from "./sharing-storage";
import type { SharingDevice } from "./sharing-crypto";
import {
  SharingAssignmentPanel,
  type AssignmentView,
} from "./sharing-assignment-panel";

export function AssignmentWorkspace({
  uid,
  role,
  view,
  profileId,
}: {
  uid: string;
  role: string;
  view: AssignmentView;
  profileId?: string;
}) {
  const [device, setDevice] = useState<SharingDevice>();
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void (async () => {
      await sharingAccount(uid);
      const value = await localSharingDevice(uid);
      await sharingAccount(uid);
      if (live) setDevice(value);
    })().catch((e) => {
      if (live)
        setError(
          e instanceof Error ? e.message : "Unable to open staff access.",
        );
    });
    return () => {
      live = false;
    };
  }, [uid]);
  if (error) return <p role="alert">{error}</p>;
  if (!device) return <p role="status">Opening staff access…</p>;
  return (
    <SharingAssignmentPanel
      key={`${uid}/${role}/${view}/${profileId || ""}`}
      uid={uid}
      role={role}
      device={device}
      view={view}
      profileId={profileId}
    />
  );
}
