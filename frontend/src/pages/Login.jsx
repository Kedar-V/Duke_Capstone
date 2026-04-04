import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { requestMagicLink, login } from '../api'
import { setAuth } from '../auth'
import midsLogo from '../assets/mids-logo-white-bg.svg'

function MagicLinkLoginSection() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [devUrl, setDevUrl] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setDevUrl('')
    setSubmitting(true)
    
    try {
      if (!email.trim() || !email.includes('@')) {
        throw new Error('Please enter a valid email address.')
      }

      const res = await requestMagicLink(email)
      setInfo(res.message)
      if (res.dev_url) {
        setDevUrl(res.dev_url)
      }
    } catch (err) {
      setError(err?.message || 'Failed to send login link. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card p-6">
      <h1 className="text-2xl font-heading text-duke-900">Sign in</h1>
      <p className="muted mt-1">Enter your Duke email to get a magic sign-in link.</p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div>
          <div className="label">Email</div>
          <input
            className="input-base"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@duke.edu"
            required
            disabled={submitting || Boolean(info)}
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-card p-3">
            {error}
          </div>
        )}

        {info ? (
          <div className="space-y-4">
            <div className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-card p-4 text-center">
              <svg className="w-8 h-8 text-blue-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <div className="font-semibold text-blue-900 mb-1">Check your inbox</div>
              {info}
            </div>
            
            {devUrl && (
              <div className="text-sm text-left font-mono break-all p-3 bg-slate-800 text-slate-200 rounded">
                <div className="text-xs text-slate-400 mb-1 font-sans">DEV MODE LINK:</div>
                <a href={devUrl} className="text-blue-300 hover:text-blue-200 underline">
                  {devUrl}
                </a>
              </div>
            )}

            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                setInfo('')
                setDevUrl('')
              }}
            >
              Try another email
            </button>
          </div>
        ) : (
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Sending link...' : 'Send Magic Link'}
          </button>
        )}
      </form>
    </div>
  )
}

function AdminFallbackSection() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const auth = await login({ email, password })
      setAuth(auth)
      navigate('/projects', { replace: true })
      setTimeout(() => {
        if (window.location.pathname !== '/projects') {
          window.location.assign('/projects')
        }
      }, 50)
    } catch (err) {
      setError(err?.message || 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-8 pt-8 border-t border-slate-200">
      <details className="group">
        <summary className="text-sm text-slate-500 cursor-pointer select-none text-center hover:text-slate-700">
          Admin / Password Login
        </summary>
        <div className="mt-4 card p-6 bg-slate-50/50 shadow-sm border-slate-200">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <div className="label">Email</div>
              <input
                className="input-base bg-white"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <div className="label">Password</div>
              <input
                className="input-base bg-white"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
                {error}
              </div>
            )}
            <button type="submit" className="btn-secondary w-full" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign in with Password'}
            </button>
          </form>
        </div>
      </details>
    </div>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="flex justify-center mb-6">
          <button
            type="button"
            className="inline-flex"
            aria-label="Go to projects"
            onClick={() => navigate('/projects')}
          >
            <img src={midsLogo} alt="MIDS" className="h-9 sm:h-10 md:h-12 w-auto" />
          </button>
        </div>

        <MagicLinkLoginSection />
        <AdminFallbackSection />
        
      </div>
    </div>
  )
}
