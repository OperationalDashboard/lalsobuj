// Development-time download only. Documents are never sent to the model host.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = 'onnx-community/Qwen3-VL-2B-Instruct-ONNX';
const revision = '3e4136ea66ae6e07c110e64fe07da2e029517ab5';
const root = fileURLToPath(new URL('../public/checker-handwriting/qwen3-vl-2b/', import.meta.url));
const names = ['config.json', 'generation_config.json', 'preprocessor_config.json', 'processor_config.json',
  'tokenizer.json', 'tokenizer_config.json', 'chat_template.jinja',
  'onnx/decoder_model_merged_q4.onnx', 'onnx/decoder_model_merged_q4.onnx_data',
  'onnx/embed_tokens_q4.onnx', 'onnx/embed_tokens_q4.onnx_data',
  'onnx/vision_encoder_quantized.onnx', 'onnx/vision_encoder_quantized.onnx_data'];
async function hash(path) {
  const h = createHash('sha256');
  for await (const block of createReadStream(path)) h.update(block);
  return h.digest('hex');
}
const response = await fetch(`https://huggingface.co/api/models/${repo}/tree/${revision}?recursive=true`);
if (!response.ok) throw new Error(`Model manifest HTTP ${response.status}`);
const tree = await response.json();
const files = [];
for (const name of names) {
  const item = tree.find(item => item.path === name && item.type === 'file');
  if (!item) throw new Error(`Pinned model is missing ${name}`);
  const target = resolve(root, name);
  let valid = false;
  try { valid = (await stat(target)).size === item.size && (!item.lfs || await hash(target) === item.lfs.oid); } catch {}
  if (!valid) {
    console.log(`Downloading ${name} (${Math.ceil(item.size / 1048576)} MB)`);
    await mkdir(dirname(target), { recursive: true });
    for (let attempt = 0; attempt < 3; attempt++) {
      let offset = 0;
      try { offset = (await stat(`${target}.partial`)).size; } catch {}
      if (offset === item.size) break;
      if (offset > item.size) offset = 0;
      try {
        const res = await fetch(`https://huggingface.co/${repo}/resolve/${revision}/${name}`, {
          headers: offset ? { Range: `bytes=${offset}-` } : {}, signal: AbortSignal.timeout(1800000),
        });
        if (!res.ok) throw new Error(`Download HTTP ${res.status}: ${name}`);
        if (res.status === 206 && !res.headers.get('content-range')?.startsWith(`bytes ${offset}-`)) throw new Error('Invalid resume range');
        await pipeline(Readable.fromWeb(res.body), createWriteStream(`${target}.partial`, { flags: res.status === 206 && offset ? 'a' : 'w' }));
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        console.log(`Retrying interrupted download: ${name}`);
      }
    }
    if ((await stat(`${target}.partial`)).size !== item.size) throw new Error(`Incomplete file: ${name}`);
    if (item.lfs && await hash(`${target}.partial`) !== item.lfs.oid) throw new Error(`Checksum failed: ${name}`);
    await rename(`${target}.partial`, target);
  }
  files.push({ name, size: item.size, sha256: await hash(target) });
  console.log(`Verified ${name}`);
}
// Keep the upstream license with the self-hosted weights.
const license = await fetch('https://raw.githubusercontent.com/QwenLM/Qwen3-VL/main/LICENSE');
if (!license.ok) throw new Error('Unable to retrieve model license');
await writeFile(resolve(root, 'LICENSE'), await license.text());
await writeFile(resolve(root, 'manifest.json'), JSON.stringify({ repo, revision, license: 'Apache-2.0', files, bytes: files.reduce((s, f) => s + f.size, 0) }, null, 2));
console.log(`Ready: ${root}. This is an experimental reader, not a verified release.`);
