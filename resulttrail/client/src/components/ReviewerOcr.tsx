import { useEffect, useState } from 'react'
import { request } from '../api'
import { recognizeResultImage } from '../ocr/recognize'
import type { Suggestion } from '../ocr/parseTsv'
import type { ReviewItem, Session } from '../types'

type Source = { blob: Blob; url: string; width: number; height: number }
type Props = { item: ReviewItem; session: Session; onAudit: () => void; onProvisional: (reportId: string, count: number) => void }

function enteredValue(item: ReviewItem, field: string): number | undefined {
  if (field.startsWith('party:')) return item.payload.data.party_votes[field.slice(6)]
  if (field === 'accredited' || field === 'cast' || field === 'valid' || field === 'rejected') return item.payload.data[field]
  return undefined
}

async function verifiedSource(reportId: string, version: number, expectedDigest: string): Promise<Source> {
  const response = await fetch(`/api/results/${reportId}/evidence?version=${version}`, { credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) throw new Error('The source image could not be loaded')
  const blob = await response.blob()
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), value => value.toString(16).padStart(2, '0')).join('')
  if (digest !== expectedDigest) throw new Error('The source image hash did not match this version')
  const bitmap = await createImageBitmap(blob)
  const width = bitmap.width, height = bitmap.height
  bitmap.close()
  return { blob, url: URL.createObjectURL(blob), width, height }
}

export function ReviewerOcr({ item, session, onAudit, onProvisional }: Props) {
  const [source, setSource] = useState<Source | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selectedField, setSelectedField] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyField, setBusyField] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const locked = item.review?.decision === 'approved' || item.review?.decision === 'needs_correction'

  useEffect(() => {
    let active = true, url: string | null = null
    void verifiedSource(item.report_id, item.version, item.evidence_digest ?? '').then(value => {
      url = value.url
      if (active) setSource(value)
      else URL.revokeObjectURL(value.url)
    }).catch(error => { if (active) setMessage((error as Error).message) })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [item.report_id, item.version, item.evidence_digest])

  async function readImage() {
    if (!source) return
    setBusy(true); setMessage('')
    try {
      const result = await recognizeResultImage(source.blob)
      setSuggestions(result.suggestions)
      setSelectedField(result.suggestions[0]?.field ?? null)
      onProvisional(item.report_id, result.suggestions.filter(value => enteredValue(item, value.field) !== undefined && enteredValue(item, value.field) !== value.value).length)
      setMessage(result.suggestions.length ? 'Compare each hint with the highlighted original region before recording a human action.' : 'No high-confidence figures found. Inspect the original manually.')
    } catch (error) { setMessage(`OCR could not read this image: ${(error as Error).message}`) }
    finally { setBusy(false) }
  }

  async function audit(suggestion: Suggestion, outcome: 'matches' | 'possible_mismatch' | 'cannot_read' | 'not_compared') {
    const entered = enteredValue(item, suggestion.field)
    if (entered === undefined) return
    const note = `${outcome === 'not_compared' ? 'Dismissed OCR hint' : outcome === 'cannot_read' ? 'Image region unreadable on human review' : 'Human checked image'}; entered ${entered}, OCR ${suggestion.value} (${suggestion.confidence}%); region ${suggestion.box.x},${suggestion.box.y},${suggestion.box.width},${suggestion.box.height}.`
    setBusyField(suggestion.field); setMessage('')
    try {
      await request(`/review/${item.report_id}/fields?version=${item.version}`, 'POST', { field_key: suggestion.field, outcome, note }, session.csrf)
      setMessage(`${suggestion.field.replace('party:', 'Party ')} action saved in comparison history.`)
      onAudit()
    } catch (error) { setMessage((error as Error).message) }
    finally { setBusyField(null) }
  }

  const selected = suggestions.find(value => value.field === selectedField)
  return <section className="reviewer-ocr ocr-experiment" aria-label="Experimental reviewer OCR">
    <span className="experimental-tag">Experimental · unvalidated OCR</span>
    <h3>Image-to-entry comparison</h3>
    <p className="help">Run OCR on this verified image, then inspect the highlighted region yourself. Its text is a hint, not a finding. Human actions enter the existing audit history; submitted figures never change.</p>
    <button type="button" className="quiet" disabled={!source || busy} onClick={() => void readImage()}>{busy ? 'Reading source…' : 'Read source image on this device'}</button>
    {message && <p className="help" role="status">{message}</p>}
    {source && suggestions.length > 0 && <div className="reviewer-ocr-layout">
      <div className="ocr-image-stage"><img src={source.url} alt="Original source with selected OCR region" />{selected && <span className="ocr-region" aria-label={`Region for ${selected.field}`} style={{ left: `${selected.box.x / source.width * 100}%`, top: `${selected.box.y / source.height * 100}%`, width: `${selected.box.width / source.width * 100}%`, height: `${selected.box.height / source.height * 100}%` }} />}</div>
      <div className="ocr-review-rows">{suggestions.map(suggestion => {
        const entered = enteredValue(item, suggestion.field)
        if (entered === undefined) return null
        return <div className={`ocr-review-row ${selectedField === suggestion.field ? 'selected' : ''}`} key={suggestion.field}>
          <button type="button" className="ocr-row-focus" onClick={() => setSelectedField(suggestion.field)}><strong>{suggestion.field.replace('party:', 'Party ')}</strong><span>Entered {entered} · OCR {suggestion.value} · {suggestion.confidence}%</span><em>{entered === suggestion.value ? 'Same figures' : 'Different figures · inspect'}</em></button>
          <div className="ocr-audit-actions"><button type="button" className="quiet" disabled={locked || busyField !== null} onClick={() => void audit(suggestion, 'matches')}>Confirm match</button><button type="button" className="quiet" disabled={locked || busyField !== null} onClick={() => void audit(suggestion, 'possible_mismatch')}>Mark mismatch</button><button type="button" className="text-button" disabled={locked || busyField !== null} onClick={() => void audit(suggestion, 'cannot_read')}>Unreadable</button><button type="button" className="text-button" disabled={locked || busyField !== null} onClick={() => void audit(suggestion, 'not_compared')}>Dismiss hint</button></div>
        </div>
      })}</div>
    </div>}
  </section>
}
