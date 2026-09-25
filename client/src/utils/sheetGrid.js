// Experimental ruled-form detector. No OCR, network, dates or bus lookup here.
// Seven-column passenger forms only. Unsupported layouts fail closed.
function peaks(values, threshold, gap = 4) {
  const result = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] < threshold) continue;
    let best = i, end = i;
    while (end + 1 < values.length && values[end + 1] >= threshold) {
      end++; if (values[end] > values[best]) best = end;
    }
    if (result.length && best - result.at(-1) < gap) {
      if (values[best] > values[result.at(-1)]) result[result.length - 1] = best;
    } else result.push(best);
    i = end;
  }
  return result;
}

export function detectSheetGrid({ data, width, height, curvedBorders = false }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 100 || height < 100 || width * height > 6000000 || data.length !== width * height) {
    throw new Error('Grid detection requires a bounded grayscale image.');
  }
  const dark = (x, y) => x >= 0 && x < width && y >= 0 && y < height && data[y * width + x] < 125;
  const scores = new Float32Array(height), slopes = new Float32Array(height);
  // A limited-angle Hough projection tolerates modest scan skew. Search each
  // horizontal line independently because photographed pages have perspective.
  const start = Math.round(width * .18), end = Math.round(width * .80), center = width / 2;
  for (let y = 0; y < height; y++) {
    for (let angle = -16; angle <= 16; angle++) {
      const slope = angle / 200;
      let count = 0, total = 0;
      for (let x = start; x < end; x += 4) {
        const yy = Math.round(y + slope * (x - center));
        // A one-pixel corridor tolerates resampling and slight paper curvature.
        count += (dark(x, yy) || (curvedBorders && (dark(x, yy - 1) || dark(x, yy + 1)))) ? 1 : 0; total++;
      }
      const score = count / total;
      if (score > scores[y]) { scores[y] = score; slopes[y] = slope; }
    }
  }
  const lines = peaks(scores, .66, Math.max(6, Math.round(height / 180)));
  const bands = [];
  const candidates = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const top = lines[i], bottom = lines[i + 1], h = bottom - top;
    if (h < height * .012 || h > height * .045) continue;
    const xs = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      const y1 = top + slopes[top] * (x - center), y2 = bottom + slopes[bottom] * (x - center);
      let count = 0, total = 0;
      for (let y = Math.ceil(y1 + h * .2); y < y2 - h * .2; y++) {
        count += dark(x, y) ? 1 : 0; total++;
      }
      xs[x] = total ? count / total : 0;
    }
    const columns = peaks(xs, .86, Math.max(6, Math.round(width / 150)));
    candidates.push({ top, bottom, h, columns });
  }
  const anchors = candidates.filter(band => band.columns.length === 8 &&
    band.columns.at(-1) - band.columns[0] > width * .6 &&
    band.columns.slice(1).every((x, j) => x - band.columns[j] > width * .025));
  for (const candidate of candidates) {
    const { top, bottom, h } = candidate;
    // Merged headings/subtotals do not have the seven-column row structure.
    if (candidate.columns.length < 6) continue;
    const anchor = anchors.reduce((best, band) => !best || Math.abs(band.top - top) < Math.abs(best.top - top) ? band : best, null);
    if (!anchor || Math.abs(anchor.top - top) > height * .15) continue;
    const columns = candidate.columns.length === 8 ? candidate.columns : anchor.columns.map(x => {
      const nearby = candidate.columns.filter(value => Math.abs(value - x) < width * .012);
      return nearby.length === 1 ? nearby[0] : x;
    });
    const widths = columns.slice(1).map((x, j) => x - columns[j]);
    if (Math.min(...widths) < width * .025 || columns.at(-1) - columns[0] < width * .6) continue;
    const cells = widths.map((w, j) => {
      const left = columns[j], right = columns[j + 1];
      const ysTop = [left, right].map(x => top + slopes[top] * (x - center));
      const ysBottom = [left, right].map(x => bottom + slopes[bottom] * (x - center));
      // Conservative interior rectangle; show crop to user, never hide it.
      const pad = Math.max(3, Math.round(h * .12));
      const x = left + pad, y = Math.ceil(Math.max(...ysTop)) + pad;
      const rect = { left: x, top: y, width: right - pad - x, height: Math.floor(Math.min(...ysBottom)) - pad - y };
      if (rect.width < 5 || rect.height < 5 || rect.top < 0 || rect.top + rect.height > height) return null;
      let ink = 0;
      for (let yy = rect.top; yy < rect.top + rect.height; yy++)
        for (let xx = rect.left; xx < rect.left + rect.width; xx++) ink += dark(xx, yy) ? 1 : 0;
      return { ...rect, inkRatio: ink / (rect.width * rect.height) };
    });
    if (cells.every(Boolean)) bands.push({ top, bottom, cells, estimatedColumns: candidate.columns.length !== 8 });
  }
  // Keep consecutive bands only; isolated boxes are not evidence of a table.
  const groups = [];
  for (const band of bands) {
    const last = groups.at(-1);
    if (last && band.top - last.at(-1).bottom < height * .015) last.push(band);
    else groups.push([band]);
  }
  return { width, height, lineCount: lines.length, tables: groups.filter(group => group.length >= 5) };
}
