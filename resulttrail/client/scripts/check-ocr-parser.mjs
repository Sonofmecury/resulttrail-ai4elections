import assert from 'node:assert/strict'
import { parsePrintedResultTsv } from '../src/ocr/parseTsv.ts'

const header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext'
function words(label, value, line) {
  return [...label.split(' '), value].map((text, index) =>
    [5, 1, 1, 1, line, index + 1, index * 90, line * 30, 70, 18, 98, text].join('\t')).join('\n')
}
const tsv = [header, words('Party APC', '123', 1), words('Party NNPP', '42', 2), words('Votes cast', '165', 3)].join('\n')
assert.deepEqual(Object.fromEntries(parsePrintedResultTsv(tsv).map(item => [item.field, item.value])), {
  'party:APC': 123, 'party:NNPP': 42, cast: 165,
})
const duplicate = `${tsv}\n${words('Party APC', '999', 4)}`
assert.equal(parsePrintedResultTsv(duplicate).some(item => item.field === 'party:APC'), false)
console.log('OCR parser accepts multi-letter party codes and abstains on duplicates')
