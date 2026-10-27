import { useState } from 'react'
import type { Session } from '../types'
import { request } from '../api'

type Props = { onLogin: (session: Session) => void; offlineAlias: string | null; onOffline: () => void }

export function LoginView({ onLogin, offlineAlias, onOffline }: Props) {
  const [alias, setAlias] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setMessage('')
    try {
      const session = await request<Session>('/session', 'POST', { alias, password })
      localStorage.setItem('aegis_last_alias', session.alias)
      localStorage.setItem('aegis_last_role', session.role)
      onLogin(session)
    } catch (error) { setMessage((error as Error).message) }
    finally { setBusy(false) }
  }

  return <div className="login-layout">
    <form className="card login-card" onSubmit={submit}>
      <span className="eyebrow">Access workspace</span>
      <h2>Sign in</h2>
      <p className="login-lead">Use the account assigned by your project coordinator.</p>
      <label>Account alias
        <input autoComplete="username" value={alias} onChange={e => setAlias(e.target.value.trim().toLowerCase())} maxLength={60} placeholder="Your assigned alias" required />
      </label>
      <label>Password
        <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
      </label>
      <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      {message && <p className="error" role="alert">{message}</p>}
      {offlineAlias && <button type="button" className="text-button" onClick={onOffline}>Open {offlineAlias}'s encrypted queue while offline</button>}
      <p className="subtle">Ask the project coordinator for an account if you have not been assigned one.</p>
    </form>
  </div>
}
