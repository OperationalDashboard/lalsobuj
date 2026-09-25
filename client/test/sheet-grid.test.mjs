import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSheetGrid } from '../src/utils/sheetGrid.js';
import { normalizeSheetCells } from '../src/utils/sheetCellOutput.js';

function synthetic(slope = 0, curve = 0) {
  const width = 600, height = 900, data = new Uint8Array(width * height).fill(255);
  const pixel = (x, y) => { if (y >= 0 && y < height) data[y * width + x] = 0; };
  for (const start of [130, 510]) {
    for (let y = start; y <= start + 300; y += 25)
      for (let x = 50; x <= 550; x++) for (let d = -1; d <= 1; d++) pixel(x, Math.round(y + slope * (x - 300) + curve * Math.sin(x / 75)) + d);
    for (const x of [50, 80, 200, 260, 330, 410, 490, 550])
      for (let y = start; y <= start + 300; y++) for (let d = -1; d <= 1; d++) pixel(x + d, Math.round(y + slope * (x - 300) + curve * Math.sin(x / 75)));
  }
  return { width, height, data };
}
test('detects two ruled seven-column tables without document-specific coordinates', () => {
  for (const slope of [0, -.025, .02]) {
    const grid = detectSheetGrid(synthetic(slope));
    assert.equal(grid.tables.length, 2);
    assert.deepEqual(grid.tables.map(t => t.length), [12, 12]);
    assert.equal(grid.tables[0][0].cells.length, 7);
  }
});
test('small wavy scan borders do not discard a whole section', () => {
  const grid = detectSheetGrid({ ...synthetic(.015, 2), curvedBorders: true });
  assert.equal(grid.tables.length, 2);
  assert.deepEqual(grid.tables.map(t => t.length), [12, 12]);
});
test('blank and invalid/oversized images fail safely', () => {
  assert.deepEqual(detectSheetGrid({ width: 200, height: 200, data: new Uint8Array(40000).fill(255) }).tables, []);
  assert.throws(() => detectSheetGrid({ width: 3000, height: 3000, data: [] }));
});
test('normalizes Bengali cells without guessing; keeps explicit zero and review state', () => {
  const cells = ['১৯/০৯/২০২৬', '২৫৫৮', '০'].map(text => ({ text }));
  assert.deepEqual(normalizeSheetCells(cells), { date: '2026-09-19', bus: '2558', passengers: '0', complete: true, needsReview: true, issues: ['Unverified OCR: confirm against the original'] });
  const failed = normalizeSheetCells(['৯৭|৭1-২৬', '৯৮৩৩?', '০৩?'].map(text => ({ text })));
  assert.equal(failed.date, ''); assert.equal(failed.bus, ''); assert.equal(failed.passengers, '');
  assert.equal(failed.complete, false);
  assert.equal(normalizeSheetCells(['১৯৯২৬', '৪০৮', '৹'].map(text => ({ text }))).passengers, '');
});
test('printed blank-row zero or heading total cannot supply missing bus/date', () => {
  const row = normalizeSheetCells(['', '', '০'].map(text => ({ text })));
  assert.equal(row.bus, ''); assert.equal(row.date, ''); assert.equal(row.passengers, '0'); assert.equal(row.complete, false);
});
