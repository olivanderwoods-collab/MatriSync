import { useEffect, useRef, useState } from "react";

// Opened only by Take Photo. No audio, upload, recognition or automatic save.
export function CameraCapture({
  onCapture,
  onCancel,
}: {
  onCapture: (file: File) => void;
  onCancel: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const live = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function stop() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }
  useEffect(() => {
    live.current = true;
    let active = true;
    async function open() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Error("unsupported");
        const result = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (!active) {
          result.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = result;
        if (video.current) {
          video.current.srcObject = result;
          await video.current.play();
        }
      } catch (e) {
        if (!active) return;
        stop();
        const name = e instanceof DOMException ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera permission was not granted. Allow camera access in your browser settings, then retry, or upload a photo from your device."
            : name === "NotFoundError"
              ? "No camera was found. Connect a camera or upload a photo from your device."
              : "Camera could not open. Check camera availability and browser permissions, or upload a photo from your device.",
        );
      }
    }
    void open();
    const pause = () => {
      if (document.visibilityState === "hidden") {
        active = false;
        stop();
        setReady(false);
        setError("Camera paused. Retry when you are ready.");
      }
    };
    const leave = () => {
      active = false;
      stop();
    };
    document.addEventListener("visibilitychange", pause);
    window.addEventListener("pagehide", leave);
    return () => {
      active = false;
      live.current = false;
      stop();
      document.removeEventListener("visibilitychange", pause);
      window.removeEventListener("pagehide", leave);
    };
  }, [attempt]);
  async function capture() {
    const source = video.current;
    if (!source || !source.videoWidth || !ready) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = source.videoWidth;
      canvas.height = source.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw Error();
      context.drawImage(source, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (!live.current) return;
      if (!blob || blob.size > 10 * 1024 * 1024) throw Error();
      stop();
      onCapture(
        new File([blob], `document-photo-${Date.now()}.jpg`, {
          type: "image/jpeg",
        }),
      );
    } catch {
      if (live.current)
        setError("The photo could not be captured. Please retry.");
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return (
    <section className="camera-capture" aria-label="Camera capture">
      <h3>Take a photo</h3>
      <p>
        Keep the whole document in view. The photo is saved only after you
        choose Save document.
      </p>
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        aria-label="Camera preview"
        onLoadedData={() => setReady(true)}
      />
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        !ready && <p role="status">Waiting for camera permission or preview…</p>
      )}
      <div className="action-row">
        <button
          type="button"
          className="button primary"
          disabled={!ready || busy || !!error}
          onClick={() => void capture()}
        >
          Capture photo
        </button>
        {error && (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setError("");
              setReady(false);
              setAttempt((n) => n + 1);
            }}
          >
            Retry camera
          </button>
        )}
        <button type="button" className="button cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
