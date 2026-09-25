// Same bounded preprocessing in browser and tests; no digit substitutions.
export function prepareWordTensor({ data, width, height }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 2000000 || data.length !== width * height) throw new Error('Invalid word crop');
  const out = new Float32Array(96 * 256).fill(127 / 128);
  const resizedHeight = Math.max(1, Math.min(96, Math.floor(256 * height / width)));
  const pad = Math.floor((96 - resizedHeight) / 2);
  for (let y = 0; y < resizedHeight; y++) for (let x = 0; x < 256; x++) {
    const sx = Math.max(0, Math.min(width - 1, (x + .5) * width / 256 - .5));
    const sy = Math.max(0, Math.min(height - 1, (y + .5) * height / resizedHeight - .5));
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
    const fx = sx - x0, fy = sy - y0;
    const value = (data[y0 * width + x0] * (1 - fx) + data[y0 * width + x1] * fx) * (1 - fy) + (data[y1 * width + x0] * (1 - fx) + data[y1 * width + x1] * fx) * fy;
    out[(y + pad) * 256 + x] = (Math.round(value) - 128) / 128;
  }
  return out;
}

export function decodeBengaliCTC(logits, alphabet) {
  const classes = alphabet.length + 1;
  if (classes !== 92 || logits.length !== 32 * classes) throw new Error('Unexpected recognition output shape');
  let text = '', previous = -1;
  for (let t = 0; t < 32; t++) {
    let best = 0;
    for (let c = 0; c < classes; c++) {
      if (!Number.isFinite(logits[t * classes + c])) throw new Error('Invalid recognition score');
      if (logits[t * classes + c] > logits[t * classes + best]) best = c;
    }
    if (best && best !== previous) text += alphabet[best - 1];
    previous = best;
  }
  return text;
}
