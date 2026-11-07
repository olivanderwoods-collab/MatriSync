export type ReviewedDocument = {
  uid: string; id: string; name: string; source: string; date: string;
  text: string; scope: string;
};
// Only explicit read-back requests bypass ordinary clinical refusal handling.
export function documentQuestion(input: string) {
  return /^(?:read|show|quote)(?: me)? (?:my |the )?(?:reviewed |uploaded )?(?:document|report)(?: text)?[.!?]*$/i.test(input.trim());
}
export function documentAnswer(value?: ReviewedDocument) {
  if (!value) return "Choose an uploaded document in AI settings, review its extracted text and accept it for this chat first. I have not read any other file.";
  return `Reviewed text from ${value.name}\nRecorded source: ${value.source || "Not recorded"}\nDocument date: ${value.date || "Not recorded"}\n${value.scope}\n\n${value.text}\n\nThis is a read-back of text you reviewed, not a medical interpretation or a verified clinical conclusion.`;
}
export async function extractLocalPdf(bytes: Uint8Array) {
  if (bytes.length > 10 * 1024 * 1024) throw Error("PDF exceeds the 10 MiB limit.");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
  const task = pdfjs.getDocument({ data: bytes.slice(), useWorkerFetch: false, disableFontFace: true });
  const timeout = setTimeout(() => void task.destroy(), 20000);
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    let count = 0, length = 0;
    for (let n = 1; n <= Math.min(pdf.numPages, 10) && length < 12000; n++) {
      const page = await pdf.getPage(n), content = await page.getTextContent();
      const text = content.items.map(i => "str" in i ? i.str + (i.hasEOL ? "\n" : " ") : "").join("").trim();
      if (text) pages.push(`[Page ${n}]\n${text}`);
      length += text.length; count = n;
      page.cleanup();
    }
    const text = pages.join("\n\n").slice(0, 12000);
    if (!text.trim()) throw Error("No selectable text found. This may be a scanned PDF; OCR is not available. You may enter text manually after reading the original.");
    return { text, scope: `Text extraction: pages 1-${count} of ${pdf.numPages}; at most 12,000 characters. Tables and reading order need your review.` };
  } finally {
    clearTimeout(timeout);
    await task.destroy();
  }
}
