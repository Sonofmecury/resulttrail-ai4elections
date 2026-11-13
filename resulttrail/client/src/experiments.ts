import type { Session } from './types'

// Review ranking remains account-limited. OCR is an explicit, on-device action
// available to signed-in reporters and reviewers; server roles still enforce access.
const aliases = (import.meta.env.VITE_EXPERIMENT_ALIASES || '')
  .split(',').map((alias: string) => alias.trim().toLowerCase()).filter(Boolean)

export function ocrAvailable(session: Session): boolean {
  return session.role === 'reporter' || session.role === 'reviewer'
}

export function rankingDemoEnabled(session: Session): boolean {
  return import.meta.env.VITE_RANKING_EXPERIMENT === 'true' && session.role === 'reviewer' && aliases.includes(session.alias.toLowerCase())
}
