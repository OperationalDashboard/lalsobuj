// Developer-only: package an already exported, locally reviewed model.
// No document access, inference service or automatic downloads.
import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const source = new URL('../../.handwriting-evaluation/', import.meta.url);
const dest = new URL('../public/checker-handwriting/bengali-specialist/', import.meta.url);
const model = await readFile(new URL('bhaasha-bengali.onnx', source));
const alphabet = [...new Set((await readFile(new URL('bhaasha-review/alphabet/bengali_lexicon.txt', source), 'utf8')).trimEnd().split(/\r?\n/))];
if (alphabet.length !== 91) throw new Error('Unexpected alphabet: stop packaging.');
await mkdir(dest, { recursive: true });
await copyFile(new URL('bhaasha-bengali.onnx', source), new URL('model.onnx', dest));
await copyFile(new URL('bhaasha-review/LICENSE', source), new URL('LICENSE', dest));
await writeFile(new URL('manifest.json', dest), JSON.stringify({ experimental: true, bytes: model.length,
  sha256: createHash('sha256').update(model).digest('hex'), alphabet,
  source: 'https://github.com/NLTM-OCR/BhaashaHWOCR', revision: '0932e75053ad3b6b433840710d03b15e3000a7b1',
  caveat: 'Experimental review-only beta. Repository alphabet matches output shape, but differs from archive lexicon. Dates and bus digits require manual correction; all rows require review.' }, null, 2));
console.log(`Prepared review-only Bengali beta model (${model.length} bytes). Not verified handwriting.`);
