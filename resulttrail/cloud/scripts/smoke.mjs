import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash, createPublicKey, verify } from 'node:crypto'

const base = process.argv[2] || 'http://127.0.0.1:8787'
const label = process.argv[3] || 'local'
const instance = resolve('../instance')
const credential = name => JSON.parse(readFileSync(resolve(instance, `cloud-${label}-${name}-credential.json`)))
const reporter = credential('reporter'), reviewer = credential('reviewer')
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value)
const digest = value => createHash('sha256').update(canonical(value)).digest('hex')
async function call(path, method = 'GET', body, auth) {
  const response = await fetch(`${base}/api${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const result = await response.json()
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(result)}`)
  return { result, response }
}
async function login(user) {
  const { result, response } = await call('/session', 'POST', { alias: user.alias, password: user.password })
  const cookie = response.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error('No session cookie')
  return { cookie, csrf: result.csrf }
}
const health = await call('/health')
if (health.result.storage !== 'D1') throw new Error('Wrong backend')
const reporterAuth = await login(reporter), reviewerAuth = await login(reviewer)
const payload = { report_id: crypto.randomUUID(), version: 1, data: { election_id: 'SIM-2027', unit_id: `SIM-CLOUD-${crypto.randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase()}`, state: 'Lagos', lga: 'Ikeja', ward: 'Alausa', accredited: 120, cast: 100, valid: 97, rejected: 3, party_votes: { APC: 70, PDP: 20, LP: 7, NNPP: 0 }, source_note: 'Cloud smoke test' } }
const first = (await call('/results', 'POST', payload, reporterAuth)).result
if (first.replayed || first.receipt.body.digest !== digest(payload)) throw new Error('Receipt digest mismatch')
const repeated = (await call('/results', 'POST', payload, reporterAuth)).result
if (!repeated.replayed || canonical(repeated.receipt) !== canonical(first.receipt)) throw new Error('Replay failed')
const publicKey = (await call('/public-key/cloud-v1')).result
const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey.public_key, 'base64url')])
const key = createPublicKey({ key: der, format: 'der', type: 'spki' })
if (!verify(null, Buffer.from(canonical(first.receipt.body)), key, Buffer.from(first.receipt.signature, 'base64url'))) throw new Error('Receipt signature failed')
const status = (await call(`/results/${payload.report_id}/status`, 'GET', undefined, reporterAuth)).result
if (status.versions.length !== 1) throw new Error('Status missing version')
const acrossDevices = (await call('/my-results', 'GET', undefined, reporterAuth)).result
if (!acrossDevices.items.some(item => item.report_id === payload.report_id)) throw new Error('Cross-device list missing result')
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9eP7kAAAAASUVORK5CYII=', 'base64')
const imageResponse = await fetch(`${base}/api/results/${payload.report_id}/evidence?version=1`, { method: 'POST', headers: { Cookie: reporterAuth.cookie, 'X-CSRF-Token': reporterAuth.csrf, 'Content-Type': 'image/png' }, body: image })
const imageResult = await imageResponse.json()
if (!imageResponse.ok || imageResult.digest !== createHash('sha256').update(image).digest('hex')) throw new Error('Evidence image upload failed')
const readImage = await fetch(`${base}/api/results/${payload.report_id}/evidence?version=1`, { headers: { Cookie: reviewerAuth.cookie } })
if (!readImage.ok || !Buffer.from(await readImage.arrayBuffer()).equals(image)) throw new Error('Reviewer image retrieval failed')
const queue = (await call('/review', 'GET', undefined, reviewerAuth)).result
if (!queue.items.some(item => item.report_id === payload.report_id && item.payload.data.state === 'Lagos' && item.evidence_digest === imageResult.digest && canonical(item.payload.data.party_votes) === canonical(payload.data.party_votes))) throw new Error('Review queue missing geography, evidence or party scores')
await call(`/review/${payload.report_id}/decision`, 'POST', { decision: 'approved', version: 1, note: 'Fictional source compared' }, reviewerAuth)
const repeatDecision = await fetch(`${base}/api/review/${payload.report_id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: reviewerAuth.cookie, 'X-CSRF-Token': reviewerAuth.csrf }, body: JSON.stringify({ decision: 'needs_correction', version: 1, note: 'Conflicting second decision' }) })
if (repeatDecision.status !== 409) throw new Error('Final review decision could be replaced')
const packageResult = (await call('/exports', 'POST', { report_id: payload.report_id }, reviewerAuth)).result
if (packageResult.digest !== digest(packageResult.body) || !verify(null, Buffer.from(canonical({ digest: packageResult.digest, key_id: packageResult.key_id })), key, Buffer.from(packageResult.signature, 'base64url'))) throw new Error('Export verification failed')
if ('source_note' in packageResult.body.result) throw new Error('Export leaked note')
if (canonical(packageResult.body.result.party_votes) !== canonical(payload.data.party_votes)) throw new Error('Export changed party scores')
if (packageResult.body.evidence?.digest !== imageResult.digest) throw new Error('Export missing evidence hash')
console.log(`PASS ${base}: login, geography, receipt, replay, evidence, review, export, signatures`)
