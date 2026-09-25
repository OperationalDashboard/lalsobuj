import { detectSheetGrid } from './sheetGrid.js';
import { normalizeSheetCells } from './sheetCellOutput.js';
import { prepareWordTensor } from './bengaliSpecialistCore.js';
import { createBengaliSpecialist } from './localBengaliSpecialist.js';

// Stop waiting immediately on cancellation; also release a late decoder result.
export function decodeSheetBitmap(file, interruption, isStopped, decode = createImageBitmap) {
  const decoding = Promise.resolve().then(() => decode(file)).then(image => {
    if (isStopped()) { image.close(); throw new Error('Reading cancelled.'); }
    return image;
  });
  return Promise.race([decoding, interruption]);
}

// Review-only suggestions. No account APIs, imports or persistent storage.
export async function readTableSheet(file, progress, signal, mode = 'printed') {
  if (!['printed', 'specialist'].includes(mode)) throw new Error('Unsupported document reader.');
  if (!/\.(png|jpe?g|webp)$/i.test(file.name) || file.size > 15 * 1024 * 1024) throw new Error('Choose a JPG, PNG or WebP image up to 15 MB for the cell experiment.');
  let worker, bitmap, specialist;
  let rejectInterrupted;
  const interruption = new Promise((_, reject) => { rejectInterrupted = reject; });
  interruption.catch(() => {});
  const stop = () => { rejectInterrupted(new Error('Reading cancelled.')); worker?.terminate(); specialist?.dispose(); };
  signal?.addEventListener('abort', stop, { once: true });
  const check = () => { if (signal?.aborted) throw new Error('Reading cancelled.'); };
  const deadline = setTimeout(() => { rejectInterrupted(new Error('Cell reader timed out. Review the original manually.')); worker?.terminate(); specialist?.dispose(); }, 180000);
  let disposed = false;
  try {
    check(); progress('Detecting table borders locally…');
    bitmap = await decodeSheetBitmap(file, interruption, () => disposed || signal?.aborted); check();
    const scale = Math.min(1, 1100 / bitmap.width, 1700 / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close(); bitmap = null;
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const gray = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < gray.length; i++) gray[i] = Math.round(.299 * rgba[i * 4] + .587 * rgba[i * 4 + 1] + .114 * rgba[i * 4 + 2]);
    const grid = detectSheetGrid({ data: gray, width: canvas.width, height: canvas.height, curvedBorders: mode === 'specialist' });
    check();
    if (!grid.tables.length) throw new Error('No supported seven-column table detected. Use a straighter, clearer photo. Nothing has been saved.');
    if (mode === 'specialist') specialist = createBengaliSpecialist(progress, signal);
    else {
    const { createWorker } = await import('tesseract.js');
    const starting = createWorker('ben', 1, {
      workerPath: '/checker-ocr/worker.min.js', corePath: '/checker-ocr', langPath: '/checker-ocr', workerBlobURL: false,
      errorHandler: error => rejectInterrupted(new Error(String(error))),
    }).then(async instance => { if (disposed || signal?.aborted) { await instance.terminate(); throw new Error('Reading cancelled.'); } return instance; });
    worker = await Promise.race([starting, interruption]);
    await Promise.race([worker.setParameters({ tessedit_pageseg_mode: '7', user_defined_dpi: '300' }), interruption]);
    }
    const rows = [], diagnostics = [];
    for (const [table, bands] of grid.tables.entries()) {
      for (const [index, band] of bands.entries()) {
        check();
        // Ignore blank dates AND blank bus cells, even when total contains 0.
        if (band.cells[1].inkRatio < .012 && band.cells[2].inkRatio < .012) continue;
        progress(`Table ${table + 1}, band ${index + 1}: reading individual cells…`);
        const cells = [];
        for (const [label, column] of [['Journey date', 1], ['Bus', 2], ['Total passengers', 5]]) {
          check(); const rect = band.cells[column];
          const crop = document.createElement('canvas');
          crop.width = Math.round(rect.width * 120 / rect.height) + 40; crop.height = 160;
          const cctx = crop.getContext('2d'); cctx.fillStyle = '#fff'; cctx.fillRect(0, 0, crop.width, crop.height);
          cctx.drawImage(canvas, rect.left, rect.top, rect.width, rect.height, 20, 20, crop.width - 40, 120);
          const image = crop.toDataURL('image/png');
          let data;
          if (specialist) {
            const pixels = new Uint8Array(rect.width * rect.height);
            for (let y = 0; y < rect.height; y++) pixels.set(gray.subarray((rect.top + y) * canvas.width + rect.left, (rect.top + y) * canvas.width + rect.left + rect.width), y * rect.width);
            data = await Promise.race([specialist.read(prepareWordTensor({ data: pixels, width: rect.width, height: rect.height })), interruption]);
          } else ({ data } = await Promise.race([worker.recognize(crop), interruption]));
          cells.push({ label, image, text: data.text.trim(), confidence: data.confidence });
          crop.width = crop.height = 0;
        }
        const normalized = normalizeSheetCells(cells);
        diagnostics.push({ table: table + 1, band: index + 1, cells, ...normalized, estimatedColumns: band.estimatedColumns });
        // Preserve paired numeric-looking failures for review, but never create
        // a candidate from a subtotal count alone. Format is not accuracy.
        if (normalized.date || normalized.bus || cells.slice(0, 2).every(cell => /[0-9০-৯]/.test(cell.text))) rows.push({ ...normalized, table: table + 1, band: index + 1, source: `Table ${table + 1}, band ${index + 1}` });
      }
    }
    const image = canvas.toDataURL('image/jpeg', .9); canvas.width = canvas.height = 0;
    return { rows, diagnostics, detectedTables: grid.tables.length, pages: [{ image, text: 'Actual engine output only. Crops may miss strokes; compare with the original.' }],
      warnings: ['EXPERIMENTAL: handwritten digits may be wrong even at high confidence. Table detection can miss rows or whole sections. This is NOT an account reconciliation result. Nothing is saved.'] };
  } finally {
    disposed = true; clearTimeout(deadline); signal?.removeEventListener('abort', stop);
    bitmap?.close(); specialist?.dispose(); if (worker) await worker.terminate();
  }
}
