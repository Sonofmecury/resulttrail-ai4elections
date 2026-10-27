import { useEffect, useRef, useState } from 'react'
import { request, verifyReceipt } from '../api'
import { clearDraft, listRecords, loadDraft, removeRecord, saveDraft, saveRecord, unlockVault, vaultExists } from '../storage'
import { STATES } from '../geo'
import type { LocalRecord, ResultData, Session, Submission } from '../types'

type Props = { session: Session; offlineOnly: boolean }
type ServerRecord = { report_id: string; version: number; unit_id: string; digest: string; received_at: string; review_decision: string | null; review_note: string | null; review_created_at: string | null }
type PartyRow = { id: string; code: string; votes: string }
type Form = { unit_id: string; state: string; lga: string; ward: string; accredited: string; cast: string; valid: string; rejected: string; parties: PartyRow[]; source_note: string; copy_seen: boolean; figures_compared: boolean; location_checked: boolean }
type LegacyForm = Omit<Form, 'parties'> & { A: string; B: string; C: string }
type Screen = 'home' | 'form' | 'records'
type LgaIndex = Record<string, string[]>
type WardIndex = Record<string, Record<string, string[]>>
const partyRow = (code: string, votes = ''): PartyRow => ({ id: crypto.randomUUID(), code, votes })
function newForm(): Form { return { unit_id: `SIM-UNIT-${crypto.randomUUID().slice(0, 6).toUpperCase()}`, state: '', lga: '', ward: '', accredited: '', cast: '', valid: '', rejected: '', parties: [partyRow('A'), partyRow('B'), partyRow('C', '0')], source_note: '', copy_seen: false, figures_compared: false, location_checked: false } }
function restoreForm(saved: Form | LegacyForm): Form {
  if ('parties' in saved && Array.isArray(saved.parties)) return { ...saved, copy_seen: saved.copy_seen ?? false, figures_compared: saved.figures_compared ?? false, location_checked: saved.location_checked ?? false }
  const legacy = saved as LegacyForm
  const { A, B, C, ...rest } = legacy
  return { ...rest, copy_seen: false, figures_compared: false, location_checked: false, parties: [partyRow('A', A), partyRow('B', B), partyRow('C', C)] }
}
function integer(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error('All result figures must be nonnegative whole numbers')
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count > 10000) throw new Error('Each count must be at most 10,000')
  return count
}
function dataFromForm(form: Form, recordedAt?: string): ResultData {
  if (!/^SIM-[A-Z0-9-]+$/.test(form.unit_id)) throw new Error('Unit codes must begin with SIM-')
  if (form.parties.length < 2 || form.parties.length > 26) throw new Error('Enter between 2 and 26 parties')
  const partyVotes: Record<string, number> = {}
  for (const party of form.parties) {
    const code = party.code.trim().toUpperCase()
    if (!/^[A-Z][A-Z0-9-]{0,11}$/.test(code)) throw new Error('Use a party code of up to 12 letters, numbers or hyphens')
    if (Object.hasOwn(partyVotes, code)) throw new Error(`Party ${code} is listed more than once`)
    partyVotes[code] = integer(party.votes)
  }
  if (!form.copy_seen || !form.figures_compared || !form.location_checked) throw new Error('Complete all three evidence checks before reviewing figures')
  return { election_id: 'SIM-2027', unit_id: form.unit_id, accredited: integer(form.accredited), cast: integer(form.cast), valid: integer(form.valid), rejected: integer(form.rejected), party_votes: partyVotes, source_note: form.source_note.trim(), ...(form.state ? { state: form.state } : {}), ...(form.lga.trim() ? { lga: form.lga.trim() } : {}), ...(form.ward.trim() ? { ward: form.ward.trim() } : {}), ...(recordedAt ? { capture: { copy_seen: true, figures_compared: true, location_checked: true, recorded_at: recordedAt } } : {}) }
}
function formFromData(data: ResultData): Form {
  return { unit_id: data.unit_id, state: data.state ?? '', lga: data.lga ?? '', ward: data.ward ?? '', accredited: String(data.accredited), cast: String(data.cast), valid: String(data.valid), rejected: String(data.rejected), parties: Object.entries(data.party_votes).map(([code, votes]) => partyRow(code, String(votes))), source_note: data.source_note, copy_seen: false, figures_compared: false, location_checked: false }
}
function stateLabel(state: LocalRecord['state']) { return state === 'queued' ? 'On this device' : state === 'received' ? 'Server received' : 'Reviewed' }

export function ReporterView({ session, offlineOnly }: Props) {
  const key = useRef<CryptoKey | null>(null)
  const [passphrase, setPassphrase] = useState(''), [confirmPassphrase, setConfirmPassphrase] = useState('')
  const [hasVault, setHasVault] = useState<boolean | null>(null), [unlocked, setUnlocked] = useState(false)
  const [records, setRecords] = useState<LocalRecord[]>([]), [serverRecords, setServerRecords] = useState<ServerRecord[]>([])
  const [form, setForm] = useState<Form>(newForm), [correction, setCorrection] = useState<{ id: string; next: number } | null>(null)
  const [screen, setScreen] = useState<Screen>('home'), [reviewing, setReviewing] = useState(false)
  const [draftTouched, setDraftTouched] = useState(false), [draftStatus, setDraftStatus] = useState('')
  const [lgaIndex, setLgaIndex] = useState<LgaIndex | null>(null), [wardIndex, setWardIndex] = useState<WardIndex | null>(null)
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [uploading, setUploading] = useState<string | null>(null)
  useEffect(() => { void vaultExists(session.alias).then(setHasVault).catch(e => setMessage((e as Error).message)) }, [session.alias])
  useEffect(() => {
    let active = true
    void Promise.all(['/geo/lga-index.json', '/geo/ward-index.json'].map(async url => {
      const response = await fetch(url)
      if (!response.ok) throw new Error('Location list unavailable')
      return response.json() as Promise<LgaIndex | WardIndex>
    })).then(([lgas, wards]) => { if (active) { setLgaIndex(lgas as LgaIndex); setWardIndex(wards as WardIndex) } })
      .catch(() => { if (active) setMessage('Location lists could not load. Try reconnecting before recording a new area.') })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!unlocked || offlineOnly) return
    void request<{ items: ServerRecord[] }>('/my-results').then(answer => setServerRecords(answer.items)).catch(e => setMessage((e as Error).message))
  }, [unlocked, offlineOnly, session.alias])
  useEffect(() => {
    if (!unlocked || !draftTouched || reviewing || !key.current) return
    const timer = setTimeout(() => { if (key.current) void saveDraft(session.alias, key.current, { form, correction }).then(() => setDraftStatus('Draft saved on this device')).catch(e => setMessage((e as Error).message)) }, 600)
    return () => clearTimeout(timer)
  }, [form, correction, draftTouched, unlocked, reviewing, session.alias])
  async function reload() { if (key.current) setRecords(await listRecords(session.alias, key.current)) }
  async function loadServerRecords() { if (!offlineOnly) { const answer = await request<{ items: ServerRecord[] }>('/my-results'); setServerRecords(answer.items) } }
  async function unlock(event: React.FormEvent) {
    event.preventDefault(); setMessage('')
    try {
      if (hasVault === false && passphrase !== confirmPassphrase) throw new Error('Passphrases do not match')
      key.current = await unlockVault(session.alias, passphrase)
      const draft = await loadDraft<{ form: Form | LegacyForm; correction: { id: string; next: number } | null }>(session.alias, key.current)
      if (draft) { setForm(restoreForm(draft.form)); setCorrection(draft.correction); setDraftStatus('Encrypted draft restored') }
      setUnlocked(true); setPassphrase(''); setConfirmPassphrase(''); await reload(); setHasVault(true)
    } catch (error) { setMessage((error as Error).message) }
  }
  function edit<K extends keyof Form>(name: K, value: Form[K]) { setForm(previous => ({ ...previous, [name]: value })); setDraftTouched(true); setDraftStatus('Saving draft…') }
  function editParty(id: string, field: 'code' | 'votes', value: string) {
    edit('parties', form.parties.map(party => party.id === id ? { ...party, [field]: field === 'code' ? value.toUpperCase() : value } : party))
  }
  function addParty() {
    if (form.parties.length >= 26) return
    const used = new Set(form.parties.map(party => party.code.trim().toUpperCase()))
    const code = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(letter => !used.has(letter)) ?? ''
    edit('parties', [...form.parties, partyRow(code)])
  }
  function removeParty(id: string) { if (form.parties.length > 2) edit('parties', form.parties.filter(party => party.id !== id)) }
  function changeLocation(name: 'state' | 'lga', value: string) {
    setForm(previous => ({ ...previous, [name]: value, ...(name === 'state' ? { lga: '', ward: '' } : { ward: '' }) }))
    setDraftTouched(true); setDraftStatus('Saving draft…')
  }
  async function prepare(event: React.FormEvent) {
    event.preventDefault(); setMessage('')
    try {
      dataFromForm(form)
      if (!key.current) throw new Error('Unlock the local queue first')
      await saveDraft(session.alias, key.current, { form, correction })
      setDraftStatus('Draft saved on this device')
      setReviewing(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) { setMessage((error as Error).message) }
  }
  async function save() {
    setMessage(''); setBusy(true)
    try {
      if (!key.current) throw new Error('Unlock the local queue first')
      const payload: Submission = { report_id: correction?.id ?? crypto.randomUUID(), version: correction?.next ?? 1, data: dataFromForm(form, new Date().toISOString()) }
      if (records.some(item => item.payload.report_id === payload.report_id && item.payload.version === payload.version)) throw new Error('This report version is already saved on this device')
      await saveRecord(session.alias, key.current, { payload, state: 'queued', savedAt: new Date().toISOString() })
      await clearDraft(session.alias); await reload()
      setForm(newForm()); setCorrection(null); setReviewing(false); setDraftTouched(false); setDraftStatus(''); setScreen('home')
      setMessage('Encrypted on this device. Sync when connected to receive a signed receipt.')
    } catch (error) { setMessage(`Not saved: ${(error as Error).message}`) } finally { setBusy(false) }
  }
  async function sync() {
    setBusy(true); setMessage('')
    try {
      if (!key.current) throw new Error('Unlock the local queue first')
      if (offlineOnly || !session.csrf) throw new Error('Sign in online before synchronization')
      const pending = await listRecords(session.alias, key.current)
      let completed = 0
      for (const item of pending.filter(item => item.state === 'queued').reverse()) {
        try {
          const answer = await request<{ receipt: LocalRecord['receipt'] }>('/results', 'POST', item.payload, session.csrf)
          if (!answer.receipt) throw new Error('No receipt returned')
          await verifyReceipt(answer.receipt, item.payload)
          await saveRecord(session.alias, key.current, { ...item, state: 'received', receipt: answer.receipt }); completed++
        } catch (error) { setMessage(`Synced ${completed}; remaining record stays queued: ${(error as Error).message}`); await reload(); return }
      }
      await reload(); await loadServerRecords()
      setMessage(completed ? `${completed} version${completed === 1 ? '' : 's'} received with verified receipts.` : 'No queued records.')
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }
  async function refreshStatus() {
    setBusy(true); setMessage('')
    try {
      if (!key.current || offlineOnly) throw new Error('Sign in online to refresh review status')
      for (const item of records.filter(item => item.state === 'received')) {
        const status = await request<{ state: string; latest_version: number }>(`/results/${item.payload.report_id}/status`)
        if (status.state === 'reviewed' && status.latest_version === item.payload.version) await saveRecord(session.alias, key.current, { ...item, state: 'reviewed' })
      }
      await reload(); await loadServerRecords(); setMessage('Review status updated.')
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }
  async function clearLocalRecord(item: LocalRecord) {
    const explanation = item.state === 'queued' ? 'This report has not reached the service and cannot be recovered after deletion.' : 'This removes only this device’s encrypted copy. The received report and audit record stay on the hosted service.'
    if (!window.confirm(`Remove ${item.payload.data.unit_id} version ${item.payload.version} from this device?\n\n${explanation}`)) return
    try { await removeRecord(session.alias, item); await reload(); setMessage('Local encrypted copy removed from this device.') }
    catch (error) { setMessage((error as Error).message) }
  }
  function correct(item: LocalRecord) {
    if (records.some(record => record.payload.report_id === item.payload.report_id && record.state === 'queued')) { setMessage('Sync the existing correction before creating another version.'); return }
    setForm(formFromData(item.payload.data))
    setCorrection({ id: item.payload.report_id, next: Math.max(...records.filter(record => record.payload.report_id === item.payload.report_id).map(record => record.payload.version)) + 1 })
    setDraftTouched(true); setReviewing(false); setScreen('form'); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function uploadPhoto(item: LocalRecord, file: File | undefined) {
    if (!file) return
    setMessage('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 750_000) { setMessage('Choose a JPEG, PNG or WebP image under 750 KB. The original bytes are preserved.'); return }
    setUploading(item.payload.report_id)
    try {
      const bytes = await file.arrayBuffer()
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
      const response = await fetch(`/api/results/${item.payload.report_id}/evidence?version=${item.payload.version}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type, 'X-CSRF-Token': session.csrf }, body: bytes })
      const result = await response.json() as { digest?: string; detail?: string }
      if (!response.ok) throw new Error(result.detail || 'Image upload failed')
      if (result.digest !== digest) throw new Error('Server image hash does not match the selected file')
      setMessage('Original image stored with a matching SHA-256 hash. Reviewers can now inspect it.')
    } catch (error) { setMessage((error as Error).message) } finally { setUploading(null) }
  }
  if (!unlocked) return <section className="surface unlock-panel"><span className="eyebrow">Local protection</span><h2>{hasVault ? 'Unlock this device' : 'Protect this device'}</h2><p>Your passphrase encrypts drafts kept in this browser. Losing it can make unsent work unrecoverable.</p><form onSubmit={unlock}><label>Local passphrase<input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} minLength={12} required /></label>{hasVault === false && <label>Confirm passphrase<input type="password" value={confirmPassphrase} onChange={e => setConfirmPassphrase(e.target.value)} minLength={12} required /></label>}<button className="primary">{hasVault ? 'Unlock workspace' : 'Create and unlock'}</button></form>{message && <p role="alert" className="error">{message}</p>}</section>
  const locationLgas = lgaIndex?.[form.state] ?? []
  const locationWards = wardIndex?.[form.state]?.[form.lga] ?? []
  const queued = records.filter(item => item.state === 'queued').length, received = serverRecords.length, reviewed = serverRecords.filter(item => item.review_decision).length
  const checklistCount = Number(form.copy_seen) + Number(form.figures_compared) + Number(form.location_checked)
  return <div className="new-workspace observer-workspace">
    <nav className="workspace-nav" aria-label="Observer sections"><button className={screen === 'home' ? 'active' : ''} onClick={() => setScreen('home')}>Overview</button><button className={screen === 'form' ? 'active' : ''} onClick={() => setScreen('form')}>{correction ? 'Correction' : 'New report'}</button><button className={screen === 'records' ? 'active' : ''} onClick={() => setScreen('records')}>Records {queued > 0 && <span>{queued}</span>}</button><button className="nav-lock" onClick={() => { key.current = null; setUnlocked(false); setRecords([]) }}>Lock device</button></nav>
    {message && <div role="status" className="workspace-message">{message}</div>}
    {screen === 'home' && <><div className="overview-lead"><div><span className="eyebrow">Your next step</span><h2>{queued ? `${queued} record${queued === 1 ? '' : 's'} ready to sync` : 'Ready to record'}</h2><p>{offlineOnly ? 'You can continue saving on this device. Sign in online to sync.' : queued ? 'These drafts are protected on this device. Sync to confirm server receipt.' : 'Create a polling-unit record and keep a traceable path to review.'}</p></div><div className="lead-actions"><button className="primary" onClick={() => setScreen('form')}>Create new report</button>{queued > 0 && <button className="quiet" disabled={busy || offlineOnly} onClick={() => void sync()}>Sync {queued} queued</button>}</div></div>
      <div className="status-grid"><div><span>On this device</span><strong>{queued}</strong><small>Not received by server</small></div><div><span>Received</span><strong>{received}</strong><small>Latest reports for this account</small></div><div><span>Reviewed</span><strong>{reviewed}</strong><small>Human decision recorded</small></div></div>
      <section className="surface"><div className="surface-heading"><div><span className="eyebrow">Recent activity</span><h2>Your device queue</h2></div><button className="quiet" onClick={() => setScreen('records')}>View all</button></div>{records.length ? <ul className="activity-list">{records.slice(0, 4).map(item => <li key={`${item.payload.report_id}-${item.payload.version}`}><span className={`status-dot ${item.state}`} /><div><strong>{item.payload.data.unit_id}</strong><small>Version {item.payload.version} · {item.payload.data.state || 'State not set'}</small></div><span className={`status-label ${item.state}`}>{stateLabel(item.state)}</span></li>)}</ul> : <p className="empty-inline">No records saved on this device yet.</p>}</section>
    </>}
    {screen === 'form' && <section className="surface capture-surface"><div className="surface-heading"><div><span className="eyebrow">{correction ? `Correction · version ${correction.next}` : 'New record'}</span><h2>{reviewing ? 'Check before saving' : 'Record a result copy'}</h2><p>{reviewing ? 'Review these figures against your source before encrypting the record on this device.' : 'The form saves an encrypted draft as you type. No data is sent until you sync.'}</p></div><span className="draft-status">{draftStatus}</span></div>
      {reviewing ? <div className="review-before-save"><div><span>Unit</span><strong>{form.unit_id}</strong></div><div><span>Location</span><strong>{[form.state, form.lga, form.ward].filter(Boolean).join(' · ') || 'Not specified'}</strong></div><div><span>Accredited / cast</span><strong>{form.accredited} / {form.cast}</strong></div><div><span>Valid / rejected</span><strong>{form.valid} / {form.rejected}</strong></div><div><span>Party scores</span><strong>{form.parties.map(party => `${party.code}: ${party.votes}`).join(' · ')}</strong></div><div><span>Source note</span><strong>{form.source_note || 'None'}</strong></div><div className="form-actions"><button className="quiet" onClick={() => setReviewing(false)}>Edit figures</button><button className="primary" disabled={busy} onClick={() => void save()}>Save encrypted record</button></div></div> : <form onSubmit={prepare}>
        <fieldset><legend>Polling-unit details</legend><p className="help">Enter the location printed on the illustrative copy, not your current position or personal details.</p><label>Unit code<input value={form.unit_id} onChange={e => edit('unit_id', e.target.value.toUpperCase())} maxLength={40} required /></label><div className="field-grid"><label>State or FCT<select value={form.state} onChange={e => changeLocation('state', e.target.value)}><option value="">Select a state (optional)</option>{STATES.map(state => <option key={state}>{state}</option>)}</select></label><label>LGA<select value={form.lga} onChange={e => changeLocation('lga', e.target.value)} disabled={!form.state || !lgaIndex}><option value="">{!lgaIndex ? 'Loading LGAs…' : 'Select an LGA (optional)'}</option>{form.lga && !locationLgas.includes(form.lga) && <option value={form.lga}>{form.lga}</option>}{locationLgas.map(lga => <option key={lga} value={lga}>{lga}</option>)}</select></label></div><label>Ward<select value={form.ward} onChange={e => edit('ward', e.target.value)} disabled={!form.lga || !wardIndex}><option value="">{!wardIndex ? 'Loading wards…' : 'Select a ward (optional)'}</option>{form.ward && !locationWards.includes(form.ward) && <option value={form.ward}>{form.ward}</option>}{locationWards.map(ward => <option key={ward} value={ward}>{ward}</option>)}</select></label></fieldset>
        <fieldset><legend>Vote totals</legend><div className="field-grid">{(['accredited', 'cast', 'valid', 'rejected'] as const).map(name => <label key={name}>{name === 'cast' ? 'Votes cast' : name[0].toUpperCase() + name.slice(1)}<input inputMode="numeric" type="number" min="0" max="10000" value={form[name]} onChange={e => edit(name, e.target.value)} required /></label>)}</div></fieldset>
        <fieldset><legend>Party scores</legend><p className="help party-help">Use the abbreviations shown on the result copy. Add every party with a recorded score.</p><div className="party-rows">{form.parties.map((party, index) => <div className="party-entry" key={party.id}><label>Party code<input aria-label={`Party code ${index + 1}`} value={party.code} onChange={e => editParty(party.id, 'code', e.target.value)} maxLength={12} placeholder="e.g. APC" required /></label><label>Votes<input aria-label={`Votes for party ${party.code || index + 1}`} inputMode="numeric" type="number" min="0" max="10000" value={party.votes} onChange={e => editParty(party.id, 'votes', e.target.value)} required /></label><button type="button" className="quiet party-remove" onClick={() => removeParty(party.id)} disabled={form.parties.length <= 2} aria-label={`Remove party ${party.code || index + 1}`}>Remove</button></div>)}</div><button type="button" className="quiet party-add" onClick={addParty} disabled={form.parties.length >= 26}>+ Add party</button></fieldset>
        <fieldset><legend>Source context</legend><label>Source note<textarea value={form.source_note} onChange={e => edit('source_note', e.target.value)} maxLength={200} rows={3} placeholder="Describe the source copy" /></label><p className="help">A small original image can be attached after the server receives this version.</p></fieldset>
        <fieldset className="capture-checklist"><legend>Evidence checks</legend><p className="help">{checklistCount} of 3 complete. Confirm these against the source before continuing. The device time is recorded when you save.</p><label><input type="checkbox" checked={form.copy_seen} onChange={e => edit('copy_seen', e.target.checked)} />I have seen the result copy I am recording.</label><label><input type="checkbox" checked={form.figures_compared} onChange={e => edit('figures_compared', e.target.checked)} />I compared every total and party score with that copy.</label><label><input type="checkbox" checked={form.location_checked} onChange={e => edit('location_checked', e.target.checked)} />I checked the unit code and location, including any fields I left blank.</label></fieldset>
        <div className="form-actions"><button className="primary" disabled={busy}>Review figures</button>{correction && <button type="button" className="quiet" onClick={() => { setCorrection(null); setForm(newForm()); setDraftTouched(false); void clearDraft(session.alias) }}>Cancel correction</button>}</div>
      </form>}</section>}
    {screen === 'records' && <div className="records-layout"><section className="surface"><div className="surface-heading"><div><span className="eyebrow">Local queue</span><h2>On this device</h2></div><button className="quiet" disabled={busy || offlineOnly || !queued} onClick={() => void sync()}>Sync {queued} queued</button></div><p className="help">Saved here is different from received by the service. A verified receipt confirms delivery.</p>{offlineOnly && <p className="small-warning">Offline access only. Sign in online before syncing.</p>}{records.length ? <ul className="record-cards">{records.map(item => <li key={`${item.payload.report_id}-${item.payload.version}`}><div className="record-card-top"><strong>{item.payload.data.unit_id}</strong><span className={`status-label ${item.state}`}>{stateLabel(item.state)}</span></div><small>Version {item.payload.version} · {item.payload.data.state || 'State not set'} · {new Date(item.savedAt).toLocaleString()}</small>{item.receipt && <p className="receipt-line">Receipt {item.receipt.body.digest.slice(0, 16)}…</p>}<div className="record-actions">{item.state !== 'queued' && <button className="text-button" onClick={() => correct(item)}>Create correction</button>}{item.state === 'received' && !offlineOnly && <label className="photo-action">{uploading === item.payload.report_id ? 'Uploading…' : 'Attach source image'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(uploading)} onChange={e => { void uploadPhoto(item, e.target.files?.[0]); e.target.value = '' }} /></label>}<button className="text-button" onClick={() => void clearLocalRecord(item)}>Remove local copy</button></div></li>)}</ul> : <p className="empty-inline">No saved records on this device.</p>}<p className="privacy-note">Removing a received copy here does not delete the service record or its audit trail. Records are visible only to your assigned account and authorised reviewers. The reviewer map is not public.</p></section>
      <section className="surface"><div className="surface-heading"><div><span className="eyebrow">Shared service</span><h2>Report progress</h2></div><button className="quiet" disabled={offlineOnly} onClick={() => void loadServerRecords().catch(e => setMessage((e as Error).message))}>Refresh</button></div><p className="help">The service records when it received each version and when a reviewer made a decision. Unsent reports stay on this device.</p>{serverRecords.length ? <ul className="progress-list">{serverRecords.map(item => <li key={item.report_id}><div className="record-card-top"><strong>{item.unit_id}</strong><span className={`status-label ${item.review_decision ? 'reviewed' : 'received'}`}>{item.review_decision?.replace('_', ' ') ?? 'Awaiting review'}</span></div><small>Version {item.version} · Receipt {item.digest.slice(0, 12)}…</small><ol className="report-progress"><li className="done"><strong>Received</strong><span>{new Date(item.received_at).toLocaleString()}</span></li><li className={item.review_decision ? 'done' : ''}><strong>{item.review_decision ? item.review_decision.replace('_', ' ') : 'Under review'}</strong><span>{item.review_created_at ? new Date(item.review_created_at).toLocaleString() : 'Waiting for a reviewer'}</span></li></ol>{item.review_note && <p className="review-feedback">Reviewer note: {item.review_note}</p>}</li>)}</ul> : <p className="empty-inline">No server-received records for this account.</p>}<button className="quiet refresh-review" disabled={busy || offlineOnly} onClick={() => void refreshStatus()}>Refresh review decisions</button></section></div>}
    <nav className="mobile-workspace-nav" aria-label="Observer mobile navigation"><button className={screen === 'home' ? 'active' : ''} onClick={() => setScreen('home')}>Overview</button><button className={screen === 'form' ? 'active' : ''} onClick={() => setScreen('form')}>New report</button><button className={screen === 'records' ? 'active' : ''} onClick={() => setScreen('records')}>Records</button></nav>
  </div>
}
