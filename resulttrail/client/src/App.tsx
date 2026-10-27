import { useEffect, useState } from 'react'
import { getSession, request } from './api'
import { LoginView } from './components/LoginView'
import { ReporterView } from './components/ReporterView'
import { ReviewerView } from './components/ReviewerView'
import type { Session } from './types'
import './App.css'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [offlineOnly, setOfflineOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [offlineAlias, setOfflineAlias] = useState<string | null>(null)
  const [noticeDismissed, setNoticeDismissed] = useState(() => localStorage.getItem('resulttrail_notice_dismissed') === '1')

  useEffect(() => {
    void getSession().then(value => {
      setSession(value)
      localStorage.setItem('aegis_last_alias', value.alias)
      localStorage.setItem('aegis_last_role', value.role)
    }).catch(() => {
      setOfflineAlias(localStorage.getItem('aegis_last_role') === 'reporter' ? localStorage.getItem('aegis_last_alias') : null)
    }).finally(() => setLoading(false))
  }, [])

  async function signOut() {
    try {
      if (session?.csrf) await request('/session', 'DELETE', undefined, session.csrf)
    } catch (error) { setMessage((error as Error).message) }
    localStorage.removeItem('aegis_last_alias')
    localStorage.removeItem('aegis_last_role')
    setSession(null)
    setOfflineOnly(false)
    setOfflineAlias(null)
  }

  const isReviewer = session?.role === 'reviewer' && !offlineOnly

  return <div className="site-shell">
    <div className="flag-line" aria-hidden="true"><i /><i /><i /></div>
    <div className="app-shell">
      <header className={`app-header ${session ? 'signed-header' : 'guest-header'}`}>
        <div className="brand">
          <img className="brand-mark" src="/brand-mark.svg" alt="" />
          <div className="brand-copy"><strong>ResultTrail<span>.</span></strong><small>Election evidence workspace</small></div>
        </div>
        <div className="header-meta"><span className="event-label">AI4Elections 2026</span></div>
        {session && <div className="user-menu"><span className="user-avatar" aria-hidden="true">{session.alias.slice(0, 1).toUpperCase()}</span><span className="user-label"><strong>{session.alias}</strong><small>{session.role}</small></span><button className="signout" onClick={() => void signOut()}>Sign out</button></div>}
      </header>
      {!noticeDismissed && <aside className="site-disclaimer" role="note"><p><strong>Illustrative environment.</strong> Records and result copies here are examples for a research demonstration. ResultTrail is independent and is not an official election results service.</p><button aria-label="Dismiss illustrative data notice" onClick={() => { localStorage.setItem('resulttrail_notice_dismissed', '1'); setNoticeDismissed(true) }}>×</button></aside>}

      <main>
        {loading ? <section className="loading-state">Opening workspace…</section> : !session ? <div className="login-grid">
          <section className="landing-hero">
            <div className="hero-art" aria-hidden="true" />
            <div className="hero-content"><span className="hero-kicker"><span className="kicker-line" /> Independent civic evidence workflow</span>
              <h1>Clear evidence.<br /><em>Better review.</em></h1>
              <p>Record a result copy, keep it safe when the network drops, and show exactly when it reached a human reviewer.</p>
              <div className="flow-steps" aria-label="Workflow"><span><b>01</b> Capture</span><span><b>02</b> Receive</span><span><b>03</b> Review</span></div>
            </div>
            <div className="hero-foot"><span>INDEPENDENT OBSERVER RESEARCH</span><span>NG / 2026</span></div>
          </section>
          <LoginView offlineAlias={offlineAlias} onOffline={() => {
            if (offlineAlias) { setSession({ alias: offlineAlias, role: 'reporter', tenant: '', csrf: '' }); setOfflineOnly(true) }
          }} onLogin={value => { setSession(value); setOfflineOnly(false); setOfflineAlias(null) }} />
        </div> : <>
          <div className="workspace-intro"><div><span className="eyebrow">{isReviewer ? 'Reviewer workspace' : offlineOnly ? 'Offline observer workspace' : 'Observer workspace'}</span><h1>{isReviewer ? 'Review received reports' : 'Capture and manage reports'}</h1></div></div>
          {isReviewer ? <ReviewerView session={session} /> : <ReporterView session={session} offlineOnly={offlineOnly} />}
        </>}
        {message && <p role="alert" className="error">{message}</p>}
      </main>
      <footer><span>ResultTrail · Evidence workflow</span><span>AI4Elections 2026</span></footer>
    </div>
  </div>
}
export default App
