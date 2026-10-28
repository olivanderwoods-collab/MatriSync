const key = (uid: string) => `matrisync.ruhi.profile-context.${uid}`;
// Only this account's boolean preference is stored, never profile/chat content.
export function profileContextEnabled(uid?: string): boolean {
  if (!uid) return false;
  try {
    const saved = localStorage.getItem(key(uid));
    return saved === null || saved === "enabled";
  } catch {
    return false;
  }
}
export function saveProfileContextPreference(
  uid: string | undefined,
  enabled: boolean,
) {
  if (!uid) return false;
  try {
    localStorage.setItem(key(uid), enabled ? "enabled" : "disabled");
    return true;
  } catch {
    return false;
  }
}
