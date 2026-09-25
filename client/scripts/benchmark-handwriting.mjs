// Read-only local benchmark. No database, environment secrets or external OCR calls.
import { AutoProcessor, AutoModelForImageTextToText, RawImage, env, TextStreamer } from '@huggingface/transformers';
import { fileURLToPath } from 'node:url';
import { HANDWRITING_PROMPT } from '../src/utils/handwritingOutput.js';
const imagePath = process.argv[2];
if (!imagePath) throw new Error('Pass a local sheet image path.');
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useBrowserCache = false;
const modelPath = fileURLToPath(new URL('../public/checker-handwriting/qwen3-vl-2b/', import.meta.url));
const started = Date.now();
console.log('Loading local weights only...');
const processor = await AutoProcessor.from_pretrained(modelPath, { local_files_only: true });
processor.image_processor.max_pixels = 786432;
const model = await AutoModelForImageTextToText.from_pretrained(modelPath, {
  local_files_only: true, device: 'cpu',
  dtype: { embed_tokens: 'q4', decoder_model_merged: 'q4', vision_encoder: 'q8' },
  session_options: { intraOpNumThreads: 4 },
});
try {
  console.log(`Loaded in ${Math.round((Date.now() - started) / 1000)}s`);
  let image = await RawImage.read(imagePath);
  if (process.argv[3]) {
    const bounds = process.argv[3].split(',').map(Number);
    if (bounds.length !== 4 || bounds.some(x => !Number.isInteger(x) || x < 0)) throw new Error('Crop must be left,top,right,bottom');
    image = await image.crop(bounds);
  }
  const prompt = process.argv[3] ? 'Transcribe the handwritten Bengali numbers in this image, from left to right. Return only the numbers as written, separated by |. Do not guess unclear digits.' : HANDWRITING_PROMPT;
  const text = processor.apply_chat_template([{ role: 'user', content: [{ type: 'image' }, { type: 'text', text: prompt }] }], { add_generation_prompt: true, tokenize: false });
  const inputs = await processor(text, image);
  console.log(`Input tokens: ${inputs.input_ids.dims.at(-1)}`);
  const output = await model.generate({ ...inputs, max_new_tokens: process.argv[3] ? 100 : 750, do_sample: false,
    streamer: new TextStreamer(processor.tokenizer, { skip_prompt: true, skip_special_tokens: true }) });
  console.log('\nRESULT:', processor.tokenizer.batch_decode(output.slice(null, [inputs.input_ids.dims.at(-1), null]), { skip_special_tokens: true })[0]);
  console.log(`Elapsed: ${Math.round((Date.now() - started) / 1000)}s`);
} finally { await model.dispose(); }
