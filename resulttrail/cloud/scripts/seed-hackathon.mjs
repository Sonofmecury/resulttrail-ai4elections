import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const base = process.argv[2] || 'https://aegisrelay-app.mukhtarabdulrazaq-18.workers.dev'
const instance = resolve('../instance')
const publicDir = resolve('../client/public')
const credential = name => JSON.parse(readFileSync(resolve(instance, `cloud-remote-${name}-credential.json`)))
const lgaIndex = JSON.parse(readFileSync(resolve(publicDir, 'geo/lga-index.json')))
const wardIndex = JSON.parse(readFileSync(resolve(publicDir, 'geo/ward-index.json')))
const locations = [
  ['Lagos', 'Ikeja'], ['Kano', 'Kano Municipal'], ['Kaduna', 'Kaduna North'],
  ['Rivers', 'Port-Harcourt'], ['Oyo', 'Ibadan North'], ['Abuja Federal Capital Territory', 'Municipal Area Council'],
  ['Enugu', 'Enugu North'], ['Katsina', 'Katsina'], ['Borno', 'Maiduguri'],
  ['Delta', 'Warri South'], ['Ogun', 'Abeokuta South'], ['Anambra', 'Awka South'],
  ['Plateau', 'Jos North'], ['Bauchi', 'Bauchi'], ['Akwa Ibom', 'Uyo'],
]
const notes = [
  'Source copy photographed after tally at the desk.',
  'A second observer checked the figures against the posted copy.',
  'Party total on the entered copy needs a second look.',
  'Rain delayed transmission; the recorded copy was kept on the device.',
  'Figures transcribed from the signed copy received at the desk.',
  'Copy inspected and compared with the entered totals.',
]
function idFor(index) {
  const hex = createHash('sha256').update(`resulttrail-hackathon-seed-v1/${index}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
const payloads = locations.map(([state, lga], index) => {
  if (!lgaIndex[state]?.includes(lga) || !wardIndex[state]?.[lga]?.length) throw new Error(`Invalid location ${state}/${lga}`)
  const accredited = 145 + index * 19, cast = accredited - 20 - index % 7, rejected = 2 + index % 4
  const valid = cast - rejected, A = Math.floor(valid * (.48 + index % 3 * .04)), B = valid - A
  const flagged = index % 5 === 2
  return { report_id: idFor(index), version: 1, data: { election_id: 'SIM-2027',
    unit_id: `SIM-FIELD-${String(index + 1).padStart(3, '0')}`, state, lga, ward: wardIndex[state][lga][0],
    accredited, cast, valid, rejected, party_votes: { A, B: flagged ? B - 4 : B, C: 0 }, source_note: notes[index % notes.length] } }
})

async function call(path, method = 'GET', body, auth) {
  const response = await fetch(`${base}/api${path}`, { method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {}) },
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
const imageRows = [0, 5, 10].map(index => ({ index, data: payloads[index].data }))
const drawn = spawnSync('python', ['scripts/make-seed-images.py'], { input: JSON.stringify(imageRows), cwd: process.cwd(), encoding: 'utf8' })
if (drawn.status !== 0) throw new Error(`Image generation failed: ${drawn.stderr}`)
let received = 0, replayed = 0, attached = 0, decided = 0
for (const [index, payload] of payloads.entries()) {
  const result = (await call('/results', 'POST', payload, reporter)).value
  if (result.replayed) replayed++
  else received++
  if ([0, 5, 10].includes(index)) {
    const image = readFileSync(resolve(instance, `hackathon-source-${index}.png`))
    const response = await fetch(`${base}/api/results/${payload.report_id}/evidence?version=1`, { method: 'POST',
      headers: { Cookie: reporter.cookie, 'X-CSRF-Token': reporter.csrf, 'Content-Type': 'image/png' }, body: image })
    const value = await response.json()
    if (!response.ok) throw new Error(`Image ${index}: ${response.status} ${JSON.stringify(value)}`)
    if (value.digest !== createHash('sha256').update(image).digest('hex')) throw new Error('Image digest mismatch')
    attached++
  }
}
const queue = (await call('/review', 'GET', undefined, reviewer)).value.items
for (const [index, payload] of payloads.entries()) {
  const item = queue.find(entry => entry.report_id === payload.report_id)
  if (!item) throw new Error(`Missing report ${index}`)
  if (item.review) continue
  const decision = index % 5 === 2 ? 'needs_correction' : index % 5 < 2 ? 'approved' : index % 5 === 3 ? 'reviewed' : null
  if (!decision) continue
  await call(`/review/${payload.report_id}/decision`, 'POST', { decision, version: 1, note: decision === 'needs_correction' ? 'Please compare the party totals with the source copy.' : 'Source and figures reviewed for the demonstration.' }, reviewer)
  decided++
}
console.log(`Hackathon seed ready: ${received} new, ${replayed} replayed, ${attached} images checked, ${decided} review decisions. 15 states covered.`)
