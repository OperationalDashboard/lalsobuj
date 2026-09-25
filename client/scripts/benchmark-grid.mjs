// Local diagnostic only. Original documents never leave this process.
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { fileURLToPath } from 'node:url';
import { detectSheetGrid } from '../src/utils/sheetGrid.js';
const paths = process.argv.slice(2).filter(x => x !== '--ocr');
const ocr = process.argv.includes('--ocr');
let worker;
try {
  if (ocr) {
    worker = await createWorker('ben', 1, { langPath: fileURLToPath(new URL('../public/checker-ocr/', import.meta.url)), cacheMethod: 'none' });
    await worker.setParameters({ tessedit_pageseg_mode: '7', user_defined_dpi: '300' });
  }
  for (const path of paths) {
    const { data, info } = await sharp(path).resize({ width: 1100, height: 1700, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const grid = detectSheetGrid({ data, width: info.width, height: info.height });
    console.log(JSON.stringify({ path, lines: grid.lineCount, tables: grid.tables.map(t => t.length) }));
    if (!worker) continue;
    for (const [table, bands] of grid.tables.entries()) {
      for (const [index, band] of bands.entries()) {
        if (band.cells[1].inkRatio < .012 && band.cells[2].inkRatio < .012) continue;
        const output = { table: table + 1, band: index + 1, cells: [] };
        for (const column of [1, 2, 5]) {
          const { left, top, width, height } = band.cells[column];
          const buffer = await sharp(data, { raw: { width: info.width, height: info.height, channels: 1 } }).extract({ left, top, width, height }).resize({ height: 120 }).extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#fff' }).png().toBuffer();
          const { data: read } = await worker.recognize(buffer);
          output.cells.push({ column, text: read.text.trim(), confidence: read.confidence });
        }
        console.log(JSON.stringify(output));
      }
    }
  }
} finally { if (worker) await worker.terminate(); }
