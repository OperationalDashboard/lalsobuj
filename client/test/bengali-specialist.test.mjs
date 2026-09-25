import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWordTensor, decodeBengaliCTC } from '../src/utils/bengaliSpecialistCore.js';
import { createBengaliSpecialist } from '../src/utils/localBengaliSpecialist.js';
import { decodeSheetBitmap } from '../src/utils/readTableSheet.js';

test('crop preprocessing is bounded, deterministic and uses white padding', () => {
  const pixels = prepareWordTensor({ width: 256, height: 20, data: new Uint8Array(256 * 20) });
  assert.equal(pixels.length, 96 * 256);
  assert.equal(pixels[0], 127 / 128);
  assert.equal(pixels[38 * 256], -1);
  assert.throws(() => prepareWordTensor({ width: 1, height: 2, data: [] }));
  assert.throws(() => prepareWordTensor({ width: 5000, height: 5000, data: [] }));
});
test('CTC collapses repeat emissions, preserves repeats separated by blank, rejects invalid scores', () => {
  const alphabet = Array.from({ length: 91 }, (_, i) => String.fromCharCode(0x980 + i));
  const scores = new Float32Array(32 * 92).fill(-10);
  const path = [1, 1, 0, 1, 2, 2];
  for (let t = 0; t < 32; t++) scores[t * 92 + (path[t] || 0)] = 10;
  assert.equal(decodeBengaliCTC(scores, alphabet), alphabet[0] + alphabet[0] + alphabet[1]);
  assert.throws(() => decodeBengaliCTC(scores.slice(1), alphabet));
  scores[50] = NaN;
  assert.throws(() => decodeBengaliCTC(scores, alphabet));
});
class FakeWorker {
  constructor() { this.terminated = false; }
  postMessage(data) { this.sent = data; }
  terminate() { this.terminated = true; }
  emit(data) { this.onmessage({ data }); }
}
test('specialist reuses worker; preserves raw Bengali text without fake confidence', async () => {
  const worker = new FakeWorker(), events = [];
  const reader = createBengaliSpecialist(x => events.push(x), undefined, () => worker);
  const first = reader.read(new Float32Array(96 * 256));
  worker.emit({ type: 'progress', text: 'Loading' });
  worker.emit({ type: 'result', text: '০৩' });
  assert.deepEqual(await first, { text: '০৩', confidence: null });
  assert.deepEqual(events, ['Loading']);
  const second = reader.read(new Float32Array(96 * 256));
  worker.emit({ type: 'result', text: '৹' });
  assert.equal((await second).text, '৹');
  reader.dispose(); assert.equal(worker.terminated, true);
});
test('aborting specialist actually terminates inference and rejects pending cell', async () => {
  const controller = new AbortController(), worker = new FakeWorker();
  const reader = createBengaliSpecialist(() => {}, controller.signal, () => worker);
  const running = reader.read(new Float32Array(96 * 256));
  controller.abort();
  await assert.rejects(running, /cancelled/);
  await assert.rejects(reader.read(new Float32Array(96 * 256)), /cancelled/);
  assert.equal(worker.terminated, true);
});

test('cancel/deadline interrupts a stalled image decode and closes its late bitmap', async () => {
  for (const message of ['Reading cancelled.', 'Reader timed out.']) {
    let finishDecode, interrupt, stopped = false, closed = 0;
    const decoding = new Promise(resolve => { finishDecode = resolve; });
    const interruption = new Promise((_, reject) => { interrupt = reject; });
    const running = decodeSheetBitmap({}, interruption, () => stopped, () => decoding);
    stopped = true; interrupt(new Error(message));
    await assert.rejects(running, error => error.message === message);
    finishDecode({ close() { closed++; } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(closed, 1);
  }
});
