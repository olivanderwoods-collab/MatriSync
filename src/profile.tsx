import { useState } from "react";
export type Profile = { name: string; photo: string };
export const defaultProfile: Profile = { name: "Ophelia Frost", photo: "" };

export function ProfileEditor({
  profile,
  save,
  photoOnly = false,
}: {
  profile: Profile;
  save: (p: Profile) => void;
  photoOnly?: boolean;
}) {
  const [draft, setDraft] = useState(profile);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function photo(file?: File) {
    if (!file) return;
    setMessage("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setMessage("Choose a JPG, PNG or WebP image smaller than 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 192;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error();
      const side = Math.min(bitmap.width, bitmap.height);
      ctx.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        192,
        192,
      );
      bitmap.close();
      setDraft((p) => ({ ...p, photo: canvas.toDataURL("image/jpeg", 0.85) }));
    } catch {
      setMessage("This image could not be opened. Try another image.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel profile-editor">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if ((!photoOnly && !draft.name.trim()) || busy) return;
          save(
            photoOnly
              ? { ...profile, photo: draft.photo }
              : { ...draft, name: draft.name.trim() },
          );
          setMessage("Profile saved for this tab.");
        }}
      >
        <div className="profile-photo-preview">
          {draft.photo ? (
            <img src={draft.photo} alt="Your profile" />
          ) : (
            <span>{draft.name.trim().charAt(0) || "M"}</span>
          )}
        </div>
        <label htmlFor="profile-photo">Profile picture</label>
        <input
          id="profile-photo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => {
            void photo(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {!photoOnly && (
          <>
            <label htmlFor="profile-name">Name</label>
            <input
              id="profile-name"
              value={draft.name}
              maxLength={80}
              required
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </>
        )}
        <button
          className="button primary"
          disabled={busy || (!photoOnly && !draft.name.trim())}
        >
          {busy
            ? "Preparing photo…"
            : photoOnly
              ? "Save picture"
              : "Save Profile"}
        </button>
        <p className="small">
          Saved in this tab only. Photos are not uploaded.
        </p>
        {message && <p role="status">{message}</p>}
      </form>
    </section>
  );
}
