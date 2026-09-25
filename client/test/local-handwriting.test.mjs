import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalHandwritingReader } from '../src/utils/localHandwriting.js';
class FakeWorker {
  static instances = [];
  constructor() { FakeWorker.instances.push(this); }
  postMessage(data) { this.input = data; }
  terminate() { this.terminated = true; }
}
test('one worker reused across pages, progress delivered, disposal terminates', async () => {
  globalThis.Worker = FakeWorker;
  const messages = [];
  const reader = createLocalHandwritingReader(m => messages.push(m));
  const first = reader.read('data:image/jpeg;base64,AAAA');
  const worker = FakeWorker.instances.at(-1);
  await assert.rejects(reader.read('another image'), /already/);
  worker.onmessage({ data: { type: 'progress', message: 'loading' } });
  worker.onmessage({ data: { type: 'result', data: { rows: [] } } });
  assert.deepEqual(await first, { rows: [] }); assert.deepEqual(messages, ['loading']);
  const second = reader.read('data:image/jpeg;base64,BBBB');
  worker.onmessage({ data: { type: 'error', message: 'model unavailable' } });
  await assert.rejects(second, /model unavailable/);
  reader.dispose(); assert.equal(worker.terminated, true);
  await assert.rejects(reader.read('again'), /cancelled/);
  delete globalThis.Worker;
});
test('abort stops in-flight inference rather than merely hiding results', async () => {
  globalThis.Worker = FakeWorker;
  const controller = new AbortController();
  const reader = createLocalHandwritingReader(() => {}, controller.signal);
  const pending = reader.read('data:image/jpeg;base64,AAAA');
  const worker = FakeWorker.instances.at(-1);
  controller.abort(); await assert.rejects(pending, /stopped/);
  assert.equal(worker.terminated, true);
  const before = FakeWorker.instances.length;
  await assert.rejects(reader.read('again'), /cancelled/);
  assert.equal(FakeWorker.instances.length, before);
  delete globalThis.Worker;
});
