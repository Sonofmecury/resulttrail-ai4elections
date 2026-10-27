import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const [label, alias, role, tenant = 'synthetic-team'] = process.argv.slice(2)
if (!/^(local|remote)$/.test(label || '') || !/^[a-z0-9][a-z0-9_-]{2,59}$/.test(alias || '') || !['reporter', 'reviewer'].includes(role) || !/^[a-z0-9_-]{3,60}$/.test(tenant)) throw new Error('Usage: node scripts/provision.mjs local|remote ALIAS reporter|reviewer [TENANT]')
const instance = resolve('../instance')
mkdirSync(instance, { recursive: true })
const credential = resolve(instance, `cloud-${label}-${alias}-credential.json`)
const sqlPath = resolve(instance, `cloud-${label}-${alias}-account.sql`)
if (existsSync(credential) || existsSync(sqlPath)) throw new Error('Account artifacts already exist; refusing overwrite')
const password = randomBytes(24).toString('base64url')
const salt = randomBytes(16)
const hash = `pbkdf2-sha256$100000$${salt.toString('base64url')}$${pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('base64url')}`
const sql = `INSERT INTO account(alias,password_hash,role,tenant) VALUES('${alias}','${hash}','${role}','${tenant}');\n`
writeFileSync(sqlPath, sql, { mode: 0o600 })
writeFileSync(credential, JSON.stringify({ site: label, alias, role, tenant, password }, null, 2), { mode: 0o600 })
console.log(`Credential saved privately to ${credential}. Apply SQL from ${sqlPath} with wrangler d1 execute.`)
