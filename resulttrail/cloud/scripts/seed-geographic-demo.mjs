/** Idempotent fictional coverage seed. Run --dry-run first, then --apply deliberately. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const base = process.argv.find(arg => arg.startsWith('--base='))?.slice('--base='.length) || 'https://resulttrail.ng'
const apply = process.argv.includes('--apply')
const instance = resolve('../instance')
const geo = resolve('../client/public/geo')
const lgaIndex = JSON.parse(readFileSync(resolve(geo, 'lga-index.json')))
const wardIndex = JSON.parse(readFileSync(resolve(geo, 'ward-index.json')))
const groups = {
  Lagos: ['Ikeja', 'Alimosho', 'Eti Osa'],
  Kano: ['Kano Municipal', 'Fagge', 'Dala'],
  Kaduna: ['Kaduna North', 'Kaduna South', 'Chikun'],
  Rivers: ['Port-Harcourt', 'Obio/Akpor', 'Eleme'],
  Oyo: ['Ibadan North', 'Ibadan South West', 'Egbeda'],
  Niger: ['Paikoro', 'Bosso', 'Chanchaga'],
}
const hash = value => createHash('sha256').update(value).digest('hex')
function idFor(index) {
  const h = hash(`resulttrail-geographic-demo-v1/${index}`)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}
const locations = Object.entries(groups).flatMap(([state, lgas]) => lgas.flatMap(lga => {
  if (!lgaIndex[state]?.includes(lga) || !wardIndex[state]?.[lga] || wardIndex[state][lga].length < 2)
    throw new Error(`Missing geography: ${state}/${lga}`)
  return wardIndex[state][lga].slice(0, 2).map(ward => ({ state, lga, ward }))
}))
const reports = locations.map((location, index) => {
  const accredited = 181 + index * 13 + index % 3 * 7
  const cast = accredited - 22 - index % 9
  const rejected = 2 + index % 5
  const valid = cast - rejected
  const apc = Math.floor(valid * (.31 + index % 4 * .025))
  const pdp = Math.floor(valid * (.26 + index % 3 * .017))
  const lp = Math.floor(valid * (.19 + index % 5 * .012))
  const nnpp = Math.floor(valid * .11)
  const nnppCapped = Math.min(nnpp, Math.max(0, valid - apc - pdp - lp))
  const party_votes = { APC: apc, PDP: pdp, LP: lp, NNPP: nnppCapped,
    AAC: valid - apc - pdp - lp - nnppCapped }
  if ([7, 17, 29].includes(index)) party_votes.AAC -= 3 // intentional arithmetic review cases
  const data = {
    election_id: 'SIM-2027', unit_id: `SIM-UNIT-${hash(`geographic-demo-unit/${index}`).slice(0, 12).toUpperCase()}`,
    ...location, accredited, cast, valid, rejected, party_votes,
    source_note: index === 1
      ? 'Illustrative PDF capture. LP and NNPP entries intentionally differ from the attached sheet for OCR review.'
      : 'Illustrative PDF capture generated for the ResultTrail geographic demonstration.',
    capture: { copy_seen: true, figures_compared: true, location_checked: true,
      recorded_at: `2026-11-08T12:00:${String(index).padStart(2, '0')}Z` },
  }
  if (index === 1) delete data.capture // deliberate transcription difference; do not claim the figures were checked
  const source_data = structuredClone(data)
  if (index === 1) { source_data.party_votes.LP += 1; source_data.party_votes.NNPP -= 1 }
  return { index, report_id: idFor(index), data, source_data }
})
if (reports.length !== 36 || new Set(reports.map(row => row.data.unit_id)).size !== reports.length)
  throw new Error('Expected 36 distinct unit codes')
if (reports.some(row => Object.values(row.data.party_votes).some(votes => votes < 0)))
  throw new Error('Generated party votes must never be negative')

const render = spawnSync('python', ['scripts/make-geographic-demo-sheets.py'], {
  input: JSON.stringify(reports), cwd: process.cwd(), encoding: 'utf8', maxBuffer: 4_000_000,
})
if (render.status !== 0) throw new Error(`PDF capture failed: ${render.stderr || render.stdout}`)
const images = new Map(JSON.parse(render.stdout).map(row => [row.index, row]))
const planned = Object.entries(groups).map(([state, lgas]) => `${state}: ${lgas.join(', ')}`).join('\n')
if (!apply) {
  console.log(`Dry run: ${reports.length} fictional records, ${images.size} PDF captures.\n${planned}\nRun --apply to write to ${base}.`)
  process.exit(0)
}
if (new URL(base).hostname !== 'resulttrail.ng') throw new Error('Apply is limited to resulttrail.ng')
const credential = name => JSON.parse(readFileSync(resolve(instance, `cloud-remote-${name}-credential.json`)))
async function call(path, method = 'GET', body, auth) {
  const response = await fetch(`${base}/api${path}`, { method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {}) },
    body: body ? JSON.stringify(body) : undefined })
  const value = await response.json()
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(value)}`)
  return { value, response }
}
async function login(user) {
  const { value, response } = await call('/session', 'POST', { alias: user.alias, password: user.password })
  const cookie = response.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error('No login cookie')
  return { cookie, csrf: value.csrf }
}
const reporter = await login(credential('reporter'))
const reviewer = await login(credential('reviewer'))
let submitted = 0, replayed = 0, uploaded = 0, decisions = 0
for (const row of reports) {
  const image = readFileSync(images.get(row.index).png)
  const digest = hash(image)
  const payload = { report_id: row.report_id, version: 1, data: row.data,
    evidence: { digest, mime: 'image/png', size: image.length } }
  const result = (await call('/results', 'POST', payload, reporter)).value
  if (result.replayed) replayed++
  else submitted++
  const response = await fetch(`${base}/api/results/${row.report_id}/evidence?version=1`, {
    method: 'POST', headers: { Cookie: reporter.cookie, 'X-CSRF-Token': reporter.csrf, 'Content-Type': 'image/png' },
    body: image,
  })
  const evidence = await response.json()
  if (!response.ok || evidence.digest !== digest) throw new Error(`Evidence ${row.index}: ${response.status} ${JSON.stringify(evidence)}`)
  uploaded++
  if (row.index % 6 === 0) console.log(`Uploaded ${row.index + 1}/${reports.length} fictional reports`)
}
const queue = (await call('/review', 'GET', undefined, reviewer)).value.items
for (const row of reports) {
  const item = queue.find(entry => entry.report_id === row.report_id)
  if (!item || item.evidence_digest !== hash(readFileSync(images.get(row.index).png)))
    throw new Error(`Hosted report or evidence missing for ${row.index}`)
  if (item.review || row.index === 1 || row.index % 11 === 5) continue // preserve OCR mismatch and a few pending cases
  const decision = [7, 17, 29].includes(row.index) ? 'needs_correction' : row.index % 7 === 3 ? 'reviewed' : 'approved'
  await call(`/review/${row.report_id}/decision`, 'POST', { decision, version: 1,
    note: decision === 'needs_correction'
      ? 'Illustrative arithmetic difference; compare the party figures with the source copy.'
      : 'Illustrative source copy and entered figures checked for the demonstration.' }, reviewer)
  decisions++
}
console.log(JSON.stringify({ total: reports.length, submitted, replayed, uploaded, decisions,
  approvedExample: reports[0].report_id, ocrMismatchExample: reports[1].report_id,
  states: Object.keys(groups), lgas: 18, wards: 36 }))
