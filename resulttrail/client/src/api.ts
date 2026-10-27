import type { Receipt, Session, Submission } from './types'

const enc = new TextEncoder()

function decode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded + '='.repeat((4 - padded.length % 4) % 4)), (char) => char.charCodeAt(0))
}

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, ordered(v)]))
  }
  return value
}

function canonical(value: unknown): Uint8Array {
  return enc.encode(JSON.stringify(ordered(value)))
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function request<T>(path: string, method = 'GET', body?: unknown, csrf?: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch { throw new Error('Service unreachable. Your encrypted local queue is unchanged.') }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Request failed (${response.status})`)
  return data as T
}

export async function getSession(): Promise<Session> { return request<Session>('/session') }

export async function verifyReceipt(receipt: Receipt, payload: Submission): Promise<void> {
  if (receipt.body.report_id !== payload.report_id || receipt.body.version !== payload.version) {
    throw new Error('Receipt identifies a different report/version')
  }
  const payloadDigest = hex(await crypto.subtle.digest('SHA-256', canonical(payload) as BufferSource))
  if (payloadDigest !== receipt.body.digest) throw new Error('Receipt does not match the local data')
  const publicKey = await request<{ public_key: string; key_id: string }>(`/public-key/${receipt.body.key_id}`)
  if (publicKey.key_id !== receipt.body.key_id) throw new Error('Unexpected receipt key')
  const key = await crypto.subtle.importKey('raw', decode(publicKey.public_key) as BufferSource, 'Ed25519', false, ['verify'])
  const valid = await crypto.subtle.verify('Ed25519', key, decode(receipt.signature) as BufferSource, canonical(receipt.body) as BufferSource)
  if (!valid) throw new Error('Receipt signature did not verify')
}
