import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'node_modules/tesseract.js/package.json'), 'utf8'))
const lang = JSON.parse(readFileSync(resolve(root, 'node_modules/@tesseract.js-data/eng/package.json'), 'utf8'))
if (pkg.version !== '7.0.0' || lang.version !== '1.0.0') throw new Error('OCR asset versions changed; review them before building')

const output = resolve(root, 'public/ocr')
mkdirSync(output, { recursive: true })
for (const name of [
  'tesseract-core.wasm.js',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-relaxedsimd.wasm.js',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
]) copyFileSync(resolve(root, 'node_modules/tesseract.js-core', name), resolve(output, name))
copyFileSync(resolve(root, 'node_modules/tesseract.js/dist/worker.min.js'), resolve(output, 'worker.min.js'))
copyFileSync(resolve(root, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), resolve(output, 'eng.traineddata.gz'))
console.log('Prepared pinned same-origin OCR assets')
