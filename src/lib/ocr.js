// Reads a CommBank screenshot on this device (Ken, 27 Oct 2026). Browser only; the picture never leaves the
// phone. The reader (Tesseract, about 7 MB) is served by moni itself from /moni/ocr/ (copied there at build
// time by scripts/copy-ocr.mjs) and downloaded the first time it is used, never before.
//
// Steps: make a clean black-on-white copy at twice the size (OCR reads dark-on-light far better than the
// app's light-on-dark), read its words with their positions, then hand them to parseShotLines (screenshot.js).
// Money in is told by CommBank's green pill around the amount (looked up in the original colors), because
// OCR often drops the minus sign of money out.
import { parseShotLines } from './screenshot.js';

const SCALE = 2;

async function loadImage(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

let workerPromise = null;
async function getWorker(onStatus) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      // Absolute: the reader runs in a worker made from a blob, where relative paths don't resolve.
      const base = new URL(`${import.meta.env.BASE_URL}ocr/`, window.location.href).href;
      return createWorker('eng', 1, {
        workerPath: `${base}worker.min.js`,
        corePath: base,
        langPath: base,
        gzip: true,
        logger: (m) => onStatusRef.fn?.(m),
      });
    })();
    workerPromise.catch(() => { workerPromise = null; });
  }
  onStatusRef.fn = onStatus;
  return workerPromise;
}
const onStatusRef = { fn: null };

// Returns { rows, account, title } (see parseShotLines).
export async function readScreenshot(file, { today, onStatus } = {}) {
  const img = await loadImage(file);
  const W = img.width;
  const H = img.height;
  const orig = document.createElement('canvas');
  orig.width = W; orig.height = H;
  const octx = orig.getContext('2d', { willReadFrequently: true });
  octx.drawImage(img, 0, 0);
  const px = octx.getImageData(0, 0, W, H).data;

  const pre = document.createElement('canvas');
  pre.width = W * SCALE; pre.height = H * SCALE;
  const pctx = pre.getContext('2d', { willReadFrequently: true });
  pctx.imageSmoothingQuality = 'high';
  pctx.drawImage(img, 0, 0, W * SCALE, H * SCALE);
  const im = pctx.getImageData(0, 0, pre.width, pre.height);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 255 - (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    const v = g > 150 ? 255 : g < 90 ? 0 : g;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  pctx.putImageData(im, 0, 0);

  const isGreen = (b) => {
    let n = 0;
    let t = 0;
    for (let y = Math.max(0, Math.floor(b.y0)); y < Math.min(H, b.y1); y++) {
      for (let x = Math.max(0, Math.floor(b.x0)); x < Math.min(W, b.x1); x++) {
        const k = (y * W + x) * 4;
        const r = px[k], g = px[k + 1], bl = px[k + 2];
        t++;
        if (g > 100 && g - r > 30 && g - bl > 25) n++;
      }
    }
    return t > 0 && n / t > 0.04;
  };

  onStatus?.({ status: 'loading' });
  const worker = await getWorker(onStatus);
  const { data } = await worker.recognize(pre, {}, { blocks: true, text: false });
  const lines = (data.blocks ?? []).flatMap((bl) => bl.paragraphs.flatMap((p) => p.lines)).map((l) => ({
    words: l.words.map((w) => ({ text: w.text, x0: w.bbox.x0 / SCALE, y0: w.bbox.y0 / SCALE, x1: w.bbox.x1 / SCALE, y1: w.bbox.y1 / SCALE })),
  }));
  if (img.close) img.close();
  return parseShotLines({ width: W, height: H, lines, isGreen, today });
}
