import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { firstLoginRequestOtp, firstLoginVerifyOtp, login } from '../api'
import { setAuth } from '../auth'
import midsLogo from '../assets/mids-logo-white-bg.svg'

export default function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('dev@duke.edu')
  const [password, setPassword] = useState('devpassword')
  const [newPassword, setNewPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setSubmitting(true)
    try {
      let auth

      if (mode === 'setup') {
        auth = await firstLoginVerifyOtp({
          email,
          otp,
          newPassword,
          displayName,
        })
      } else {
        auth = await login({ email, password })
      }

      setAuth(auth)
      navigate('/projects', { replace: true })
      setTimeout(() => {
        if (window.location.pathname !== '/projects') {
          window.location.assign('/projects')
        }
      }, 50)
    } catch (err) {
      const message = String(err?.message || '')
      if (message.includes('Invalid email or password')) {
        setError('Incorrect email or password. Please try again.')
      } else if (message.includes('First login setup required')) {
        setMode('setup')
        setPassword('')
        setError('First login setup required. Request OTP and set your password.')
      } else if (message.includes('Invalid or expired OTP')) {
        setError('Invalid OTP. Use 0000 in this environment and try again.')
      } else if (message.includes('Password must be at least 8 characters')) {
        setError('Password must be at least 8 characters.')
      } else {
        setError(message || 'Login failed')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function onRequestOtp() {
    setError('')
    setInfo('')
    setSubmitting(true)
    try {
      await firstLoginRequestOtp({ email })
      setInfo('OTP requested. Use 0000 for now.')
    } catch (err) {
      const message = String(err?.message || '')
      if (message.includes('Password already configured')) {
        setError('This account already has a password. Sign in normally.')
      } else {
        setError(message || 'Failed to request OTP')
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
            {mode === 'setup' ? 'First Login Setup' : 'Sign in'}
          </h1>
          <p className="muted mt-1">
            {mode === 'setup'
              ? 'Verify email with OTP, then set your password.'
              : 'Sign in with the account provisioned by your admin.'}
          </p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            {mode === 'setup' ? (
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

            {mode === 'setup' ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                  <div>
                    <div className="label">OTP</div>
                    <input
                      className="input-base"
                      type="text"
                      inputMode="numeric"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="Enter OTP"
                      required
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={onRequestOtp}
                    disabled={submitting}
                  >
                    Request OTP
                  </button>
                </div>

                <div>
                  <div className="label">New password</div>
                  <input
                    className="input-base"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
              </>
            ) : (
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
            )}

            {info ? (
              <div className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-card p-3">
                {info}
              </div>
            ) : null}

            {error ? (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-card p-3">
                {error}
              </div>
            ) : null}

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting
                ? mode === 'setup'
                    ? 'Verifying…'
                    : 'Signing in…'
                : mode === 'setup'
                    ? 'Verify OTP and continue'
                    : 'Sign in'}
            </button>

            {mode === 'setup' ? (
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => {
                  setError('')
                  setInfo('')
                  setMode('login')
                }}
              >
                Back to normal sign in
              </button>
            ) : null}

            {mode !== 'setup' ? (
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => {
                  setError('')
                  setInfo('')
                  setMode('setup')
                }}
              >
                First login? Verify with OTP
              </button>
            ) : null}

            {mode !== 'setup' ? (
              <div className="text-xs text-slate-500 rounded-card border border-slate-200 bg-slate-50 p-3">
                Accounts are provisioned by admins. If you do not have an account yet, contact your instructor.
              </div>
            ) : null}

            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => navigate('/projects', { replace: true })}
            >
              Back to projects
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
