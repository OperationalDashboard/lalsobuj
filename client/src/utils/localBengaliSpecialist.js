export function createBengaliSpecialist(progress, signal, makeWorker = () => new Worker(new URL('./bengaliSpecialist.worker.js', import.meta.url), { type: 'module' })) {
  let worker, pending, stopped = false;
  function dispose(message = 'Reading cancelled.') {
    stopped = true; worker?.terminate(); worker = null;
    if (pending) { clearTimeout(pending.timer); pending.reject(new Error(message)); pending = null; }
    signal?.removeEventListener('abort', abort);
  }
  const abort = () => dispose();
  signal?.addEventListener('abort', abort, { once: true });
  return { dispose, read(pixels) {
    if (stopped || signal?.aborted) return Promise.reject(new Error('Reading cancelled.'));
    if (pending) return Promise.reject(new Error('Previous cell is still being read.'));
    worker ||= makeWorker();
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') { progress(data.text); return; }
      if (!pending) return;
      const item = pending; pending = null; clearTimeout(item.timer);
      if (data.type === 'result') item.resolve({ text: data.text, confidence: null });
      else item.reject(new Error(data.text || 'Specialist worker failed.'));
    };
    worker.onerror = event => dispose(event.message || 'Specialist worker failed.');
    return new Promise((resolve, reject) => {
      pending = { resolve, reject, timer: setTimeout(() => dispose('Local specialist timed out.'), 90000) };
      try { worker.postMessage({ pixels }); } catch (error) { dispose(error.message); }
    });
  } };
}
