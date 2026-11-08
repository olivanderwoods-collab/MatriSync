import { useEffect, useRef, useState } from "react";
import { useRecords } from "../records";
import type { LocalDocument } from "../records-model";
import { extractLocalPdf, type ReviewedDocument } from "./document-context";

export function DocumentContextPanel({ uid, onAccept }: { uid: string; onAccept: (value?: ReviewedDocument) => void }) {
  const { vault } = useRecords();
  const [files, setFiles] = useState<LocalDocument[]>([]), [id, setId] = useState("");
  const [text, setText] = useState(""), [scope, setScope] = useState("Manually supplied text; not independently verified.");
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const request = useRef(0);
  useEffect(() => { const sequence = request; return () => { sequence.current++; }; }, []);
  const selected = files.find(f => f.id === id);
  function invalidate() { onAccept(undefined); setReviewed(false); setNotice(""); }
  return <section aria-label="Reviewed document context">
    <h3>Your uploaded document</h3>
    <p>Read a PDF's selectable text locally, or type text from an image yourself. Review it against the original. Nothing is uploaded or sent to the language model. Only the text you accept can be quoted in this chat.</p>
    <button className="button secondary" disabled={busy} onClick={async () => {
      setBusy(true); setNotice(""); const operation = ++request.current;
      try {
        if (!vault || !(await vault.openOnDevice())) throw Error("Open your existing records first.");
        if (operation !== request.current) return;
        setFiles(vault?.data?.documents.filter(d => d.patientId === "self") || []);
      } catch { setNotice("Open your Mother profile to connect your records first."); }
      finally { setBusy(false); }
    }}>Choose from my uploaded documents</button>
    <label>Document for this chat<select value={id} disabled={busy} onChange={e => { invalidate(); setId(e.target.value); setText(""); setScope("Manually supplied text; not independently verified."); }}>
      <option value="">Choose your document</option>{files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
    </select></label>
    {selected && <>
      <p className="small">Source: {selected.source || "Not recorded"} · Date: {selected.reportDate || "Not recorded"}</p>
      <button className="button secondary" disabled={busy || selected.type !== "application/pdf"} onClick={async () => {
        invalidate(); setText(""); setBusy(true); const operation = ++request.current;
        try {
          const original = await vault!.document(selected.id);
          const result = await extractLocalPdf(original.bytes);
          if (operation !== request.current) return;
          setText(result.text); setScope(result.scope);
        } catch (e) { if (operation === request.current) setNotice(e instanceof Error ? e.message : "Cannot extract this PDF. Review the original manually."); }
        finally { if (operation === request.current) setBusy(false); }
      }}>Extract PDF text on this device</button>
      <p className="small">Scanned PDFs and images need manual transcription. This does not interpret results, medicines or diagnoses.</p>
      <label>Text reviewed against the original<textarea rows={8} maxLength={12000} value={text} disabled={busy} onChange={e => { invalidate(); setText(e.target.value); setScope("User-edited transcription; check against the original. Not independently verified."); }} /></label>
      <p className="small">{scope}</p>
      <label className="check-row"><input type="checkbox" disabled={busy} checked={reviewed} onChange={e => { setReviewed(e.target.checked); if (!e.target.checked) onAccept(undefined); }} />I checked this text against the original and allow it to be quoted in this chat.</label>
      <button className="button primary" disabled={busy || !reviewed || !text.trim()} onClick={() => {
        onAccept({ uid, id: selected.id, name: selected.name, source: selected.source, date: selected.reportDate, text: text.trim(), scope });
        setNotice('Ready for this chat. Ask "Read my document". Leaving the companion or starting a new chat clears the accepted text.');
      }}>Use reviewed text in this chat</button>
    </>}
    <button className="text-link" disabled={busy} onClick={() => { invalidate(); setText(""); setId(""); }}>Clear document context</button>
    {notice && <p role="status">{notice}</p>}{busy && <p role="status">Reading locally…</p>}
  </section>;
}
