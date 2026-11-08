export const sharingPilotEnabled =
  (import.meta.env.DEV || import.meta.env.MODE === "submission") && import.meta.env.VITE_SHARING_PILOT === "1";
