type Env = { DB: D1Database; ASSETS: Fetcher; SIGNING_KEY_B64: string; PUBLIC_KEY_B64: string }
type Actor = { alias: string; role: 'reporter' | 'reviewer'; tenant: string; csrf: string }
type Result = { election_id: string; unit_id: string; accredited: number; cast: number; valid: number; rejected: number; party_votes: Record<string, number>; source_note: string; state?: string; lga?: string; ward?: string; capture?: { copy_seen: boolean; figures_compared: boolean; location_checked: boolean; recorded_at: string } }
type EvidenceDeclaration = { digest: string; mime: 'image/jpeg' | 'image/png' | 'image/webp'; size: number }
type Submission = { report_id: string; version: number; data: Result; evidence?: EvidenceDeclaration }
type VersionRow = { tenant: string; report_id: string; version: number; payload_json: string; digest: string; reporter: string; received_at: string; receipt_json: string }
type ReviewRow = VersionRow & { review_decision: string | null; review_note: string | null; review_created_at: string | null; evidence_digest: string | null; duplicate_image_reports: number; comparison_count: number; comparison_mismatches: number }
const KEY_ID = 'cloud-v1'
const encoder = new TextEncoder()

class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
function fail(status: number, message: string): never { throw new ApiError(status, message) }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  return JSON.stringify(value)
}
function b64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
function b64Large(bytes: Uint8Array): string { let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(binary) }
function unb64(value: string): Uint8Array { const safe = value.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(safe + '='.repeat((4 - safe.length % 4) % 4)), c => c.charCodeAt(0)) }
async function hash(value: string): Promise<string> { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), x => x.toString(16).padStart(2, '0')).join('') }
async function hashBytes(value: Uint8Array): Promise<string> { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value as BufferSource)), x => x.toString(16).padStart(2, '0')).join('') }
function randomToken(): string { return b64(crypto.getRandomValues(new Uint8Array(32))) }
function now(): string { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') }
function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', ...headers } })
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const size = Number(request.headers.get('content-length') || 0)
  if (size > 16_384) fail(413, 'Request too large')
  let value: unknown
  try { value = await request.json() } catch { fail(400, 'Invalid JSON') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'Expected a JSON object')
  return value as Record<string, unknown>
}
function fields(value: Record<string, unknown>, allowed: string[]): void { if (Object.keys(value).some(key => !allowed.includes(key))) fail(422, 'Unexpected field') }
function uuid(value: unknown): string { if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) fail(422, 'Invalid report ID'); return value.toLowerCase() }
function bounded(value: unknown, max = 10000): number { if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) fail(422, 'Invalid count'); return value as number }
function validateSubmission(input: Record<string, unknown>): Submission {
  fields(input, ['report_id', 'version', 'data', 'evidence'])
  const report_id = uuid(input.report_id), version = bounded(input.version, 1000)
  if (version < 1) fail(422, 'Version must be positive')
  const raw = input.data
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(422, 'Invalid result data')
  const d = raw as Record<string, unknown>
  fields(d, ['election_id', 'unit_id', 'accredited', 'cast', 'valid', 'rejected', 'party_votes', 'source_note', 'state', 'lga', 'ward', 'capture'])
  for (const key of ['election_id', 'unit_id']) if (typeof d[key] !== 'string' || !/^SIM-[A-Z0-9-]{1,36}$/.test(d[key] as string)) fail(422, 'Codes must begin with SIM-')
  if (typeof d.source_note !== 'string' || d.source_note.length > 200) fail(422, 'Invalid source note')
  for (const key of ['state', 'lga', 'ward']) if (typeof d[key] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 .'/&()-]{0,59}$/.test(d[key] as string)) fail(422, `State, LGA and ward are required (invalid ${key})`)
  let capture: Result['capture']
  if (d.capture !== undefined) {
    if (!d.capture || typeof d.capture !== 'object' || Array.isArray(d.capture)) fail(422, 'Invalid capture checklist')
    const c = d.capture as Record<string, unknown>
    fields(c, ['copy_seen', 'figures_compared', 'location_checked', 'recorded_at'])
    if (c.copy_seen !== true || c.figures_compared !== true || c.location_checked !== true || typeof c.recorded_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(c.recorded_at) || !Number.isFinite(Date.parse(c.recorded_at))) fail(422, 'Complete the capture checklist')
    capture = c as Result['capture']
  }
  const parties = d.party_votes
  if (!parties || typeof parties !== 'object' || Array.isArray(parties)) fail(422, 'Invalid party votes')
  const entries = Object.entries(parties)
  if (entries.length < 2 || entries.length > 26 || entries.some(([key, count]) => !/^[A-Z][A-Z0-9-]{0,11}$/.test(key) || !Number.isSafeInteger(count) || (count as number) < 0 || (count as number) > 10000)) fail(422, 'Invalid party votes')
  let evidence: EvidenceDeclaration | undefined
  if (input.evidence !== undefined) {
    if (!input.evidence || typeof input.evidence !== 'object' || Array.isArray(input.evidence)) fail(422, 'Invalid evidence declaration')
    const e = input.evidence as Record<string, unknown>
    fields(e, ['digest', 'mime', 'size'])
    if (typeof e.digest !== 'string' || !/^[a-f0-9]{64}$/.test(e.digest) || !['image/jpeg', 'image/png', 'image/webp'].includes(e.mime as string) || !Number.isSafeInteger(e.size) || (e.size as number) < 1 || (e.size as number) > 750_000) fail(422, 'Invalid evidence declaration')
    evidence = e as EvidenceDeclaration
  }
  return { report_id, version, ...(evidence ? { evidence } : {}), data: { election_id: d.election_id as string, unit_id: d.unit_id as string,
    accredited: bounded(d.accredited), cast: bounded(d.cast), valid: bounded(d.valid), rejected: bounded(d.rejected),
    party_votes: Object.fromEntries(entries) as Record<string, number>, source_note: d.source_note,
    ...(d.state ? { state: d.state as string } : {}), ...(d.lga ? { lga: d.lga as string } : {}), ...(d.ward ? { ward: d.ward as string } : {}), ...(capture ? { capture } : {}) } }
}
function checks(data: Result): string[] {
  const flags: string[] = []
  if (Object.values(data.party_votes).reduce((a, b) => a + b, 0) !== data.valid) flags.push('Party totals differ from recorded valid votes; compare the source.')
  if (data.valid + data.rejected !== data.cast) flags.push('Valid plus rejected differs from recorded votes cast; compare the source.')
  if (data.cast > data.accredited) flags.push('Recorded votes cast exceed accredited voters; human review required.')
  return flags
}
async function signingKey(env: Env): Promise<CryptoKey> { return crypto.subtle.importKey('pkcs8', unb64(env.SIGNING_KEY_B64) as BufferSource, 'Ed25519', false, ['sign']) }
async function sign(env: Env, body: unknown): Promise<string> { return b64(new Uint8Array(await crypto.subtle.sign('Ed25519', await signingKey(env), encoder.encode(canonical(body))))) }
async function passwordOk(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterationsText, saltText, expectedText] = encoded.split('$')
  if (algorithm !== 'pbkdf2-sha256' || !/^\d+$/.test(iterationsText)) return false
  const iterations = Number(iterationsText)
  if (iterations !== 100000) return false
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltText) as BufferSource, iterations }, key, 256))
  const expected = unb64(expectedText)
  if (actual.length !== expected.length) return false
  let diff = 0; for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]
  return diff === 0
}
async function actor(request: Request, env: Env, write = false): Promise<Actor> {
  const token = /(?:^|;\s*)aegis_session=([^;]+)/.exec(request.headers.get('Cookie') || '')?.[1]
  if (!token) fail(401, 'Sign in required')
  const row = await env.DB.prepare('SELECT a.alias,a.role,a.tenant,s.csrf FROM session s JOIN account a ON a.alias=s.alias WHERE s.token_hash=? AND s.expires>? AND a.active=1').bind(await hash(token), Math.floor(Date.now() / 1000)).first<Actor>()
  if (!row) fail(401, 'Session expired; queued data stays on this device')
  if (write && request.headers.get('X-CSRF-Token') !== row.csrf) fail(403, 'CSRF token required')
  return row
}
function role(user: Actor, expected: string): void { if (user.role !== expected) fail(403, 'Role not permitted') }
async function latest(env: Env, user: Actor, id: string): Promise<VersionRow> {
  const row = await env.DB.prepare('SELECT * FROM result_version WHERE tenant=? AND report_id=? ORDER BY version DESC LIMIT 1').bind(user.tenant, id).first<VersionRow>()
  if (!row || user.role === 'reporter' && row.reporter !== user.alias) fail(404, 'Result not found')
  return row
}

async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url), path = url.pathname, method = request.method
  if (path === '/api/health' && method === 'GET') return json({ ok: true, mode: 'synthetic-only', storage: 'D1' })
  if (path === '/api/session' && method === 'POST') {
    const input = await readBody(request); fields(input, ['alias', 'password'])
    const alias = input.alias, password = input.password
    if (typeof alias !== 'string' || !/^[a-z0-9][a-z0-9_-]{2,59}$/.test(alias) || typeof password !== 'string' || password.length > 200) fail(401, 'Invalid credentials')
    const account = await env.DB.prepare('SELECT alias,password_hash,role,tenant FROM account WHERE alias=? AND active=1').bind(alias).first<{ alias: string; password_hash: string; role: 'reporter' | 'reviewer'; tenant: string }>()
    if (!account || !await passwordOk(password, account.password_hash)) fail(401, 'Invalid credentials')
    const token = randomToken(), csrf = randomToken()
    await env.DB.prepare('INSERT INTO session(token_hash,alias,csrf,expires) VALUES(?,?,?,?)').bind(await hash(token), alias, csrf, Math.floor(Date.now() / 1000) + 8 * 3600).run()
    return json({ alias, role: account.role, tenant: account.tenant, csrf }, 200, { 'Set-Cookie': `aegis_session=${token}; Max-Age=28800; HttpOnly; Secure; SameSite=Strict; Path=/` })
  }
  if (path === '/api/session' && method === 'GET') return json(await actor(request, env))
  if (path === '/api/session' && method === 'DELETE') {
    await actor(request, env, true)
    const token = /(?:^|;\s*)aegis_session=([^;]+)/.exec(request.headers.get('Cookie') || '')?.[1] || ''
    await env.DB.prepare('DELETE FROM session WHERE token_hash=?').bind(await hash(token)).run()
    return json({ ok: true }, 200, { 'Set-Cookie': 'aegis_session=; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Path=/' })
  }
  if (path === `/api/public-key/${KEY_ID}` && method === 'GET') return json({ key_id: KEY_ID, algorithm: 'Ed25519', public_key: env.PUBLIC_KEY_B64 })
  if (path === '/api/results' && method === 'POST') {
    const user = await actor(request, env, true); role(user, 'reporter')
    const submission = validateSubmission(await readBody(request))
    const payload_json = canonical(submission), digest = await hash(payload_json)
    const received_at = now()
    const receiptBody = { tenant: user.tenant, report_id: submission.report_id, version: submission.version, digest, received_at, key_id: KEY_ID }
    const receipt = { body: receiptBody, signature: await sign(env, receiptBody) }
    const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO result_version(tenant,report_id,version,payload_json,digest,reporter,received_at,receipt_json)
      SELECT ?,?,?,?,?,?,?,? WHERE
        (?=1 AND NOT EXISTS(SELECT 1 FROM result_version WHERE tenant=? AND report_id=?)
         AND NOT EXISTS(SELECT 1 FROM result_version WHERE tenant=? AND version=1 AND json_extract(payload_json,'$.data.unit_id')=?)) OR
        (? > 1 AND (SELECT MAX(version) FROM result_version WHERE tenant=? AND report_id=?)=?
         AND (SELECT reporter FROM result_version WHERE tenant=? AND report_id=? ORDER BY version DESC LIMIT 1)=?
         AND (SELECT json_extract(payload_json,'$.data.unit_id') FROM result_version WHERE tenant=? AND report_id=? ORDER BY version DESC LIMIT 1)=?)`)
      .bind(user.tenant, submission.report_id, submission.version, payload_json, digest, user.alias, received_at, canonical(receipt),
        submission.version, user.tenant, submission.report_id,
        user.tenant, submission.data.unit_id,
        submission.version, user.tenant, submission.report_id, submission.version - 1,
        user.tenant, submission.report_id, user.alias,
        user.tenant, submission.report_id, submission.data.unit_id).run()
    if (inserted.meta.changes === 0) {
      const existing = await env.DB.prepare('SELECT digest,receipt_json,reporter FROM result_version WHERE tenant=? AND report_id=? AND version=?').bind(user.tenant, submission.report_id, submission.version).first<{ digest: string; receipt_json: string; reporter: string }>()
      if (existing && existing.reporter !== user.alias) fail(404, 'Result not found')
      if (existing && existing.digest === digest) return json({ receipt: JSON.parse(existing.receipt_json), replayed: true })
      if (existing) fail(409, 'This report/version already has different content')
      const duplicateCode = await env.DB.prepare("SELECT 1 FROM result_version WHERE tenant=? AND version=1 AND json_extract(payload_json,'$.data.unit_id')=? AND report_id<>? LIMIT 1").bind(user.tenant, submission.data.unit_id, submission.report_id).first()
      if (duplicateCode) fail(409, 'Unit code already belongs to another report')
      fail(409, 'Only the original reporter can add the next version')
    }
    return json({ receipt, replayed: false, flags: checks(submission.data) })
  }
  const status = /^\/api\/results\/([^/]+)\/status$/.exec(path)
  if (status && method === 'GET') {
    const user = await actor(request, env), id = uuid(status[1]), newest = await latest(env, user, id)
    const versions = await env.DB.prepare('SELECT * FROM result_version WHERE tenant=? AND report_id=? ORDER BY version').bind(user.tenant, id).all<VersionRow>()
    const review = await env.DB.prepare('SELECT decision,note,created_at FROM review_action WHERE tenant=? AND report_id=? AND version=? ORDER BY id DESC LIMIT 1').bind(user.tenant, id, newest.version).first()
    return json({ report_id: id, latest_version: newest.version, state: review ? 'reviewed' : 'received', review,
      versions: versions.results.map(row => { const payload = JSON.parse(row.payload_json) as Submission; return { version: row.version, payload, receipt: JSON.parse(row.receipt_json), flags: checks(payload.data) } }) })
  }
  if (path === '/api/my-results' && method === 'GET') {
    const user = await actor(request, env); role(user, 'reporter')
    const rows = await env.DB.prepare(`SELECT r.report_id,r.version,r.payload_json,r.digest,r.received_at,a.decision AS review_decision,a.note AS review_note,a.created_at AS review_created_at
      FROM result_version r LEFT JOIN review_action a ON a.id=(SELECT MAX(z.id) FROM review_action z WHERE z.tenant=r.tenant AND z.report_id=r.report_id AND z.version=r.version)
      WHERE r.tenant=? AND r.reporter=? AND r.version=(SELECT MAX(x.version) FROM result_version x WHERE x.tenant=r.tenant AND x.report_id=r.report_id)
      ORDER BY r.received_at DESC LIMIT 100`).bind(user.tenant, user.alias).all<{ report_id: string; version: number; payload_json: string; digest: string; received_at: string; review_decision: string | null; review_note: string | null; review_created_at: string | null }>()
    return json({ items: rows.results.map(row => ({ report_id: row.report_id, version: row.version,
      unit_id: (JSON.parse(row.payload_json) as Submission).data.unit_id, digest: row.digest, received_at: row.received_at, review_decision: row.review_decision, review_note: row.review_note, review_created_at: row.review_created_at })) })
  }
  const evidenceMatch = /^\/api\/results\/([^/]+)\/evidence$/.exec(path)
  if (evidenceMatch && method === 'POST') {
    const user = await actor(request, env, true); role(user, 'reporter')
    const id = uuid(evidenceMatch[1])
    const version = Number(url.searchParams.get('version'))
    if (!Number.isSafeInteger(version) || version < 1) fail(422, 'Invalid version')
    const target = await env.DB.prepare('SELECT payload_json,reporter FROM result_version WHERE tenant=? AND report_id=? AND version=?').bind(user.tenant,id,version).first<{ payload_json: string; reporter: string }>()
    if (!target) fail(404, 'Result version not found')
    if (target.reporter !== user.alias) fail(403, 'Only the original reporter can attach this image')
    const declared = (JSON.parse(target.payload_json) as Submission).evidence
    const mime = request.headers.get('Content-Type')?.split(';')[0]?.toLowerCase() || ''
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) fail(415, 'Use a JPEG, PNG or WebP image')
    const length = Number(request.headers.get('Content-Length') || 0)
    if (length > 750_000) fail(413, 'Image must be under 750 KB')
    const bytes = new Uint8Array(await request.arrayBuffer())
    if (!bytes.length || bytes.length > 750_000) fail(413, 'Image must be under 750 KB')
    const valid = mime === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 : mime === 'image/png' ? bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 : bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    if (!valid) fail(422, 'Image content does not match its type')
    const digest = await hashBytes(bytes), uploaded_at = now()
    if (declared && (declared.digest !== digest || declared.mime !== mime || declared.size !== bytes.length)) fail(409, 'Image does not match the signed declaration')
    if (!declared && version !== (await latest(env, user, id)).version) fail(409, 'Legacy images can only be attached to the latest version')
    const signature = await sign(env, { tenant: user.tenant, report_id: id, version, digest, mime, size: bytes.length, uploaded_at, key_id: KEY_ID })
    const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO evidence_photo(tenant,report_id,version,mime,size,digest,body_b64,uploaded_at,signature)
      SELECT ?,?,?,?,?,?,?,?,? WHERE ?=1 OR NOT EXISTS(SELECT 1 FROM review_action WHERE tenant=? AND report_id=? AND version=? AND decision IN ('approved','needs_correction'))`)
      .bind(user.tenant, id, version, mime, bytes.length, digest, b64Large(bytes), uploaded_at, signature,declared ? 1 : 0,user.tenant,id,version).run()
    if (inserted.meta.changes === 0) {
      const existing = await env.DB.prepare('SELECT digest,mime,size,uploaded_at,signature FROM evidence_photo WHERE tenant=? AND report_id=? AND version=?').bind(user.tenant, id, version).first<{ digest: string; mime: string; size: number; uploaded_at: string; signature: string }>()
      if (!existing) fail(409, 'This version has already been reviewed')
      if (existing.digest !== digest) fail(409, 'This version already has a different image')
      return json({ ...existing, replayed: true })
    }
    return json({ digest, mime, size: bytes.length, uploaded_at, signature, replayed: false })
  }
  if (evidenceMatch && method === 'GET') {
    const user = await actor(request, env), id = uuid(evidenceMatch[1]), newest = await latest(env, user, id)
    if (user.role === 'reporter' && newest.reporter !== user.alias) fail(404, 'Evidence image not found')
    const version = Number(url.searchParams.get('version') || newest.version)
    if (!Number.isSafeInteger(version) || version < 1) fail(422, 'Invalid version')
    const row = await env.DB.prepare('SELECT mime,size,body_b64,digest FROM evidence_photo WHERE tenant=? AND report_id=? AND version=?').bind(user.tenant, id, version).first<{ mime: string; size: number; body_b64: string; digest: string }>()
    if (url.searchParams.get('metadata') === '1') return json({ stored: Boolean(row), ...(row ? { digest: row.digest, mime: row.mime, size: row.size } : {}) })
    if (!row) fail(404, 'Evidence image not found')
    return new Response(unb64(row.body_b64) as BodyInit, { headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'X-Evidence-SHA256': row.digest } })
  }
  if (path === '/api/review' && method === 'GET') {
    const user = await actor(request, env); role(user, 'reviewer')
    const rows = await env.DB.prepare(`SELECT r.*, a.decision AS review_decision,a.note AS review_note,a.created_at AS review_created_at,e.digest AS evidence_digest,
      (SELECT COUNT(DISTINCT z.report_id) FROM evidence_photo z WHERE z.tenant=r.tenant AND z.digest=e.digest AND z.report_id<>r.report_id) AS duplicate_image_reports,
      (SELECT COUNT(*) FROM field_review_action f WHERE f.tenant=r.tenant AND f.report_id=r.report_id AND f.version=r.version AND f.outcome<>'not_compared'
        AND f.id=(SELECT MAX(g.id) FROM field_review_action g WHERE g.tenant=f.tenant AND g.report_id=f.report_id AND g.version=f.version AND g.field_key=f.field_key)) AS comparison_count,
      (SELECT COUNT(*) FROM field_review_action f WHERE f.tenant=r.tenant AND f.report_id=r.report_id AND f.version=r.version AND f.outcome='possible_mismatch'
        AND f.id=(SELECT MAX(g.id) FROM field_review_action g WHERE g.tenant=f.tenant AND g.report_id=f.report_id AND g.version=f.version AND g.field_key=f.field_key)) AS comparison_mismatches
      FROM result_version r LEFT JOIN review_action a ON a.id=(SELECT MAX(z.id) FROM review_action z WHERE z.tenant=r.tenant AND z.report_id=r.report_id AND z.version=r.version)
      LEFT JOIN evidence_photo e ON e.tenant=r.tenant AND e.report_id=r.report_id AND e.version=r.version
      WHERE r.tenant=? AND r.version=(SELECT MAX(x.version) FROM result_version x WHERE x.tenant=r.tenant AND x.report_id=r.report_id)
      ORDER BY r.received_at DESC LIMIT 200`).bind(user.tenant).all<ReviewRow>()
    const items = []
    for (const row of rows.results) {
      const review = row.review_decision ? { decision: row.review_decision, note: row.review_note, created_at: row.review_created_at } : null
      const payload = JSON.parse(row.payload_json) as Submission
      items.push({ report_id: row.report_id, version: row.version, payload, receipt: JSON.parse(row.receipt_json), flags: checks(payload.data), review, received_at: row.received_at, evidence_digest: row.evidence_digest, duplicate_image_reports: row.duplicate_image_reports, comparison_count: row.comparison_count, comparison_mismatches: row.comparison_mismatches })
    }
    return json({ items })
  }
  const fieldReview = /^\/api\/review\/([^/]+)\/fields$/.exec(path)
  if (fieldReview && (method === 'GET' || method === 'POST')) {
    const user = await actor(request, env, method === 'POST'); role(user, 'reviewer')
    const id = uuid(fieldReview[1]), version = Number(url.searchParams.get('version'))
    if (!Number.isSafeInteger(version) || version < 1) fail(422, 'Invalid version')
    const target = await env.DB.prepare('SELECT payload_json FROM result_version WHERE tenant=? AND report_id=? AND version=?').bind(user.tenant,id,version).first<{payload_json:string}>()
    if (!target) fail(404, 'Result version not found')
    if (method === 'GET') {
      const actions = await env.DB.prepare('SELECT id,field_key,outcome,note,reviewer,created_at,previous_event_id FROM field_review_action WHERE tenant=? AND report_id=? AND version=? ORDER BY id').bind(user.tenant,id,version).all()
      return json({ actions: actions.results })
    }
    const input = await readBody(request); fields(input, ['field_key','outcome','note'])
    const data = (JSON.parse(target.payload_json) as Submission).data
    const allowed = new Set(['accredited','cast','valid','rejected',...Object.keys(data.party_votes).map(code => `party:${code}`)])
    if (typeof input.field_key !== 'string' || !allowed.has(input.field_key)) fail(422, 'Unknown result field')
    if (!['not_compared','matches','possible_mismatch','cannot_read'].includes(input.outcome as string)) fail(422, 'Invalid comparison outcome')
    if (typeof input.note !== 'string' || input.note.length > 300 || (input.outcome !== 'not_compared' && input.outcome !== 'matches' && input.note.trim().length < 2)) fail(422, 'Add a short comparison note')
    if (input.outcome !== 'not_compared') {
      const image = await env.DB.prepare('SELECT 1 AS present FROM evidence_photo WHERE tenant=? AND report_id=? AND version=?').bind(user.tenant,id,version).first()
      if (!image) fail(409, 'Attach a source image before comparing its figures')
    }
    const final = await env.DB.prepare("SELECT decision FROM review_action WHERE tenant=? AND report_id=? AND version=? AND decision IN ('approved','needs_correction') ORDER BY id DESC LIMIT 1").bind(user.tenant,id,version).first()
    if (final) fail(409, 'Final review decision already recorded')
    const previous = await env.DB.prepare('SELECT id FROM field_review_action WHERE tenant=? AND report_id=? AND version=? ORDER BY id DESC LIMIT 1').bind(user.tenant,id,version).first<{id:number}>()
    const created_at = now()
    const inserted = await env.DB.prepare('INSERT INTO field_review_action(tenant,report_id,version,field_key,outcome,note,reviewer,created_at,previous_event_id) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(user.tenant,id,version,input.field_key,input.outcome,(input.note as string).trim(),user.alias,created_at,previous?.id ?? null).run()
    return json({ ok: true, event_id: inserted.meta.last_row_id, previous_event_id: previous?.id ?? null, created_at })
  }
  const decision = /^\/api\/review\/([^/]+)\/decision$/.exec(path)
  if (decision && method === 'POST') {
    const user = await actor(request, env, true); role(user, 'reviewer')
    const id = uuid(decision[1]), input = await readBody(request)
    fields(input, ['decision', 'version', 'note'])
    if (!['reviewed', 'approved', 'needs_correction'].includes(input.decision as string) || typeof input.note !== 'string' || input.note.trim().length < 2 || input.note.length > 500) fail(422, 'Invalid review decision')
    const version = bounded(input.version, 1000), newest = await latest(env, user, id)
    if (version !== newest.version) fail(409, 'A newer version needs review')
    if (input.decision === 'approved') {
      const declared = (JSON.parse(newest.payload_json) as Submission).evidence
      if (declared) {
        const stored = await env.DB.prepare('SELECT digest,mime,size FROM evidence_photo WHERE tenant=? AND report_id=? AND version=?').bind(user.tenant,id,version).first<EvidenceDeclaration>()
        if (!stored || stored.digest !== declared.digest || stored.mime !== declared.mime || stored.size !== declared.size) fail(409, 'Declared image must be verified before approval')
      }
    }
    const result = await env.DB.prepare(`INSERT INTO review_action(tenant,report_id,version,reviewer,decision,note,created_at)
      SELECT ?,?,?,?,?,?,? WHERE ?=(SELECT MAX(version) FROM result_version WHERE tenant=? AND report_id=?)
        AND NOT EXISTS (SELECT 1 FROM review_action WHERE tenant=? AND report_id=? AND version=? AND decision IN ('approved','needs_correction'))`)
      .bind(user.tenant, id, version, user.alias, input.decision, input.note.trim(), now(), version, user.tenant, id, user.tenant, id, version).run()
    if (result.meta.changes === 0) fail(409, 'A newer version or recorded final decision prevents review')
    return json({ ok: true, version })
  }
  if (path === '/api/exports' && method === 'POST') {
    const user = await actor(request, env, true); role(user, 'reviewer')
    const input = await readBody(request); fields(input, ['report_id'])
    const id = uuid(input.report_id), row = await latest(env, user, id)
    const review = await env.DB.prepare('SELECT decision FROM review_action WHERE tenant=? AND report_id=? AND version=? ORDER BY id DESC LIMIT 1').bind(user.tenant, id, row.version).first<{ decision: string }>()
    if (review?.decision !== 'approved') fail(409, 'Latest version needs reviewer approval')
    const payload = JSON.parse(row.payload_json) as Submission, data = payload.data
    const selected = { election_id: data.election_id, unit_id: data.unit_id, accredited: data.accredited, cast: data.cast, valid: data.valid, rejected: data.rejected, party_votes: data.party_votes }
    const export_id = crypto.randomUUID()
    const evidence = await env.DB.prepare('SELECT mime,size,digest,uploaded_at,signature FROM evidence_photo WHERE tenant=? AND report_id=? AND version=?').bind(user.tenant,id,row.version).first()
    const body = { export_id, report_id: id, version: row.version, result: selected, receipt: JSON.parse(row.receipt_json), ...(evidence ? { evidence } : {}), notice: 'SIMULATED; not an official result' }
    const export_digest = await hash(canonical(body)), signature = await sign(env, { digest: export_digest, key_id: KEY_ID })
    const result = await env.DB.prepare(`INSERT INTO export_package(export_id,tenant,report_id,version,body_json,digest,signature,approver,created_at)
      SELECT ?,?,?,?,?,?,?,?,? WHERE ?=(SELECT MAX(version) FROM result_version WHERE tenant=? AND report_id=?)
      AND (SELECT decision FROM review_action WHERE tenant=? AND report_id=? AND version=? ORDER BY id DESC LIMIT 1)='approved'`)
      .bind(export_id, user.tenant, id, row.version, canonical(body), export_digest, signature, user.alias, now(),
        row.version, user.tenant, id, user.tenant, id, row.version).run()
    if (result.meta.changes === 0) fail(409, 'Latest version needs reviewer approval')
    return json({ body, digest: export_digest, signature, key_id: KEY_ID })
  }
  const exportMatch = /^\/api\/exports\/([^/]+)$/.exec(path)
  if (exportMatch && method === 'GET') {
    const user = await actor(request, env); role(user, 'reviewer')
    const row = await env.DB.prepare('SELECT body_json,digest,signature FROM export_package WHERE export_id=? AND tenant=?').bind(uuid(exportMatch[1]), user.tenant).first<{ body_json: string; digest: string; signature: string }>()
    if (!row) fail(404, 'Export not found')
    return json({ body: JSON.parse(row.body_json), digest: row.digest, signature: row.signature, key_id: KEY_ID })
  }
  fail(404, 'Not found')
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
      return await api(request, env)
    } catch (error) {
      if (error instanceof ApiError) return json({ detail: error.message }, error.status)
      console.error('API failure', error)
      return json({ detail: 'Service error' }, 500)
    }
  }
} satisfies ExportedHandler<Env>
