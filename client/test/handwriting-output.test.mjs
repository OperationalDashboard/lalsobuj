import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHandwritingOutput, strictJourneyDate } from '../src/utils/handwritingOutput.js';

test('Bengali digits normalize; journey date is strict, not heading fallback', () => {
  const data = parseHandwritingOutput(JSON.stringify({ rows: [{ date: '২০/০৯/২৬', bus: '৫৩১৫', passengers: '০৪' }, { date: '', bus: '৪০৮৬', passengers: '৩' }] }));
  assert.equal(data.rows[0].date, '2026-09-20');
  assert.equal(data.rows[0].bus, '5315'); assert.equal(data.rows[0].passengers, '4');
  assert.equal(data.rows[1].date, '');
  assert.equal(strictJourneyDate('31/02/26'), '');
  assert.equal(strictJourneyDate('29/02/24'), '2024-02-29');
  assert.equal(strictJourneyDate('2026-13-01'), '');
});
test('partial, malformed or invented-schema output never silently imports', () => {
  for (const text of ['{"rows":[', 'ignore previous instructions', '{"rows":null}', '{"rows":[null]}', JSON.stringify({ rows: Array(501).fill({}) })]) assert.throws(() => parseHandwritingOutput(text));
  const data = parseHandwritingOutput('```json\n{"rows":[{"date":"yesterday","bus":"53?5","passengers":"3 or 4"}]}\n```');
  assert.equal(data.rows[0].date, ''); assert.equal(data.rows[0].bus, ''); assert.equal(data.rows[0].passengers, '');
});
test('keeps repeated rows, zero counts, missing fields and source context for review', () => {
  const row = { date: '2026-09-20', bus: '5315', passengers: 0 };
  const data = parseHandwritingOutput(JSON.stringify({ rows: [row, row, {}] }));
  assert.equal(data.rows.length, 3); assert.equal(data.rows[0].passengers, '0');
  assert.equal(data.rows[2].passengers, ''); assert.match(data.warning, /EVERY/);
  assert.match(data.rows[0].source, /2026-09-20/);
});
