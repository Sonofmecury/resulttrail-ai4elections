import { useEffect, useState } from 'react'
import { DEFAULT_OCR_TRANSFORM, recognizeResultImage, type OcrTransform } from '../ocr/recognize'
import type { Suggestion } from '../ocr/parseTsv'

type Props = { originalUrl: string | null; loadOriginal: () => Promise<Blob>; onAccept: (field: string, value: number) => string | null }
type Preview = { url: string; width: number; height: number }

export function ReporterOcr({ originalUrl, loadOriginal, onAccept }: Props) {
  const [transform, setTransform] = useState<OcrTransform>(DEFAULT_OCR_TRANSFORM)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, [preview])
  const crop = transform.crop
  function changeCrop(field: keyof OcrTransform['crop'], value: number) {
    setTransform(previous => ({ ...previous, crop: { ...previous.crop, [field]: Number.isFinite(value) ? value : 0 } }))
    setSuggestions([])
  }
  async function read() {
    setBusy(true); setMessage(''); setSuggestions([])
    try {
      const result = await recognizeResultImage(await loadOriginal(), transform)
      setPreview({ url: URL.createObjectURL(result.preview), width: result.width, height: result.height })
      setSuggestions(result.suggestions)
      setSelected(result.suggestions[0]?.field ?? null)
      setMessage(result.suggestions.length ? 'Inspect the processed copy and accept only figures that match the original.' : 'No high-confidence figures found. Enter the figures manually or adjust the controls.')
    } catch (error) { setMessage(`OCR could not read the image: ${(error as Error).message}`) }
    finally { setBusy(false) }
  }
  function accept(suggestion: Suggestion) {
    const error = onAccept(suggestion.field, suggestion.value)
    if (error) { setMessage(error); return }
    setSuggestions(previous => previous.filter(value => value.field !== suggestion.field))
    setMessage(`${suggestion.field.replace('party:', 'Party ')} entered for your review. Check all figures before saving.`)
  }
  const focused = suggestions.find(value => value.field === selected)
  return <section className="ocr-experiment reporter-ocr" aria-label="Experimental reporter OCR">
    <span className="experimental-tag">Experimental · unvalidated OCR</span>
    <h3>Suggest figures from the image</h3>
    <p className="help">This works best with the fictional printed demo sheet. Crop, rotate or increase contrast if needed. Processing uses a temporary copy on this device; the original encrypted evidence remains unchanged. Suggestions require your acceptance.</p>
    {originalUrl && <div className="ocr-crop-preview"><img src={originalUrl} alt="Original source to crop for OCR" /><span aria-hidden="true" style={{ left: `${Math.max(0, Math.min(95, crop.x))}%`, top: `${Math.max(0, Math.min(95, crop.y))}%`, width: `${Math.max(5, Math.min(100 - crop.x, crop.width))}%`, height: `${Math.max(5, Math.min(100 - crop.y, crop.height))}%` }} /></div>}
    <div className="ocr-control-grid">
      <label>Rotate<select value={transform.rotation} onChange={event => { setTransform(previous => ({ ...previous, rotation: Number(event.target.value) as OcrTransform['rotation'] })); setSuggestions([]) }}><option value={0}>0°</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></label>
      <label>Contrast {transform.contrast}%<input type="range" min="70" max="200" step="10" value={transform.contrast} onChange={event => { setTransform(previous => ({ ...previous, contrast: Number(event.target.value) })); setSuggestions([]) }} /></label>
      {(['x', 'y', 'width', 'height'] as const).map(field => <label key={field}>Crop {field === 'x' ? 'left' : field === 'y' ? 'top' : field} %<input type="number" min={field === 'x' || field === 'y' ? 0 : 5} max="100" value={crop[field]} onChange={event => changeCrop(field, Number(event.target.value))} /></label>)}
    </div>
    <div className="ocr-control-actions"><button type="button" className="quiet" disabled={busy} onClick={() => void read()}>{busy ? 'Reading image…' : 'Read processed copy'}</button><button type="button" className="text-button" onClick={() => { setTransform(DEFAULT_OCR_TRANSFORM); setSuggestions([]); setMessage('Controls reset.') }}>Reset controls</button></div>
    {message && <p className="help" role="status">{message}</p>}
    {preview && <div className="ocr-processed"><div className="ocr-image-stage"><img src={preview.url} alt="Temporary processed OCR copy" />{focused && <span className="ocr-region" aria-hidden="true" style={{ left: `${focused.box.x / preview.width * 100}%`, top: `${focused.box.y / preview.height * 100}%`, width: `${focused.box.width / preview.width * 100}%`, height: `${focused.box.height / preview.height * 100}%` }} />}</div><p className="help">Temporary OCR copy. The attached original is unchanged.</p></div>}
    {suggestions.length > 0 && <ul className="ocr-suggestions">{suggestions.map(suggestion => <li key={suggestion.field}><button type="button" className="ocr-row-focus" onClick={() => setSelected(suggestion.field)}><strong>{suggestion.field.replace('party:', 'Party ')}</strong><span>{suggestion.value} · OCR confidence {suggestion.confidence}%</span></button><button type="button" className="quiet" onClick={() => accept(suggestion)}>Accept figure</button><button type="button" className="text-button" onClick={() => setSuggestions(previous => previous.filter(value => value.field !== suggestion.field))}>Dismiss</button></li>)}</ul>}
  </section>
}
