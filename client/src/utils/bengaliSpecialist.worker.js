import * as ort from 'onnxruntime-web/wasm';
import { decodeBengaliCTC } from './bengaliSpecialistCore.js';
let session, alphabet;
async function initialize() {
  if (session) return;
  const base = new URL('/checker-handwriting/bengali-specialist/', self.location.origin);
  const manifestResponse = await fetch(new URL('manifest.json', base), { mode: 'same-origin', redirect: 'error' });
  if (!manifestResponse.ok) throw new Error('Local Bengali model has not been prepared.');
  const manifest = await manifestResponse.json();
  if (!Array.isArray(manifest.alphabet) || manifest.alphabet.length !== 91 || manifest.alphabet.some(x => typeof x !== 'string' || !x.length || x.length > 8) || new Set(manifest.alphabet).size !== 91 || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1 || manifest.bytes > 100000000) throw new Error('Invalid local model manifest');
  self.postMessage({ type: 'progress', text: 'Loading local Bengali specialist (~71 MB)…' });
  const response = await fetch(new URL('model.onnx', base), { mode: 'same-origin', redirect: 'error' });
  if (!response.ok) throw new Error('Local Bengali model could not be loaded.');
  const buffer = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(x => x.toString(16).padStart(2, '0')).join('');
  if (buffer.byteLength !== manifest.bytes || hash !== manifest.sha256) throw new Error('Local model integrity check failed.');
  ort.env.wasm.wasmPaths = `${self.location.origin}/checker-handwriting/runtime/`;
  ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
  session = await ort.InferenceSession.create(buffer, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  alphabet = manifest.alphabet;
}
self.onmessage = async ({ data }) => {
  try {
    if (!(data.pixels instanceof Float32Array) || data.pixels.length !== 96 * 256 || data.pixels.some(x => !Number.isFinite(x))) throw new Error('Invalid crop tensor');
    await initialize();
    const result = await session.run({ pixels: new ort.Tensor('float32', data.pixels, [1, 1, 96, 256]) });
    const text = decodeBengaliCTC(result.logits.data, alphabet);
    self.postMessage({ type: 'result', text });
  } catch (error) { self.postMessage({ type: 'error', text: error.message || 'Local Bengali recognition failed.' }); }
};
