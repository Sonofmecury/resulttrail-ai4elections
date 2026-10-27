import { generateKeyPairSync } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const label = process.argv[2] || 'local'
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid key label')
const instance = resolve('../instance')
mkdirSync(instance, { recursive: true })
const output = resolve(instance, `cloud-${label}-signing.json`)
if (existsSync(output)) throw new Error('Key already exists; refusing rotation')
const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const secret = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url')
const publicRaw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url')
writeFileSync(output, JSON.stringify({ SIGNING_KEY_B64: secret, PUBLIC_KEY_B64: publicRaw }, null, 2), { mode: 0o600 })
if (label === 'local') writeFileSync(resolve('.dev.vars'), `SIGNING_KEY_B64=${secret}\nPUBLIC_KEY_B64=${publicRaw}\n`, { mode: 0o600 })
console.log(`Signing key saved to ${output}; keep this file private and backed up.`)
