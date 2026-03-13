import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { login, register } from '../api'
import { setAuth } from '../auth'
import midsLogo from '../assets/mids-logo-white-bg.svg'

export default function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('dev@duke.edu')
  const [password, setPassword] = useState('devpassword')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const auth =
        mode === 'register'
          ? await register({ email, password, displayName })
          : await login({ email, password })
      setAuth(auth)
      navigate('/projects', { replace: true })
      setTimeout(() => {
        if (window.location.pathname !== '/projects') {
          window.location.assign('/projects')
        }
      }, 50)
    } catch (err) {
      const message = String(err?.message || '')
      if (message.includes('Email is already registered')) {
        setError('That email is already registered. Try signing in instead.')
      } else if (message.includes('Invalid email or password')) {
        setError('Incorrect email or password. Please try again.')
      } else {
        setError(message || 'Login failed')
      }
    } finally {
      setSubmitting(false)
    }
  }

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
        <div className="card p-6">
          <h1 className="text-2xl font-heading text-duke-900">
            {mode === 'register' ? 'Create account' : 'Sign in'}
          </h1>
          <p className="muted mt-1">Use your account to save carts and rankings.</p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            {mode === 'register' ? (
              <div>
                <div className="label">Name</div>
                <input
                  className="input-base"
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>
            ) : null}

            <div>
              <div className="label">Email</div>
              <input
                className="input-base"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <div className="label">Password</div>
              <input
                className="input-base"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error ? (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-card p-3">
                {error}
              </div>
            ) : null}

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting
                ? mode === 'register'
                  ? 'Creating…'
                  : 'Signing in…'
                : mode === 'register'
                  ? 'Create account'
                  : 'Sign in'}
            </button>

            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                setError('')
                setMode(mode === 'register' ? 'login' : 'register')
              }}
            >
              {mode === 'register'
                ? 'Already have an account? Sign in'
                : 'Create account'}
            </button>

            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => navigate('/projects', { replace: true })}
            >
              Back to projects
            </button>
          </form>
        </div>

        {/* <div className="mt-4 text-xs text-slate-500">
          Dev default: <span className="font-mono">dev@duke.edu</span> / <span className="font-mono">devpassword</span>
        </div> */}
      </div>
    </div>
  )
}
