import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const source = fileURLToPath(new URL('../node_modules/onnxruntime-web/dist/', import.meta.url));
const target = fileURLToPath(new URL('../public/checker-handwriting/runtime/', import.meta.url));
await mkdir(target, { recursive: true });
for (const name of await readdir(source)) {
  if (/^ort-wasm.*\.(mjs|wasm)$/.test(name)) await copyFile(resolve(source, name), resolve(target, name));
}
await copyFile(fileURLToPath(new URL('../THIRD-PARTY-HANDWRITING.md', import.meta.url)), resolve(target, 'THIRD-PARTY-NOTICES.md'));
console.log('Local handwriting runtime prepared. No model downloads in normal builds.');
