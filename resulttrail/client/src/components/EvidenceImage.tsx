import { useEffect, useRef, useState } from 'react'

type State = { key: string; url?: string; error?: string; digest?: string }

export function EvidenceImage({ reportId, version, expectedDigest, unitId }: { reportId: string; version: number; expectedDigest: string; unitId: string }) {
  const key = `${reportId}/${version}/${expectedDigest}`
  const [state, setState] = useState<State | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    let active = true, objectUrl: string | undefined
    async function load() {
      try {
        const response = await fetch(`/api/results/${reportId}/evidence?version=${version}`, { credentials: 'same-origin', cache: 'no-store' })
        if (!response.ok) throw new Error('Image could not be retrieved')
        const blob = await response.blob()
        const bytes = await blob.arrayBuffer()
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
        if (digest !== expectedDigest) throw new Error('Image hash differs from the stored original')
        objectUrl = URL.createObjectURL(blob)
        if (active) setState({ key, url: objectUrl, digest })
        else URL.revokeObjectURL(objectUrl)
      } catch (error) { if (active) setState({ key, error: (error as Error).message }) }
    }
    void load()
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [key, reportId, version, expectedDigest])
  if (state?.key !== key) return <p className="empty-inline">Checking source image…</p>
  if (state.error) return <p className="error" role="alert">{state.error}</p>
  return <div className="evidence-preview"><img src={state.url} alt={`Source for ${unitId}`} /><div className="image-tools"><span>Original image hash verified · {state.digest?.slice(0, 16)}…</span><button className="quiet" type="button" onClick={() => { setZoom(1); dialog.current?.showModal() }}>Zoom image</button><a className="quiet" href={state.url} download={`resulttrail-${unitId}-v${version}`}>Download original</a></div><dialog ref={dialog} className="image-dialog" aria-label={`Zoomed source image for ${unitId}`}><div className="image-dialog-toolbar"><strong>{unitId} · version {version}</strong><div><button className="quiet" type="button" onClick={() => setZoom(value => Math.max(1, value - .5))}>− Zoom</button><span aria-live="polite">{Math.round(zoom * 100)}%</span><button className="quiet" type="button" onClick={() => setZoom(value => Math.min(4, value + .5))}>+ Zoom</button><button className="quiet" type="button" onClick={() => dialog.current?.close()}>Close</button></div></div><div className="image-dialog-viewport"><img src={state.url} alt={`Enlarged source for ${unitId}`} style={{ width: `${zoom * 100}%` }} /></div></dialog></div>
}
