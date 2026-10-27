import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const [label, alias] = process.argv.slice(2)
if (!/^(local|remote)$/.test(label || '') || !/^[a-z0-9][a-z0-9_-]{2,59}$/.test(alias || '')) throw new Error('Usage: node scripts/rehash.mjs local|remote ALIAS')
const credential = JSON.parse(readFileSync(resolve(`../instance/cloud-${label}-${alias}-credential.json`)))
const salt = randomBytes(16)
const hash = `pbkdf2-sha256$100000$${salt.toString('base64url')}$${pbkdf2Sync(credential.password, salt, 100000, 32, 'sha256').toString('base64url')}`
const output = resolve(`../instance/cloud-${label}-${alias}-rehash.sql`)
writeFileSync(output, `UPDATE account SET password_hash='${hash}' WHERE alias='${alias}';\n`, { mode: 0o600 })
console.log(`Apply rehash SQL from ${output}`)
