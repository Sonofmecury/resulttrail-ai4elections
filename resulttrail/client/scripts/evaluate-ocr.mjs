import { createWorker } from 'tesseract.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { parsePrintedResultTsv } from '../src/ocr/parseTsv.ts'

const root = resolve(import.meta.dirname, '../..')
const corpus = resolve(root, 'instance/ocr-corpus')
const manifest = JSON.parse(readFileSync(resolve(corpus, 'manifest.json'), 'utf8'))
const rows = manifest.rows.filter(row => row.split === 'holdout')
const worker = await createWorker('eng', 1, { langPath: resolve(root, 'client/public/ocr') })
const details = []
try {
  for (const row of rows) {
    const start = performance.now()
    const result = await worker.recognize(resolve(corpus, row.file), {}, { tsv: true })
    const suggestions = parsePrintedResultTsv(result.data.tsv ?? result.tsv ?? '')
    const correct = suggestions.filter(s => row.values[s.field] === s.value).length
    details.push({ file: row.file, condition: row.condition, layout: row.layout, suggestions,
      available: Object.keys(row.values).length, suggested: suggestions.length, correct,
      errors: suggestions.filter(s => row.values[s.field] !== s.value).map(s => ({ field: s.field, suggested: s.value, actual: row.values[s.field] })),
      latency_ms: Math.round(performance.now() - start) })
  }
} finally { await worker.terminate() }
const sum = (key, group = details) => group.reduce((value, row) => value + row[key], 0)
const suggested = sum('suggested'), correct = sum('correct'), available = sum('available')
const sortedLatency = details.map(row => row.latency_ms).sort((a, b) => a - b)
const byCondition = Object.fromEntries([...new Set(details.map(row => row.condition))].sort().map(condition => {
  const group = details.filter(row => row.condition === condition)
  return [condition, { sheets: group.length, suggested: sum('suggested', group), correct: sum('correct', group), errors: sum('suggested', group) - sum('correct', group) }]
}))
const byLayout = Object.fromEntries([...new Set(details.map(row => row.layout))].sort().map(layout => {
  const group = details.filter(row => row.layout === layout)
  return [layout, { sheets: group.length, suggested: sum('suggested', group), correct: sum('correct', group) }]
}))
// Deliberately perturb one entered field on every fourth sheet to exercise only the
// reconciliation plumbing. This does not simulate a human transcription study.
let mismatchTp = 0, mismatchFp = 0, mismatchFn = 0
for (const [index, row] of rows.entries()) {
  const result = details[index]
  const target = index % 4 === 0 ? 'cast' : null
  const recognized = result.suggestions ?? []
  for (const field of Object.keys(row.values)) {
    const entered = row.values[field] + (target === field ? 1 : 0)
    const proposal = recognized.find(item => item.field === field)
    const flagged = Boolean(proposal && proposal.value !== entered)
    if (flagged && target === field) mismatchTp++
    else if (flagged) mismatchFp++
    else if (target === field) mismatchFn++
  }
}
const output = { version: 'ocr-printed-v1', corpus_seed: manifest.seed, sheets: details.length,
  fields_available: available, high_confidence_suggestions: suggested, correct,
  precision: suggested ? correct / suggested : null, field_exact_match: correct / available,
  abstention: 1 - suggested / available,
  p95_latency_ms: sortedLatency[Math.ceil(sortedLatency.length * .95) - 1],
  peak_process_rss_bytes: process.memoryUsage().rss, by_condition: byCondition, by_layout: byLayout,
  synthetic_mismatch_probe: { true_positives: mismatchTp, false_positives: mismatchFp,
    false_negatives: mismatchFn, precision: mismatchTp + mismatchFp ? mismatchTp / (mismatchTp + mismatchFp) : null,
    recall: mismatchTp + mismatchFn ? mismatchTp / (mismatchTp + mismatchFn) : null },
  wrong_suggestions: details.flatMap(row => row.errors.map(error => ({ file: row.file, ...error }))),
  independent_photographed_holdout: false, consented_usability_test: false,
  gate_passed: false, product_ocr_enabled: false,
  limits: 'Computer-rendered fictional sheets only. No photographed holdout, low-end phone measurements, or consented comparison with manual entry.' }
writeFileSync(resolve(root, 'docs/ocr-evaluation.json'), JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify({ sheets: output.sheets, suggested, correct, precision: output.precision, abstention: output.abstention, gate_passed: false }))
