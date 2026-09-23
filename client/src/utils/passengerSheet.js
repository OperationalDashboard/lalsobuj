import { parseImportDate } from "./onlineImport.js";

export const latinDigits = value => String(value ?? "").replace(/[০-৯]/g, d => "০১২৩৪৫৬৭৮৯".indexOf(d));
// Only lines with an explicit journey date become suggestions. Never use the
// sheet heading date for every row, and never import a subtotal as a bus.
export function suggestPassengerRows(text, page = 1) {
  return text.split(/\r?\n/).flatMap((raw, line) => {
    const normalized = latinDigits(raw).replace(/[|]/g, " ");
    const match = normalized.match(/\b(?:\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}|\d{1,2}[\/.-]\d{1,2}[\/.-](?:\d{4}|\d{2}))\b/);
    if (!match) return [];
    const after = normalized.slice(match.index + match[0].length).trim();
    const cells = after.match(/\d+/g) || [];
    // Handwritten short bus number, then destination counts and final total.
    if (!/^\d{4}$/.test(cells[0] || "") || cells.length < 2) return [];
    return [{ date: parseImportDate(match[0], ""), bus: cells[0], passengers: cells.at(-1), source: `Page ${page}, line ${line + 1}: ${raw}` }];
  });
}

export async function readPassengerSheet(file, onProgress, signal, remoteReader) {
  if (file.size > 15 * 1024 * 1024) throw new Error("Maximum document size is 15 MB.");
  const pdfFile = /\.pdf$/i.test(file.name);
  if (!pdfFile && !/\.(png|jpe?g|webp)$/i.test(file.name)) throw new Error("Choose a PDF, JPG, PNG or WebP file.");
  let worker, pdf, disposed = false, failed = false;
  const pages = [], rows = [], warnings = [];
  const checkCancelled = () => { if (signal?.aborted) throw new Error("Reading cancelled."); };
  let rejectCancelled;
  const cancelled = new Promise((_, reject) => { rejectCancelled = reject; });
  // Catch even if abort happens between awaited operations.
  cancelled.catch(() => {});
  const cancel = () => { rejectCancelled(new Error("Reading cancelled.")); worker?.terminate(); };
  signal?.addEventListener("abort", cancel, { once: true });
  let rejectOcrError;
  const ocrError = new Promise((_, reject) => { rejectOcrError = reject; });
  ocrError.catch(() => {});
  const deadline = setTimeout(() => rejectOcrError(new Error("Local reader timed out. Use the preview to enter rows manually.")), 120000);
  async function recognize(image, page) {
    checkCancelled();
    if (!worker) {
      const { createWorker } = await import("tesseract.js");
      const starting = createWorker("ben+eng", 1, {
        workerPath: "/checker-ocr/worker.min.js", corePath: "/checker-ocr", langPath: "/checker-ocr",
        workerBlobURL: false,
        errorHandler: error => rejectOcrError(new Error(String(error))),
        logger: event => onProgress(`Page ${page}: ${event.status} ${Math.round((event.progress || 0) * 100)}%`),
      }).then(async instance => { if (disposed || signal?.aborted) { await instance.terminate(); throw new Error("Reading cancelled."); } return instance; });
      worker = await Promise.race([starting, cancelled, ocrError]);
      if (signal?.aborted) { await worker.terminate(); throw new Error("Reading cancelled."); }
    }
    return (await Promise.race([worker.recognize(image), cancelled, ocrError])).data.text;
  }
  try {
    if (pdfFile) {
      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
      pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
      if (pdf.numPages > 20) throw new Error("Upload up to 20 pages per check. Split larger documents first.");
      for (let number = 1; number <= pdf.numPages; number++) {
        checkCancelled(); onProgress(`Reading page ${number} of ${pdf.numPages}`);
        const page = await pdf.getPage(number);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2, 1800 / Math.max(base.width, base.height)) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        const lines = new Map();
        for (const item of (await page.getTextContent()).items) {
          if (!item.str?.trim()) continue;
          const y = Math.round(item.transform[5] / 3) * 3;
          lines.set(y, [...(lines.get(y) || []), item]);
        }
        let text = [...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, items]) => items.sort((a, b) => a.transform[4] - b.transform[4]).map(item => item.str).join(" ")).join("\n");
        // A scanned form may contain printed text but no readable entry rows.
        const image = canvas.toDataURL("image/jpeg", .85);
        try { if (failed) throw new Error("Reader stopped after a previous error. Enter this page’s rows manually.");
        if (remoteReader) {
          onProgress(`Page ${number}: reading handwriting…`);
          const data = await Promise.race([remoteReader(image), cancelled]);
          rows.push(...data.rows.map(row => ({ ...row, date: parseImportDate(row.date, ""), source: `Page ${number}: ${row.source}` })));
          text = data.warning || "Suggested rows from the handwriting service. Verify every row against this image.";
        } else {
          if (!suggestPassengerRows(text, number).length) text = await recognize(canvas, number);
          rows.push(...suggestPassengerRows(text, number));
        }
        } catch (error) { checkCancelled(); failed = true; text = error.message || "Reader failed. Enter rows manually."; warnings.push(`Page ${number}: ${text}`); }
        pages.push({ image, text });
        canvas.width = canvas.height = 0;
        page.cleanup();
      }
    } else {
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
      });
      // Bound uploaded pixels before remote reading; never send the original file.
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      let text;
      try { if (remoteReader) {
        onProgress("Page 1: reading handwriting…");
        const data = await Promise.race([remoteReader(canvas.toDataURL("image/jpeg", .9)), cancelled]);
        rows.push(...data.rows.map(row => ({ ...row, date: parseImportDate(row.date, ""), source: `Page 1: ${row.source}` })));
        text = data.warning || "Suggested rows from the handwriting service. Verify every row against this image.";
      } else { text = await recognize(canvas, 1); rows.push(...suggestPassengerRows(text)); }
      } catch (error) { checkCancelled(); text = error.message || "Reader failed. Enter rows manually."; warnings.push(text); }
      pages.push({ image, text }); canvas.width = canvas.height = 0;
    }
    checkCancelled();
    if (rows.length > 500) throw new Error("More than 500 suggested rows. Split the document; nothing has been saved.");
    return { pages, rows, warnings };
  } finally {
    disposed = true; clearTimeout(deadline);
    signal?.removeEventListener("abort", cancel);
    if (worker) await worker.terminate();
    if (pdf) await pdf.destroy();
  }
}
