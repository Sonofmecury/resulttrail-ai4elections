import { parsePrintedResultTsv, type Suggestion } from './parseTsv'

export type OcrTransform = {
  rotation: 0 | 90 | 180 | 270
  contrast: number
  crop: { x: number; y: number; width: number; height: number }
}
export const DEFAULT_OCR_TRANSFORM: OcrTransform = { rotation: 0, contrast: 100, crop: { x: 0, y: 0, width: 100, height: 100 } }
export type OcrResult = { suggestions: Suggestion[]; preview: Blob; width: number; height: number }

function bounded(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min
}

async function processedCopy(original: Blob, transform: OcrTransform): Promise<{ blob: Blob; width: number; height: number }> {
  const image = await createImageBitmap(original)
  try {
    if (image.width * image.height > 12_000_000) throw new Error('Image dimensions exceed the OCR preview limit')
    const x = bounded(transform.crop.x, 0, 95)
    const y = bounded(transform.crop.y, 0, 95)
    const widthPercent = bounded(transform.crop.width, 5, 100 - x)
    const heightPercent = bounded(transform.crop.height, 5, 100 - y)
    const sx = Math.round(image.width * x / 100), sy = Math.round(image.height * y / 100)
    const sw = Math.max(1, Math.min(image.width - sx, Math.round(image.width * widthPercent / 100)))
    const sh = Math.max(1, Math.min(image.height - sy, Math.round(image.height * heightPercent / 100)))
    const sideways = transform.rotation === 90 || transform.rotation === 270
    const canvas = document.createElement('canvas')
    canvas.width = sideways ? sh : sw
    canvas.height = sideways ? sw : sh
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image processing is unavailable in this browser')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.filter = `contrast(${bounded(transform.contrast, 70, 200)}%)`
    context.translate(canvas.width / 2, canvas.height / 2)
    context.rotate(transform.rotation * Math.PI / 180)
    context.drawImage(image, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not prepare OCR image')), 'image/png'))
    return { blob, width: canvas.width, height: canvas.height }
  } finally { image.close() }
}

export async function recognizeResultImage(original: Blob, transform: OcrTransform = DEFAULT_OCR_TRANSFORM): Promise<OcrResult> {
  const processed = await processedCopy(original, transform)
  const { default: Tesseract } = await import('tesseract.js')
  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr', workerBlobURL: false,
  })
  try {
    const result = await worker.recognize(processed.blob, {}, { tsv: true })
    return { suggestions: parsePrintedResultTsv(result.data.tsv ?? ''), preview: processed.blob,
      width: processed.width, height: processed.height }
  } finally { await worker.terminate() }
}
