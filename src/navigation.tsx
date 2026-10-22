import { useNavigate } from "react-router-dom";
export function BackButton({ fallback }: { fallback: string }) {
  const navigate = useNavigate();
  return (
    <button
      className="back-link"
      onClick={() => {
        if (window.history.state?.idx > 0) navigate(-1);
        else navigate(fallback, { replace: true });
      }}
    >
      ← Back
    </button>
  );
}
