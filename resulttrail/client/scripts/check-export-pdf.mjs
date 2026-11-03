import ts from 'typescript'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const source = await readFile('src/signedExportPdf.ts', 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
await mkdir('node_modules/.cache', { recursive: true })
await writeFile('node_modules/.cache/check-export-pdf.mjs', compiled.outputText)
const { createSignedExportPdf } = await import('../node_modules/.cache/check-export-pdf.mjs')
const pack = {
  body: {
    export_id: 'e1b3e6a0-7549-46e4-a02c-b756488857da',
    report_id: 'c3a9f436-106b-4570-93ca-05867b28f567',
    version: 2,
    result: { election_id: 'illustrative-2026', unit_id: 'SIM-UNIT-123456', accredited: 300, cast: 284, valid: 280, rejected: 4, party_votes: { A: 140, B: 96, C: 44 } },
    receipt: { body: { received_at: '2026-11-04T12:00:00Z' }, signature: 'illustrative-receipt-signature' },
    evidence: { digest: 'a'.repeat(64), mime: 'image/jpeg', size: 430000 },
    notice: 'SIMULATED; not an official result',
  }, digest: 'b'.repeat(64), signature: 'illustrative-export-signature', key_id: 'v1',
}
const publicKey = { public_key: 'illustrative-public-key' }
const pdf = await createSignedExportPdf(pack, publicKey)
await mkdir('../instance', { recursive: true })
await writeFile('../instance/check-export.pdf', pdf)
await writeFile('../instance/check-export-package.json', JSON.stringify(pack, null, 2))
await writeFile('../instance/check-export-key.json', JSON.stringify(publicKey, null, 2))
const expanded = structuredClone(pack)
expanded.body.result.party_votes = Object.fromEntries([...Array(26)].map((_, index) => [String.fromCharCode(65 + index), index]))
await writeFile('../instance/check-export-many-parties.pdf', await createSignedExportPdf(expanded, publicKey))
console.log(`Created ${pdf.length} byte PDF and 26-party pagination check`)
