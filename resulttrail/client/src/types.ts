export type ResultData = {
  election_id: string
  unit_id: string
  accredited: number
  cast: number
  valid: number
  rejected: number
  party_votes: Record<string, number>
  source_note: string
  state?: string
  lga?: string
  ward?: string
  capture?: { copy_seen: boolean; figures_compared: boolean; location_checked: boolean; recorded_at: string }
}

export type EvidenceDeclaration = { digest: string; mime: 'image/jpeg' | 'image/png' | 'image/webp'; size: number }
export type Submission = { report_id: string; version: number; data: ResultData; evidence?: EvidenceDeclaration }
export type Receipt = {
  body: { tenant: string; report_id: string; version: number; digest: string; received_at: string; key_id: string }
  signature: string
}
export type LocalRecord = { payload: Submission; state: 'queued' | 'received' | 'reviewed'; receipt?: Receipt; savedAt: string; evidenceState?: 'pending' | 'verified' }
export type Session = { alias: string; role: 'reporter' | 'reviewer'; tenant: string; csrf: string }
export type ReviewItem = {
  report_id: string
  version: number
  payload: Submission
  receipt: Receipt
  flags: string[]
  received_at: string
  evidence_digest?: string | null
  review: null | { decision: string; note: string; created_at: string }
}
