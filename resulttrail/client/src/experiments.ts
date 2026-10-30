import type { Session } from './types'

// Build flags control the demo UI, while the existing server role/session controls
// all evidence reads and reviewer writes. Normal builds leave both flags unset.
const aliases = (import.meta.env.VITE_EXPERIMENT_ALIASES || '')
  .split(',').map((alias: string) => alias.trim().toLowerCase()).filter(Boolean)

export function ocrDemoEnabled(session: Session): boolean {
  return import.meta.env.VITE_OCR_EXPERIMENT === 'true' && aliases.includes(session.alias.toLowerCase())
}

export function rankingDemoEnabled(session: Session): boolean {
  return import.meta.env.VITE_RANKING_EXPERIMENT === 'true' && session.role === 'reviewer' && aliases.includes(session.alias.toLowerCase())
}
