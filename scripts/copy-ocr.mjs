// Copies the screenshot reader (Tesseract) into public/ocr so moni serves it itself (src/lib/ocr.js).
// Runs before `npm run dev` and `npm run build`. public/ocr is not committed (see .gitignore).
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const out = join(dirname(new URL(import.meta.url).pathname), '..', 'public', 'ocr');
mkdirSync(out, { recursive: true });
const tjs = dirname(require.resolve('tesseract.js/package.json'));
const core = dirname(require.resolve('tesseract.js-core/package.json'));
const lang = dirname(require.resolve('@tesseract.js-data/eng/package.json'));
const files = [
  [join(tjs, 'dist', 'worker.min.js'), 'worker.min.js'],
  ...['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'].map((f) => [join(core, f), f]),
  [join(lang, '4.0.0_best_int', 'eng.traineddata.gz'), 'eng.traineddata.gz'],
];
for (const [from, name] of files) {
  if (!existsSync(from)) throw new Error(`Missing ${from}`);
  copyFileSync(from, join(out, name));
}
console.log(`copy-ocr: ${files.length} files -> public/ocr`);
