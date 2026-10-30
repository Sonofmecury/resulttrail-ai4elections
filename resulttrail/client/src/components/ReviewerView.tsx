import { useEffect, useState } from 'react'
import { request, verifyReceipt } from '../api'
import { GeoExplorer } from './GeoExplorer'
import { EvidenceImage } from './EvidenceImage'
import { FieldComparison } from './FieldComparison'
import { ReviewerOcr } from './ReviewerOcr'
import { ocrDemoEnabled, rankingDemoEnabled } from '../experiments'
import { rankReviewQueue, type Priority } from '../reviewPriority'
import type { ReviewItem, Session, Submission } from '../types'

type ExportPackage = { body: { export_id: string }; digest: string; signature: string; key_id: string }
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const checkLabel = (count: number) => count ? `${count} ${count === 1 ? 'check' : 'checks'}` : 'No checks'
async function getReviewQueue() {
  const response = await request<{ items: ReviewItem[] }>('/review')
  return { items: response.items, updatedAt: new Date() }
}

export function ReviewerView({ session }: { session: Session }) {
  const [items, setItems] = useState<ReviewItem[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState('Checked against the source copy')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [section, setSection] = useState<'overview' | 'map' | 'review'>('overview')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'attention' | 'approved'>('all')
  const [selectedState, setSelectedState] = useState<string | null>(null)
  const [compareVersion, setCompareVersion] = useState<number | null>(null)
  const [versions, setVersions] = useState<{ version: number; payload: Submission; flags: string[] }[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [receiptStatus, setReceiptStatus] = useState<{ id: string; message: string } | null>(null)
  const [provisional, setProvisional] = useState<Record<string, number>>({})
  const [auditRefresh, setAuditRefresh] = useState(0)
  const ocrEnabled = ocrDemoEnabled(session), rankingEnabled = rankingDemoEnabled(session)
  async function load() {
    const response = await getReviewQueue()
    setItems(response.items)
    setSelected(current => current ?? response.items[0]?.report_id ?? null)
    setLastUpdated(response.updatedAt)
  }
  useEffect(() => {
    let active = true
    void getReviewQueue().then(response => {
      if (!active) return
      setItems(response.items)
      setSelected(response.items[0]?.report_id ?? null)
      setLastUpdated(response.updatedAt)
    }).catch(e => { if (active) setMessage((e as Error).message) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!selected) return
    void request<{ versions: { version: number; payload: Submission; flags: string[] }[] }>(`/results/${selected}/status`)
      .then(value => setVersions(value.versions)).catch(e => setMessage((e as Error).message))
  }, [selected, items])
  const item = items.find(entry => entry.report_id === selected)
  async function decide(decision: 'reviewed' | 'approved' | 'needs_correction') {
    if (!item) return
    setBusy(true); setMessage('')
    try {
      await request(`/review/${item.report_id}/decision`, 'POST', { decision, version: item.version, note: note.trim() }, session.csrf)
      await load(); setMessage(`Version ${item.version} marked ${decision.replace('_', ' ')}.`)
    } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  async function exportApproved() {
    if (!item) return
    setBusy(true); setMessage('')
    try {
      const result = await request<ExportPackage>('/exports', 'POST', { report_id: item.report_id }, session.csrf)
      download(`resulttrail-${result.body.export_id}.json`, result)
      const publicKey = await request(`/public-key/${result.key_id}`)
      download(`resulttrail-${result.key_id}.json`, publicKey)
      setMessage('Minimized signed package and verification key downloaded.')
    } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  async function checkReceipt() {
    if (!item) return
    const id = `${item.report_id}/${item.version}`
    setReceiptStatus({ id, message: 'Checking signature…' })
    try { await verifyReceipt(item.receipt, item.payload); setReceiptStatus({ id, message: 'Receipt signature and record digest verified.' }) }
    catch (error) { setReceiptStatus({ id, message: `Verification failed: ${(error as Error).message}` }) }
  }
  const attention = items.filter(entry => !entry.review || entry.review.decision === 'needs_correction').length
  const approved = items.filter(entry => entry.review?.decision === 'approved').length
  const ranked = rankingEnabled ? rankReviewQueue(items, provisional) : []
  const priorityById = new Map(ranked.map(entry => [entry.item.report_id, entry.priority]))
  const itemPriority = item ? priorityById.get(item.report_id) : undefined
  const ordered = rankingEnabled ? ranked.map(entry => entry.item) : items
  const filtered = ordered.filter(entry => {
    const text = `${entry.payload.data.unit_id} ${entry.payload.data.state ?? ''} ${entry.payload.data.lga ?? ''}`.toLowerCase()
    return text.includes(query.toLowerCase()) && (!selectedState || entry.payload.data.state === selectedState) && (filter === 'all' || filter === 'attention' && (!entry.review || entry.review.decision === 'needs_correction') || filter === 'approved' && entry.review?.decision === 'approved')
  })
  const older = versions.find(entry => entry.version === (compareVersion ?? ((item?.version ?? 1) - 1)))
  const versionChanges = older && item ? [
    ...(['accredited', 'cast', 'valid', 'rejected'] as const).filter(field => older.payload.data[field] !== item.payload.data[field]).map(field => `${field}: ${older.payload.data[field]} → ${item.payload.data[field]}`),
    ...[...new Set([...Object.keys(older.payload.data.party_votes), ...Object.keys(item.payload.data.party_votes)])].filter(code => older.payload.data.party_votes[code] !== item.payload.data.party_votes[code]).map(code => `Party ${code}: ${older.payload.data.party_votes[code] ?? 'absent'} → ${item.payload.data.party_votes[code] ?? 'absent'}`),
  ] : []
  function open(id: string) { setSelected(id); setSection('review') }
  return <div className="new-workspace reviewer-workspace">
    <nav className="workspace-nav" aria-label="Reviewer sections"><button className={section === 'overview' ? 'active' : ''} onClick={() => setSection('overview')}>Overview</button><button className={section === 'map' ? 'active' : ''} onClick={() => setSection('map')}>Geographic explorer</button><button className={section === 'review' ? 'active' : ''} onClick={() => setSection('review')}>Evidence review</button></nav>
    {lastUpdated && <p className="last-updated">Updated {lastUpdated.toLocaleTimeString()} · Use Refresh to check for new reports</p>}
    {message && <div role="status" className="workspace-message">{message}</div>}
    {section === 'overview' && <><div className="status-grid reviewer-stats"><div><span>Received</span><strong>{items.length}</strong><small>Latest versions</small></div><div><span>Needs attention</span><strong>{attention}</strong><small>Pending or returned</small></div><div><span>Approved</span><strong>{approved}</strong><small>Human decision recorded</small></div></div>
      <section className="surface"><div className="surface-heading"><div><span className="eyebrow">Review queue</span><h2>Reports requiring attention</h2><p>Arithmetic checks are prompts to inspect the source, never findings of fraud.</p></div><button className="quiet" onClick={() => void load()}>Refresh</button></div><ReviewList entries={ordered.filter(entry => !entry.review || entry.review.decision === 'needs_correction').slice(0, 12)} selected={selected} onOpen={open} priorities={priorityById} /></section>
      <div className="reviewer-callout"><div><span className="eyebrow">Geographic context</span><h2>Explore coverage by state</h2><p>See where submissions have arrived and how many need arithmetic review. The map never claims to measure irregularities.</p></div><button className="primary" onClick={() => setSection('map')}>Open explorer</button></div>
    </>}
    {section === 'map' && <GeoExplorer items={items} selectedState={selectedState} onSelect={setSelectedState} onOpen={open} />}
    {section === 'review' && <div className="review-workbench">
      <aside className="surface review-queue"><div className="surface-heading"><div><span className="eyebrow">Evidence queue</span><h2>Received reports</h2></div><button className="quiet" onClick={() => void load()}>Refresh</button></div><input className="queue-search" aria-label="Search reports" placeholder="Search unit, state or LGA" value={query} onChange={e => setQuery(e.target.value)} /><div className="segmented queue-filters" aria-label="Filter reports"><button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>All</button><button className={filter === 'attention' ? 'selected' : ''} onClick={() => setFilter('attention')}>Attention</button><button className={filter === 'approved' ? 'selected' : ''} onClick={() => setFilter('approved')}>Approved</button></div>{selectedState && <button className="text-button" onClick={() => setSelectedState(null)}>Clear {selectedState} filter</button>}<ReviewList entries={filtered} selected={selected} onOpen={setSelected} priorities={priorityById} /></aside>
      <section className="surface review-detail">{item ? <><div className="surface-heading"><div><span className="eyebrow">Version {item.version} · {item.payload.data.state || 'State not set'}</span><h2>{item.payload.data.unit_id}</h2><p>{[item.payload.data.lga, item.payload.data.ward].filter(Boolean).join(' · ') || 'Result copy'} · ID {item.report_id.slice(0, 8)}</p></div><span className={`status-label ${item.review?.decision === 'approved' ? 'reviewed' : 'received'}`}>{item.review?.decision.replace('_', ' ') ?? 'Awaiting review'}</span></div>
        <div className="metric-strip">{([['Accredited', item.payload.data.accredited], ['Cast', item.payload.data.cast], ['Valid', item.payload.data.valid], ['Rejected', item.payload.data.rejected]] as const).map(([name, value]) => <div key={name}><span>{name}</span><strong>{value}</strong></div>)}</div>
        {rankingEnabled && itemPriority && <section className="priority-experiment" aria-label="Experimental review priority"><span className="experimental-tag">Experimental · unvalidated ranking</span><div className="priority-columns"><div><h3>Review priority</h3><strong>{itemPriority.label}</strong><ul>{itemPriority.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div><div><h3>Evidence coverage</h3><ul>{itemPriority.coverage.map(coverage => <li key={coverage}>{coverage}</li>)}</ul></div></div><p className="help">Priority helps order inspection. It cannot determine authenticity, fraud or approval. Missing evidence is unknown, not suspicious.</p></section>}
        <div className="detail-columns"><div><h3>Party figures</h3><div className="party-list">{Object.entries(item.payload.data.party_votes).map(([party, votes]) => <div key={party}><span>Party {party}</span><strong>{votes}</strong></div>)}</div></div><div><h3>Arithmetic checks</h3>{item.flags.length ? <ul className="flag-list">{item.flags.map(flag => <li key={flag}>{flag}</li>)}</ul> : <p className="clear-check">No arithmetic discrepancies detected.</p>}<p className="help">{rankingEnabled ? 'Experimental review priority is shown below. A human still checks the original.' : 'Automated anomaly ranking is not active; reviewers use the checks and source evidence shown here.'}</p></div></div>
        <h3>Capture checks</h3><p className="source-note">{item.payload.data.capture ? `Reporter confirmed the copy, figures and location. Device-recorded time: ${new Date(item.payload.data.capture.recorded_at).toLocaleString()}. This device time is not independently verified.` : 'This version predates the guided capture checklist.'}</p>
        <h3>Source note</h3><p className="source-note">{item.payload.data.source_note || 'No source note provided.'}</p>
        <div className="review-evidence-grid"><div><h3>Source image</h3>{item.evidence_digest ? <EvidenceImage reportId={item.report_id} version={item.version} expectedDigest={item.evidence_digest} unitId={item.payload.data.unit_id} /> : <p className="empty-inline">{item.payload.evidence ? 'Declared image upload is pending.' : 'No image attached to this version.'}</p>}{Boolean(item.duplicate_image_reports) && <p className="small-warning">This image hash also appears on {item.duplicate_image_reports} other report{item.duplicate_image_reports === 1 ? '' : 's'} in this workspace. Reconcile the records; identical bytes alone do not establish an error.</p>}</div><FieldComparison key={`${item.report_id}/${item.version}`} item={item} session={session} refreshKey={auditRefresh} /></div>
        {ocrEnabled && item.evidence_digest && <ReviewerOcr key={`${item.report_id}/${item.version}`} item={item} session={session} onAudit={() => { setAuditRefresh(value => value + 1); void load() }} onProvisional={(id, count) => setProvisional(previous => ({ ...previous, [id]: count }))} />}
        {versions.length > 1 && <><div className="surface-heading version-head"><div><h3>Compare versions</h3><p>Previous versions stay available after correction. Changes are not automatically suspicious.</p></div><select aria-label="Compare with version" value={compareVersion ?? item.version - 1} onChange={e => setCompareVersion(Number(e.target.value))}>{versions.filter(entry => entry.version < item.version).map(entry => <option key={entry.version} value={entry.version}>Version {entry.version}</option>)}</select></div>{older && <div className="comparison"><div><span>Earlier · v{older.version}</span><strong>Cast {older.payload.data.cast} · valid {older.payload.data.valid} · rejected {older.payload.data.rejected}</strong><small>{older.payload.data.source_note || 'No note'}</small></div><div><span>Current · v{item.version}</span><strong>Cast {item.payload.data.cast} · valid {item.payload.data.valid} · rejected {item.payload.data.rejected}</strong><small>{item.payload.data.source_note || 'No note'}</small></div></div>}{older && <p className="help">{versionChanges.length ? `Changed fields: ${versionChanges.join(' · ')}` : 'No numeric fields changed between these versions.'}</p>}</>}
        <h3>Evidence trail</h3><ol className="evidence-timeline"><li><strong>Version received</strong><span>{new Date(item.received_at).toLocaleString()} · signed receipt {item.receipt.body.digest.slice(0, 16)}…</span></li>{item.evidence_digest && <li><strong>Source image attached</strong><span>Original hash stored and signed for this version.</span></li>}{item.review && <li><strong>{item.review.decision.replace('_', ' ')}</strong><span>{new Date(item.review.created_at).toLocaleString()} · {item.review.note}</span></li>}</ol>
        <div className="receipt-check"><button className="quiet" onClick={() => void checkReceipt()}>Verify signed receipt</button>{receiptStatus?.id === `${item.report_id}/${item.version}` && <span role="status">{receiptStatus.message}</span>}</div>
        <div className="decision-panel">{item.review?.decision === 'approved' || item.review?.decision === 'needs_correction' ? <p className="decision-recorded">Decision recorded: <strong>{item.review.decision.replace('_', ' ')}</strong>. A new submission version is needed for another review.</p> : <><label>Review note<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={2} /></label><div className="form-actions"><button className="primary" disabled={busy || note.trim().length < 2} onClick={() => void decide('approved')}>Approve version</button><button className="quiet" disabled={busy || note.trim().length < 2} onClick={() => void decide('needs_correction')}>Request correction</button><button className="quiet" disabled={busy || note.trim().length < 2} onClick={() => void decide('reviewed')}>Mark reviewed</button></div></>}{item.review?.decision === 'approved' && <button className="export-button" disabled={busy} onClick={() => void exportApproved()}>Download signed, minimized export</button>}</div>
      </> : <p className="empty-inline">Select a report to inspect its figures, checks and evidence.</p>}</section>
    </div>}
  </div>
}

function ReviewList({ entries, selected, onOpen, priorities }: { entries: ReviewItem[]; selected: string | null; onOpen: (id: string) => void; priorities?: Map<string, Priority> }) {
  return entries.length ? <ul className="review-list">{entries.map(entry => {
    const priority = priorities?.get(entry.report_id)
    return <li key={entry.report_id}><button className={selected === entry.report_id ? 'active' : ''} onClick={() => onOpen(entry.report_id)}><span className="record-card-top"><strong>{entry.payload.data.unit_id}</strong><span>{priority ? priority.label : checkLabel(entry.flags.length)}</span></span><small>{entry.payload.data.state || 'State not set'} · Version {entry.version} · ID {entry.report_id.slice(0, 8)}</small>{priority && <small className="priority-reason">{priority.reasons[0]}</small>}<em>{entry.review?.decision.replace('_', ' ') ?? 'Awaiting review'} →</em></button></li>
  })}</ul> : <p className="empty-inline">No reports match this view.</p>
}
