// One worker per document: cancellation kills inference and frees model memory.
export function createLocalHandwritingReader(onProgress, signal) {
  let worker, pending, dead = false;
  function dispose() {
    dead = true;
    worker?.terminate(); worker = null;
    if (pending) { clearTimeout(pending.timer); pending.reject(new Error('Local handwriting reading stopped.')); pending = null; }
    signal?.removeEventListener('abort', dispose);
  }
  signal?.addEventListener('abort', dispose, { once: true });
  return {
    async read(image) {
      if (dead || signal?.aborted) throw new Error('Reading cancelled.');
      if (pending) throw new Error('Another page is already being read.');
      if (!worker) {
        worker = new Worker(new URL('./handwriting.worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          if (data.type === 'progress') { onProgress(data.message); return; }
          if (!pending) return;
          const current = pending; pending = null; clearTimeout(current.timer);
          if (data.type === 'result') current.resolve(data.data);
          else current.reject(new Error(data.message || 'Unable to read the page.'));
        };
        worker.onerror = () => dispose();
      }
      return new Promise((resolve, reject) => {
        pending = { resolve, reject, timer: setTimeout(() => dispose(), 600000) };
        worker.postMessage({ image });
      });
    },
    dispose,
  };
}
