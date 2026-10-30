export type Suggestion = { field: string; value: number; confidence: number; box: { x: number; y: number; width: number; height: number } }
type Word = { text: string; confidence: number; line: string; x: number; y: number; width: number; height: number }

// A deliberately narrow parser for ResultTrail's fictional, printed demo sheet.
// Ambiguous lines, repeated fields and non-integer values yield no suggestion.
export function parsePrintedResultTsv(tsv: string): Suggestion[] {
  const words: Word[] = []
  for (const row of tsv.split(/\r?\n/).slice(1)) {
    const cells = row.split('\t')
    if (cells.length < 12 || cells[0] !== '5' || !cells[11]?.trim()) continue
    const confidence = Number(cells[10])
    if (!Number.isFinite(confidence)) continue
    words.push({ text: cells.slice(11).join('\t').trim(), confidence,
      line: cells.slice(1, 5).join('/'), x: Number(cells[6]), y: Number(cells[7]), width: Number(cells[8]), height: Number(cells[9]) })
  }
  const lines = new Map<string, Word[]>()
  for (const word of words) lines.set(word.line, [...(lines.get(word.line) ?? []), word])
  const found = new Map<string, Suggestion[]>()
  for (const line of lines.values()) {
    const sorted = line.sort((a, b) => a.x - b.x)
    const text = sorted.map(word => word.text).join(' ').replace(/\s+/g, ' ').trim()
    const match = /^(Accredited|Votes cast|Valid votes|Rejected|Party ([A-Z]))\s+([0-9]{1,5})$/i.exec(text)
    if (!match) continue
    const field = match[2] ? `party:${match[2].toUpperCase()}` : ({ accredited: 'accredited', 'votes cast': 'cast', 'valid votes': 'valid', rejected: 'rejected' } as Record<string, string>)[match[1].toLowerCase()]
    const numeric = sorted.at(-1)!
    const value = Number(match[3])
    if (numeric.text !== match[3] || numeric.confidence < 95 || sorted.slice(0, -1).some(word => word.confidence < 85) || value > 10000) continue
    const proposal = { field, value, confidence: Math.round(numeric.confidence * 10) / 10,
      box: { x: numeric.x, y: numeric.y, width: numeric.width, height: numeric.height } }
    found.set(field, [...(found.get(field) ?? []), proposal])
  }
  return [...found.values()].filter(matches => matches.length === 1).map(matches => matches[0])
}
