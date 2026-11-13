import assert from 'node:assert/strict'
import { rankReviewQueue } from '../src/reviewPriority.ts'

function item(id, overrides = {}) {
  return {
    report_id: id, version: 1, received_at: '2026-10-30T00:00:00Z',
    flags: [], review: null, evidence_digest: null, duplicate_image_reports: 0,
    comparison_count: 0, comparison_mismatches: 0,
    payload: { data: { election_id: 'SIM-2027', state: 'Niger', lga: 'Paikoro', accredited: 100, cast: 75, rejected: 2 } },
    ...overrides,
  }
}

const ranked = rankReviewQueue([
  item('without-image'),
  item('with-image', { evidence_digest: 'abc' }),
  item('ocr', { evidence_digest: 'def' }),
  item('human', { comparison_count: 1, comparison_mismatches: 1 }),
  item('arithmetic', { flags: ['Cast exceeds accredited'] }),
], { ocr: 1 })

assert.deepEqual(ranked.map(({ item: value }) => value.report_id),
  ['arithmetic', 'human', 'ocr', 'with-image', 'without-image'])
const withImage = ranked.find(({ item: value }) => value.report_id === 'with-image').priority
const withoutImage = ranked.find(({ item: value }) => value.report_id === 'without-image').priority
assert.equal(withImage.tier, withoutImage.tier)
assert.equal(withImage.score, withoutImage.score)
assert.ok(withoutImage.coverage.includes('No source image supplied'))
assert.ok(withoutImage.reasons.every(reason => !reason.toLowerCase().includes('missing image')))
assert.equal(ranked[0].priority.label, 'Arithmetic first')
assert.equal(ranked[1].priority.label, 'Human comparison follow-up')
assert.equal(ranked[2].priority.label, 'Reconcile evidence')
console.log('PASS: arithmetic and human review precedence, provisional OCR, separate evidence coverage, missing image neutrality')
