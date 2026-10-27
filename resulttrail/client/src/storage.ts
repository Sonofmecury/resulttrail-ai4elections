import type { LocalRecord } from './types'

const DB_NAME = 'aegisrelay-synthetic-v1'
const enc = new TextEncoder()
const dec = new TextDecoder()

type Vault = { alias: string; salt: string; nonce: string; wrapped: string }
type Envelope = { id: string; alias: string; nonce: string; ciphertext: string }

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function decode(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('vaults')) db.createObjectStore('vaults', { keyPath: 'alias' })
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function read<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDb()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key)
      request.onsuccess = () => resolve(request.result as T | undefined)
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

async function write(storeName: string, value: Vault | Envelope): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      tx.objectStore(storeName).put(value)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'))
    })
  } finally { db.close() }
}

async function remove(storeName: string, id: string): Promise<void> {
  const db = await openDb()
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }) }
  finally { db.close() }
}

async function wrapKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const password = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 250_000, hash: 'SHA-256' },
    password, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
}

export async function vaultExists(alias: string): Promise<boolean> {
  return Boolean(await read<Vault>('vaults', alias))
}

export async function unlockVault(alias: string, passphrase: string): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle || !globalThis.indexedDB) throw new Error('Secure browser storage is unavailable')
  if (passphrase.length < 12) throw new Error('Use a local passphrase of at least 12 characters')
  const vault = await read<Vault>('vaults', alias)
  if (!vault) {
    const raw = randomBytes(32)
    const salt = randomBytes(16)
    const nonce = randomBytes(12)
    const wrapper = await wrapKey(passphrase, salt)
    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, wrapper, raw as BufferSource)
    await write('vaults', { alias, salt: encode(salt), nonce: encode(nonce), wrapped: encode(new Uint8Array(wrapped)) })
    return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
  }
  try {
    const wrapper = await wrapKey(passphrase, decode(vault.salt))
    const raw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decode(vault.nonce) as BufferSource }, wrapper, decode(vault.wrapped) as BufferSource,
    )
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  } catch { throw new Error('Unable to unlock this device queue; check the passphrase') }
}

export function recordId(alias: string, record: LocalRecord): string {
  return `${alias}|${record.payload.report_id}|${record.payload.version}`
}

export async function saveRecord(alias: string, key: CryptoKey, record: LocalRecord): Promise<void> {
  const id = recordId(alias, record)
  const nonce = randomBytes(12)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource, additionalData: enc.encode(id) },
    key, enc.encode(JSON.stringify(record)),
  )
  await write('records', { id, alias, nonce: encode(nonce), ciphertext: encode(new Uint8Array(ciphertext)) })
}

export async function listRecords(alias: string, key: CryptoKey): Promise<LocalRecord[]> {
  const db = await openDb()
  let envelopes: Envelope[]
  try {
    envelopes = await new Promise((resolve, reject) => {
      const request = db.transaction('records', 'readonly').objectStore('records').getAll()
      request.onsuccess = () => resolve(request.result as Envelope[])
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
  const result: LocalRecord[] = []
  for (const envelope of envelopes) {
    if (envelope.alias !== alias) continue
    try {
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: decode(envelope.nonce) as BufferSource, additionalData: enc.encode(envelope.id) },
        key, decode(envelope.ciphertext) as BufferSource,
      )
      result.push(JSON.parse(dec.decode(plain)) as LocalRecord)
    } catch { throw new Error('A saved record is damaged or uses the wrong key; nothing was deleted') }
  }
  return result.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export async function saveDraft(alias: string, key: CryptoKey, value: unknown): Promise<void> {
  const id = `${alias}|draft`, nonce = randomBytes(12)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource, additionalData: enc.encode(id) }, key, enc.encode(JSON.stringify(value)))
  await write('drafts', { id, alias, nonce: encode(nonce), ciphertext: encode(new Uint8Array(ciphertext)) })
}

export async function loadDraft<T>(alias: string, key: CryptoKey): Promise<T | null> {
  const id = `${alias}|draft`, envelope = await read<Envelope>('drafts', id)
  if (!envelope) return null
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(envelope.nonce) as BufferSource, additionalData: enc.encode(id) }, key, decode(envelope.ciphertext) as BufferSource)
    return JSON.parse(dec.decode(plain)) as T
  } catch { throw new Error('Unable to restore the encrypted form draft') }
}

export async function clearDraft(alias: string): Promise<void> { await remove('drafts', `${alias}|draft`) }
export async function removeRecord(alias: string, record: LocalRecord): Promise<void> { await remove('records', recordId(alias, record)) }
