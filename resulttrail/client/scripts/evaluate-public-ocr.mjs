// OCR stress benchmark on external document datasets; no ResultTrail field validation.
import { createWorker } from 'tesseract.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

const root = resolve(import.meta.dirname, '../..')
const dataset = process.argv[2]
if (!['sroie', 'funsd'].includes(dataset)) throw new Error('Usage: node client/scripts/evaluate-public-ocr.mjs sroie|funsd')
const base = resolve(root, 'instance/public-ocr')
const manifest = JSON.parse(readFileSync(resolve(base, dataset, 'manifest.json'), 'utf8'))
const labels = ['original', '750kb', '1_5mb', '2mb']
const isNumber = value => /^\d{1,9}(?:[.,]\d{1,3})?$/.test(value.trim())
const normal = value => value.trim().replaceAll(',', '')
const cache = new Map()
const worker = await createWorker('eng', 1, { langPath: resolve(root, 'client/public/ocr') })

function tokens(tsv) {
  return tsv.split(/\r?\n/).slice(1).flatMap(row => {
    const cells = row.split('\t')
    if (cells[0] !== '5' || cells.length < 12) return []
    const text = cells.slice(11).join('\t').trim()
    const conf = Number(cells[10])
    if (!isNumber(text) || !Number.isFinite(conf) || conf < 95) return []
    return [{ text, conf, box: [Number(cells[6]), Number(cells[7]), Number(cells[6]) + Number(cells[8]), Number(cells[7]) + Number(cells[9])] }]
  })
}

function overlap(candidate, target) {
  const x = Math.max(0, Math.min(candidate[2], target[2]) - Math.max(candidate[0], target[0]))
  const y = Math.max(0, Math.min(candidate[3], target[3]) - Math.max(candidate[1], target[1]))
  const area = Math.max(1, (candidate[2] - candidate[0]) * (candidate[3] - candidate[1]))
  return x * y / area
}

function score(row, variant, recognized) {
  const original = row.variants.original
  const sx = variant.width / original.width, sy = variant.height / original.height
  const targets = row.ground_truth.filter(word => isNumber(word.text))
  const available = new Set(recognized.map((_, index) => index))
  let correct = 0, wrong = 0, abstained = 0
  for (const target of targets) {
    const box = [target.box[0] * sx, target.box[1] * sy, target.box[2] * sx, target.box[3] * sy]
    const matches = [...available].map(index => ({ index, fraction: overlap(recognized[index].box, box) }))
      .filter(hit => hit.fraction >= .3).sort((a, b) => b.fraction - a.fraction || recognized[b.index].conf - recognized[a.index].conf)
    if (!matches.length) { abstained++; continue }
    const index = matches[0].index
    available.delete(index)
    if (normal(recognized[index].text) === normal(target.text)) correct++
    else wrong++
  }
  return { regions: targets.length, correct, wrong, abstained, proposed: correct + wrong }
}

const details = []
try {
  for (const row of manifest.rows) {
    for (const label of labels) {
      const variant = row.variants[label]
      const key = variant.sha256
      if (!cache.has(key)) {
        const start = performance.now()
        const answer = await worker.recognize(resolve(base, variant.path), {}, { tsv: true })
        cache.set(key, { words: tokens(answer.data.tsv ?? ''), ms: Math.round(performance.now() - start) })
      }
      const result = cache.get(key)
      details.push({ id: row.id, variant: label, bytes: variant.bytes, changed: Boolean(variant.changed),
        ms: result.ms, ...score(row, variant, result.words) })
    }
  }
} finally { await worker.terminate() }

function summary(rows) {
  const sum = field => rows.reduce((total, row) => total + row[field], 0)
  const proposed = sum('proposed'), regions = sum('regions'), correct = sum('correct')
  const latency = rows.map(row => row.ms).sort((a, b) => a - b)
  return { images: rows.length, numeric_regions: regions, proposed, correct,
    wrong: sum('wrong'), abstained: sum('abstained'),
    precision_in_annotated_numeric_regions: proposed ? correct / proposed : null,
    exact_region_coverage: regions ? correct / regions : null,
    changed_images: sum('changed'), mean_bytes: Math.round(sum('bytes') / rows.length),
    p95_ocr_ms: latency[Math.ceil(latency.length * .95) - 1] }
}
const output = { dataset: manifest.dataset, split: manifest.split, source: manifest.source,
  source_revision: manifest.source_revision ?? null,
  source_terms: manifest.terms, images: manifest.rows.length,
  unique_original_images: new Set(manifest.rows.map(row => row.variants.original.sha256)).size,
  unique_image_versions_processed: cache.size,
  conditions: Object.fromEntries(labels.map(label => [label, summary(details.filter(row => row.variant === label))])),
  limits: 'Numeric-only text boxes on forms/receipts. Spatial matching tests OCR recognition, not ResultTrail field mapping, handwriting, reporter acceptance, or election-result accuracy. Size tiers have no effect when originals already fit.' }
const path = resolve(root, `docs/public-ocr-${dataset}-evaluation.json`)
writeFileSync(path, JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify({ output: path, dataset: manifest.dataset, original: output.conditions.original,
  changed_at_750kb: output.conditions['750kb'].changed_images }))
