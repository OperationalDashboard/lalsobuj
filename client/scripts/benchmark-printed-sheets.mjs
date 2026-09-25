// Read-only offline baseline. Uses installed OCR and local language data only.
// Does not import application/server code, write records, or upload documents.
import { createWorker } from 'tesseract.js';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { suggestPassengerRows } from '../src/utils/passengerSheet.js';

const paths = process.argv.slice(2);
if (!paths.length) throw new Error('Supply one or more local image paths.');
const worker = await createWorker('ben+eng', 1, {
  langPath: fileURLToPath(new URL('../public/checker-ocr/', import.meta.url)),
  cacheMethod: 'none',
});
try {
  for (const path of paths) {
    const started = Date.now();
    const bytes = await readFile(path);
    const { data } = await worker.recognize(bytes);
    console.log(JSON.stringify({ path, sha256: createHash('sha256').update(bytes).digest('hex'),
      elapsedSeconds: (Date.now() - started) / 1000, confidence: data.confidence,
      suggestions: suggestPassengerRows(data.text), text: data.text }, null, 2));
  }
} finally {
  await worker.terminate();
}
