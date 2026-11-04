import type { ReviewItem } from './types'

export type Priority = { tier: number; score: number; label: string; reasons: string[]; coverage: string[] }
export type RankedItem = { item: ReviewItem; priority: Priority }

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function peerValue(item: ReviewItem, kind: 'turnout' | 'rejected'): number | null {
  const data = item.payload.data
  if (kind === 'turnout') return data.accredited > 0 ? data.cast / data.accredited : null
  return data.cast > 0 ? data.rejected / data.cast : null
}

function peerComparison(item: ReviewItem, all: ReviewItem[]): { z: number; coverage: string } {
  const data = item.payload.data
  const comparable = all.filter(value => value.payload.data.election_id === data.election_id && value.payload.data.state === data.state)
  const local = comparable.filter(value => value.payload.data.lga === data.lga)
  const peers = local.length >= 8 ? local : comparable.length >= 8 ? comparable : []
  if (!peers.length) return { z: 0, coverage: 'Peer comparison unavailable (<8 comparable reports)' }
  let largest = 0
  for (const kind of ['turnout', 'rejected'] as const) {
    const current = peerValue(item, kind)
    const values = peers.map(value => peerValue(value, kind)).filter((value): value is number => value !== null)
    if (current === null || values.length < 8) continue
    const center = median(values)
    const spread = Math.max(median(values.map(value => Math.abs(value - center))) * 1.4826, .015)
    largest = Math.max(largest, Math.abs(current - center) / spread)
  }
  return { z: largest, coverage: `Compared with ${peers.length} ${local.length >= 8 ? 'LGA' : 'state'} reports` }
}

export function rankReviewQueue(items: ReviewItem[], provisional: Record<string, number> = {}): RankedItem[] {
  return items.map(item => {
    const reasons: string[] = []
    const coverage: string[] = []
    const peer = peerComparison(item, items)
    const image = Boolean(item.evidence_digest)
    coverage.push(image ? 'Source image verified' : item.payload.evidence ? 'Declared image awaiting upload' : 'No source image supplied')
    coverage.push(`${item.comparison_count ?? 0} human field comparisons recorded`)
    coverage.push(peer.coverage)
    coverage.push(Object.hasOwn(provisional, item.report_id) ? 'OCR run in this browser' : 'OCR not run in this browser')

    let tier = 5, score = 0, label = 'Routine review'
    if (item.flags.length) {
      tier = 0; score = item.flags.length; label = 'Arithmetic first'
      reasons.push(`${item.flags.length} deterministic arithmetic check${item.flags.length === 1 ? '' : 's'}`)
    } else if ((item.comparison_mismatches ?? 0) > 0) {
      tier = 1; score = item.comparison_mismatches ?? 0; label = 'Human comparison follow-up'
      reasons.push(`${score} possible image-entry mismatch${score === 1 ? '' : 'es'} recorded by a reviewer`)
    } else if ((provisional[item.report_id] ?? 0) > 0 || (item.duplicate_image_reports ?? 0) > 0) {
      tier = 2; score = (provisional[item.report_id] ?? 0) * 10 + (item.duplicate_image_reports ?? 0); label = 'Reconcile evidence'
      if (provisional[item.report_id]) reasons.push(`${provisional[item.report_id]} provisional OCR difference${provisional[item.report_id] === 1 ? '' : 's'}; inspect source`)
      if (item.duplicate_image_reports) reasons.push('Image bytes also used by another report; may be legitimate')
    } else if (item.version > 1) {
      tier = 3; score = item.version; label = 'Compare correction'
      reasons.push('Later report version; compare changes with the earlier version')
    } else if (peer.z >= 3) {
      tier = 4; score = peer.z; label = 'Peer context'
      reasons.push('Statistical difference from comparable submitted reports; not a finding')
    } else reasons.push('No queue-priority signal beyond normal review')

    if (item.review?.decision === 'approved' || item.review?.decision === 'needs_correction') {
      tier = 6; score = 0; label = 'Final decision recorded'
      reasons.splice(0, reasons.length, `Human decision: ${item.review.decision.replace('_', ' ')}`)
    }
    return { item, priority: { tier, score, label, reasons, coverage } }
  }).sort((a, b) => a.priority.tier - b.priority.tier || b.priority.score - a.priority.score ||
    b.item.received_at.localeCompare(a.item.received_at) || a.item.report_id.localeCompare(b.item.report_id))
}
