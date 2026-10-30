import { useEffect, useState } from 'react'
import { request } from '../api'
import type { ReviewItem, Session } from '../types'

type Outcome = 'not_compared' | 'matches' | 'possible_mismatch' | 'cannot_read'
type Action = { id: number; field_key: string; outcome: Outcome; note: string; reviewer: string; created_at: string; previous_event_id: number | null }
const labels: Record<Outcome, string> = { not_compared: 'Not compared', matches: 'Matches image', possible_mismatch: 'Possible mismatch', cannot_read: 'Cannot read' }

export function FieldComparison({ item, session, refreshKey = 0 }: { item: ReviewItem; session: Session; refreshKey?: number }) {
  const [actions, setActions] = useState<Action[]>([])
  const [choices, setChoices] = useState<Record<string, Outcome>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busyField, setBusyField] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const fields = [
    ['accredited', 'Accredited', item.payload.data.accredited],
    ['cast', 'Votes cast', item.payload.data.cast],
    ['valid', 'Valid votes', item.payload.data.valid],
    ['rejected', 'Rejected votes', item.payload.data.rejected],
    ...Object.entries(item.payload.data.party_votes).map(([code, votes]) => [`party:${code}`, `Party ${code}`, votes]),
  ] as [string, string, number][]
  const key = `${item.report_id}/${item.version}`
  useEffect(() => {
    let active = true
    void request<{ actions: Action[] }>(`/review/${item.report_id}/fields?version=${item.version}`)
      .then(value => {
        if (!active) return
        setActions(value.actions)
        const latest = new Map(value.actions.map(action => [action.field_key, action]))
        setChoices(Object.fromEntries([...latest].map(([field, action]) => [field, action.outcome])))
        setNotes(Object.fromEntries([...latest].map(([field, action]) => [field, action.note])))
      }).catch(error => { if (active) setMessage((error as Error).message) })
    return () => { active = false }
  }, [key, item.report_id, item.version, refreshKey])
  const latest = new Map(actions.map(action => [action.field_key, action]))
  const locked = item.review?.decision === 'approved' || item.review?.decision === 'needs_correction'
  async function save(field: string) {
    const outcome = choices[field] ?? 'not_compared', note = notes[field]?.trim() ?? ''
    if (outcome !== 'not_compared' && outcome !== 'matches' && note.length < 2) { setMessage('Add a short note explaining the comparison.'); return }
    setBusyField(field); setMessage('')
    try {
      await request(`/review/${item.report_id}/fields?version=${item.version}`, 'POST', { field_key: field, outcome, note: outcome === 'matches' && !note ? 'Compared with attached image' : note }, session.csrf)
      const answer = await request<{ actions: Action[] }>(`/review/${item.report_id}/fields?version=${item.version}`)
      setActions(answer.actions); setMessage(`${field.replace('party:', 'Party ')} comparison saved.`)
    } catch (error) { setMessage((error as Error).message) } finally { setBusyField(null) }
  }
  return <section className="field-comparison" aria-label="Field-by-field image comparison">
    <div className="surface-heading"><div><h3>Compare image and entries</h3><p>Inspect the image for each figure. These are human review notes, not OCR findings.</p></div><span className="eyebrow">{latest.size} of {fields.length} fields logged</span></div>
    {message && <p role="status" className="help">{message}</p>}
    <div className="comparison-fields">{fields.map(([field, label, value]) => <div className="comparison-field" key={field}>
      <div><strong>{label}</strong><span>Entered: {value}</span><small>Latest: {labels[latest.get(field)?.outcome ?? 'not_compared']}</small></div>
      <label>Comparison<select aria-label={`${label} comparison`} value={choices[field] ?? 'not_compared'} disabled={locked || !item.evidence_digest} onChange={event => setChoices(previous => ({ ...previous, [field]: event.target.value as Outcome }))}>{Object.entries(labels).map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label>
      <label>Reviewer note<input aria-label={`${label} comparison note`} maxLength={300} value={notes[field] ?? ''} disabled={locked || !item.evidence_digest} onChange={event => setNotes(previous => ({ ...previous, [field]: event.target.value }))} placeholder="What did you see on the image?" /></label>
      <button className="quiet" type="button" disabled={locked || !item.evidence_digest || busyField !== null} onClick={() => void save(field)}>{busyField === field ? 'Saving…' : 'Save comparison'}</button>
    </div>)}</div>
    {!item.evidence_digest && <p className="help">No uploaded image is available for this version. Field comparison is paused.</p>}
    {actions.length > 0 && <details className="comparison-history"><summary>Comparison history ({actions.length})</summary><ol>{actions.map(action => <li key={action.id}><strong>{action.field_key.replace('party:', 'Party ')}: {labels[action.outcome]}</strong> · {action.note || 'No note'} · {action.reviewer} · {new Date(action.created_at).toLocaleString()} <small>Event {action.id}{action.previous_event_id ? ` follows ${action.previous_event_id}` : ''}</small></li>)}</ol></details>}
    <p className="help">A comparison note does not edit the submitted figures. A correction requires a new reporter version.</p>
  </section>
}
