import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { DEMO, REPO } from '../lib/demo.js'
import { useState } from 'react'
import { Button } from '../components/ui.jsx'
import { Logo, Wordmark } from '../components/Brand.jsx'
import { SUPABASE } from '../lib/backend.js'

// Supabase build: e-mail + password. One form, two modes; a new account can take a moment to
// exist (the server may ask for the address to be confirmed first), which is said, not hidden.
function AccountForm() {
  const { signIn, signUp, setGuest } = useStore()
  const [mode, setMode] = useState('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const toast = m => useUI.getState().toast(m)
  const creating = mode === 'signup'

  const submit = async ev => {
    ev.preventDefault()
    const em = email.trim()
    if (creating && !name.trim()) { toast(t('Enter a name')); return }
    if (creating && password.length < 8) { toast(t('Password — at least 8 characters')); return }
    setBusy(true)
    try {
      if (creating) {
        const u = await signUp(em, password, name.trim())
        if (u) toast(t('Welcome, {0}', u.name))
        else { setSent(true); setMode('signin') }
      } else {
        const u = await signIn(em, password)
        toast(t('Welcome back, {0}', u.name))
      }
    } catch (e) { toast(e.message || t(creating ? 'Registration failed' : 'Sign-in failed')) }
    setBusy(false)
  }

  return <form onSubmit={submit} style={{ display: 'grid', gap: 10, textAlign: 'left' }}>
    {sent && <div className="card small muted">{t('Check your inbox: confirm your email address, then sign in.')}</div>}
    {creating && <input className="input" placeholder={t('Your name')} maxLength={40} autoComplete="name"
      value={name} onChange={e => setName(e.target.value)} />}
    <input className="input" type="email" placeholder={t('Email')} autoComplete="email" inputMode="email" required
      value={email} onChange={e => setEmail(e.target.value)} />
    <input className="input" type="password" required minLength={creating ? 8 : undefined}
      placeholder={creating ? t('Password — at least 8 characters') : t('Password')}
      autoComplete={creating ? 'new-password' : 'current-password'}
      value={password} onChange={e => setPassword(e.target.value)} />
    <div style={{ height: 2 }} />
    <Button variant="primary" type="submit" disabled={busy}>{creating ? t('Create account') : t('Sign in')}</Button>
    <Button variant="ghost" type="button" onClick={() => { setMode(creating ? 'signin' : 'signup'); setSent(false) }}>
      {creating ? t('Already have an account? Sign in') : t('No account yet? Create one')}
    </Button>
    <Button variant="ghost" type="button" className="dim" onClick={() => setGuest(true)}>{t('Continue without account')}</Button>
  </form>
}

export default function Login() {
  const setGuest = useStore(s => s.setGuest)
  const head = <h1 className="brandhead"><Logo size={88} /><Wordmark /></h1>
  const wrap = { display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '78vh', textAlign: 'center' }

  if (SUPABASE) return (
    <div className="narrow" style={wrap}>
      {head}
      <div className="muted" style={{ marginBottom: 26 }}>{t('Your workouts. Your weights. Your profile.')}</div>
      <AccountForm />
    </div>
  )

  // Demo build: no backend to sign in against — the only way in is the local guest profile.
  if (DEMO) return (
    <div className="narrow" style={wrap}>
      {head}
      <div className="muted" style={{ marginBottom: 30 }}>{t('Live demo — everything stays in this browser.')}</div>
      <Button variant="primary" icon="sparkles" onClick={() => setGuest(true)}>{t('Start the demo')}</Button>
      <div className="card small muted" style={{ textAlign: 'left', marginTop: 16 }}>
        {t('This demo runs entirely in your browser on example data — nothing is sent anywhere.')}
      </div>
      <div className="dim small" style={{ marginTop: 22, lineHeight: 1.6 }}>
        <a href={REPO} target="_blank" rel="noopener">{t('Source code →')}</a>
      </div>
    </div>
  )

  // A build with no backend configured at all (no VITE_SUPABASE_URL): the app still works,
  // it just keeps everything on this device.
  return (
    <div className="narrow" style={wrap}>
      {head}
      <div className="muted" style={{ marginBottom: 30 }}>{t('Your workouts. Your weights. Your profile.')}</div>
      <Button variant="primary" onClick={() => setGuest(true)}>{t('Continue without account')}</Button>
      <div className="dim small" style={{ marginTop: 26, lineHeight: 1.5 }}>{t('Everything stays on this device.')}</div>
    </div>
  )
}
