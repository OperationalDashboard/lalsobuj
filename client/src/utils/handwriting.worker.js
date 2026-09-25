import { AutoProcessor, AutoModelForImageTextToText, RawImage, TextStreamer, env } from '@huggingface/transformers';
import { HANDWRITING_PROMPT, parseHandwritingOutput } from './handwritingOutput.js';

// No model hub, CDN, telemetry, hosted inference, or API keys at runtime.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/checker-handwriting/';
env.backends.onnx.wasm.wasmPaths = `${self.location.origin}/checker-handwriting/runtime/`;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
let processor, model, active = false;
self.onmessage = async ({ data }) => {
  if (active) return;
  active = true;
  const progress = message => self.postMessage({ type: 'progress', message });
  try {
    if (!import.meta.env.DEV) throw new Error('This model has not passed handwriting acceptance tests and is blocked in production');
    if (typeof data.image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(data.image) || data.image.length > 8 * 1024 * 1024) throw new Error('Invalid local page image.');
    if (!self.navigator.gpu) throw new Error('This experimental model needs WebGPU. Use a supported desktop browser or the printed reader/manual entry.');
    if (!model) {
      progress('Loading self-hosted handwriting model (about 1.7 GB on first use)…');
      processor = await AutoProcessor.from_pretrained('qwen3-vl-2b', { local_files_only: true });
      // Bound vision memory. This is not a promise of sufficient resolution
      // for all sheets; users must check the original for omitted rows.
      processor.image_processor.max_pixels = 786432;
      model = await AutoModelForImageTextToText.from_pretrained('qwen3-vl-2b', {
        local_files_only: true, device: 'webgpu',
        dtype: { embed_tokens: 'q4', decoder_model_merged: 'q4', vision_encoder: 'q8' },
        progress_callback: event => {
          if (event.status === 'progress') progress(`Loading handwriting model: ${event.file || 'weights'} ${Math.round(event.progress || 0)}%`);
        },
      });
    }
    progress('Reading Bengali handwriting on this device…');
    const image = await RawImage.read(data.image);
    const prompt = processor.apply_chat_template([{ role: 'user', content: [{ type: 'image' }, { type: 'text', text: HANDWRITING_PROMPT }] }], { add_generation_prompt: true, tokenize: false });
    const inputs = await processor(prompt, image);
    let tokens = 0;
    const output = await model.generate({ ...inputs, max_new_tokens: 1800, do_sample: false,
      streamer: new TextStreamer(processor.tokenizer, { skip_prompt: true, skip_special_tokens: true,
        callback_function: () => {}, token_callback_function: chunk => {
          tokens += chunk.length;
          if (tokens % 20 === 0) progress(`Reading Bengali handwriting on this device… ${tokens} tokens generated (unverified)`);
        },
      }),
    });
    const text = processor.tokenizer.batch_decode(output.slice(null, [inputs.input_ids.dims.at(-1), null]), { skip_special_tokens: true })[0];
    self.postMessage({ type: 'result', data: parseHandwritingOutput(text) });
  } catch (error) {
    self.postMessage({ type: 'error', message: `Local handwriting reader: ${error.message || 'unable to read this page'}. No document was sent to an external service.` });
  } finally { active = false; }
};
