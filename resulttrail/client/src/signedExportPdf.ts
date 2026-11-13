import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

export type SignedExport = {
  body: {
    export_id: string
    report_id: string
    version: number
    result: {
      election_id: string
      unit_id: string
      accredited: number
      cast: number
      valid: number
      rejected: number
      party_votes: Record<string, number>
    }
    receipt: { body: { received_at: string }; signature: string }
    evidence?: { digest: string; mime: string; size: number }
    notice: string
  }
  digest: string
  signature: string
  key_id: string
}

type PublicKey = { public_key: string }
const ink = rgb(0.09, 0.22, 0.17)
const green = rgb(0, 0.47, 0.31)
const muted = rgb(0.37, 0.47, 0.41)
const line = rgb(0.82, 0.88, 0.83)
const paper = rgb(0.97, 0.985, 0.97)
const width = 595.28
const height = 841.89

function write(page: PDFPage, value: string, x: number, y: number, font: PDFFont, size = 10, color = ink) {
  page.drawText(value.replace(/[^\x20-\x7e]/g, '-'), { x, y, font, size, color })
}

function lineItem(page: PDFPage, label: string, value: string, y: number, regular: PDFFont, bold: PDFFont) {
  page.drawLine({ start: { x: 47, y: y - 11 }, end: { x: width - 47, y: y - 11 }, thickness: .6, color: line })
  write(page, label, 48, y, regular, 10, muted)
  write(page, value, 265, y, bold, 10)
}

/** The PDF is a readable cover for the exact signed JSON, embedded as an attachment. */
export async function createSignedExportPdf(pack: SignedExport, publicKey: PublicKey): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`ResultTrail approved result copy - ${pack.body.result.unit_id}`)
  doc.setSubject('Illustrative result copy with attached signed verification data')
  doc.setProducer('ResultTrail')
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([width, height])
  page.drawRectangle({ x: 0, y: height - 11, width, height: 11, color: green })
  page.drawRectangle({ x: 38, y: 642, width: width - 76, height: 100, color: paper })
  write(page, 'RESULTTRAIL', 48, 784, bold, 14, green)
  write(page, 'Approved result copy', 48, 747, bold, 25)
  write(page, 'Illustrative data - not an official election result', 48, 723, regular, 10, muted)
  write(page, 'ELECTION', 49, 693, bold, 8, muted)
  write(page, pack.body.result.election_id, 49, 674, bold, 13)
  write(page, 'UNIT CODE', 305, 693, bold, 8, muted)
  write(page, pack.body.result.unit_id, 305, 674, bold, 13)

  write(page, 'Recorded figures', 48, 608, bold, 15)
  let y = 580
  for (const [label, value] of [
    ['Accredited', pack.body.result.accredited], ['Votes cast', pack.body.result.cast],
    ['Valid votes', pack.body.result.valid], ['Rejected votes', pack.body.result.rejected],
  ] as const) { lineItem(page, label, value.toLocaleString('en-NG'), y, regular, bold); y -= 31 }
  const parties = Object.entries(pack.body.result.party_votes)
  for (const [code, votes] of parties) {
    if (y < 210) {
      const next = doc.addPage([width, height])
      next.drawRectangle({ x: 0, y: height - 11, width, height: 11, color: green })
      write(next, 'Recorded figures - continued', 48, 782, bold, 15)
      y = 747
    }
    lineItem(doc.getPages().at(-1)!, `Party ${code}`, votes.toLocaleString('en-NG'), y, regular, bold)
    y -= 31
  }

  const proof = doc.addPage([width, height])
  proof.drawRectangle({ x: 0, y: height - 11, width, height: 11, color: green })
  write(proof, 'Evidence and verification', 48, 782, bold, 20)
  write(proof, 'Reviewer approval applies to this report version.', 48, 754, regular, 11, muted)
  const detailRows = [
    ['Report ID', pack.body.report_id],
    ['Version', String(pack.body.version)],
    ['Received', pack.body.receipt.body.received_at],
    ['Export ID', pack.body.export_id],
    ['Signing key ID', pack.key_id],
  ]
  let detailY = 709
  for (const [label, value] of detailRows) { lineItem(proof, label, value, detailY, regular, bold); detailY -= 37 }
  write(proof, 'Signed package SHA-256', 48, 490, bold, 10)
  write(proof, pack.digest.slice(0, 32), 48, 471, regular, 10)
  write(proof, pack.digest.slice(32), 48, 455, regular, 10)
  if (pack.body.evidence) {
    write(proof, 'Attached source image hash', 48, 421, bold, 10)
    write(proof, pack.body.evidence.digest.slice(0, 32), 48, 402, regular, 10)
    write(proof, pack.body.evidence.digest.slice(32), 48, 386, regular, 10)
  }
  proof.drawRectangle({ x: 38, y: 213, width: width - 76, height: 126, color: paper })
  write(proof, 'How to verify', 49, 313, bold, 12, green)
  write(proof, 'This PDF is a readable copy. Its page content is not digitally signed.', 49, 291, regular, 10)
  write(proof, 'The original signed package and public key are embedded as attachments.', 49, 273, regular, 10)
  write(proof, 'Extract them and run: python -m server.verify PACKAGE.json PUBLIC_KEY.json', 49, 255, regular, 9)
  write(proof, 'Verify the signing key with the ResultTrail operator before relying on it.', 49, 237, regular, 9)
  await doc.attach(new TextEncoder().encode(JSON.stringify(pack, null, 2)), 'resulttrail-signed-package.json', {
    mimeType: 'application/json', description: 'Exact signed export package for independent verification',
  })
  await doc.attach(new TextEncoder().encode(JSON.stringify(publicKey, null, 2)), 'resulttrail-public-key.json', {
    mimeType: 'application/json', description: 'Public verification key',
  })
  for (const [index, current] of doc.getPages().entries()) {
    current.drawLine({ start: { x: 47, y: 49 }, end: { x: width - 47, y: 49 }, thickness: .6, color: line })
    write(current, 'ResultTrail / illustrative evidence workflow', 48, 31, regular, 8, muted)
    write(current, `${index + 1} / ${doc.getPageCount()}`, 515, 31, regular, 8, muted)
  }
  return doc.save()
}
