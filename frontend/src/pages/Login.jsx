import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  firstLoginRequestOtp,
  firstLoginVerifyOtp,
  login,
  passwordResetRequestOtp,
  passwordResetVerifyOtp,
} from '../api'
import { setAuth } from '../auth'
import midsLogo from '../assets/mids-logo-white-bg.svg'
import { getCurrentTheme, toggleTheme } from '../theme'

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
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [otpSubmitting, setOtpSubmitting] = useState(false)
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    setTheme(getCurrentTheme())
  }, [])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setAuthSubmitting(true)
    try {
      let auth

      if (mode === 'setup') {
        auth = await firstLoginVerifyOtp({
          email,
          otp,
          newPassword,
          displayName,
        })
      } else if (mode === 'reset') {
        await passwordResetVerifyOtp({
          email,
          otp,
          newPassword,
        })
        setMode('login')
        setPassword('')
        setNewPassword('')
        setOtp('')
        setInfo('Password reset successful. Please sign in with your new password.')
        return
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
        try {
          await firstLoginRequestOtp({ email })
          setInfo('We detected this is your first login. OTP has been sent to your email.')
        } catch (otpErr) {
          const otpMessage = String(otpErr?.message || '')
          if (otpMessage.includes('User not found')) {
            setError('Account not found. Please check your email address and try again.')
          } else {
            setError('First login detected. We could not send OTP automatically, please try again in a moment.')
          }
        }
      } else if (message.includes('Invalid or expired OTP')) {
        setError('Invalid or expired OTP. Please request a new code and try again.')
      } else if (message.includes('Password must be at least 8 characters')) {
        setError('Password must be at least 8 characters.')
      } else {
        setError(message || 'Login failed')
      }
    } finally {
      setAuthSubmitting(false)
    }
  }

  async function onRequestOtp() {
    setError('')
    setInfo('')
    setOtpSubmitting(true)
    try {
      if (mode === 'reset') {
        await passwordResetRequestOtp({ email })
        setInfo('OTP requested. Check your email for the verification code.')
      } else {
        await firstLoginRequestOtp({ email })
        setInfo('OTP requested. Check your email for the verification code.')
      }
    } catch (err) {
      const message = String(err?.message || '')
      if (message.includes('Password already configured')) {
        setError('This account already has a password. Sign in normally.')
      } else if (message.includes('Password is not configured yet')) {
        setError('This account has no password yet. Use first login setup.')
      } else {
        setError(message || 'Failed to request OTP')
      }
    } finally {
      setOtpSubmitting(false)
    }
  }

  async function onStartResetFlow() {
    setError('')
    setInfo('')
    setMode('reset')
    setOtp('')
    setNewPassword('')

    setOtpSubmitting(true)
    try {
      await passwordResetRequestOtp({ email })
      setInfo('OTP requested. Check your email for the verification code.')
    } catch (err) {
      const message = String(err?.message || '')
      if (message.includes('Password is not configured yet')) {
        setError('This account has no password yet. Use first login setup.')
      } else {
        setError(message || 'Failed to request OTP')
      }
    } finally {
      setOtpSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="flex justify-end mb-4">
          <button
            type="button"
            className="h-10 w-10 rounded-full border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:bg-slate-50 transition-colors"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setTheme(toggleTheme())}
          >
            {theme === 'dark' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4"/>
                <path d="M12 2v2"/>
                <path d="M12 20v2"/>
                <path d="m4.93 4.93 1.41 1.41"/>
                <path d="m17.66 17.66 1.41 1.41"/>
                <path d="M2 12h2"/>
                <path d="M20 12h2"/>
                <path d="m6.34 17.66-1.41 1.41"/>
                <path d="m19.07 4.93-1.41 1.41"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9"/>
              </svg>
            )}
          </button>
        </div>
        <div className="flex justify-center mb-6">
          <button
            type="button"
            className="inline-flex mids-logo-surface"
            aria-label="Go to projects"
            onClick={() => navigate('/projects')}
          >
            <img src={midsLogo} alt="MIDS" className="h-9 sm:h-10 md:h-12 w-auto" />
          </button>
        </div>
        <div className="card p-6">
          <h1 className="text-2xl font-heading text-duke-900">
            {mode === 'setup' ? 'First Login Setup' : mode === 'reset' ? 'Reset Password' : 'Sign in'}
          </h1>
          <p className="muted mt-1">
            {mode === 'setup'
              ? 'Verify email with OTP, then set your password.'
              : mode === 'reset'
                ? 'Request an OTP and set a new password for your account.'
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

            {mode === 'setup' || mode === 'reset' ? (
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
                    disabled={otpSubmitting}
                  >
                    {otpSubmitting ? 'Requesting…' : 'Request OTP'}
                  </button>
                </div>

                <div>
                  <div className="label">{mode === 'reset' ? 'Set new password' : 'New password'}</div>
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

            <button type="submit" className="btn-primary w-full" disabled={authSubmitting}>
              {authSubmitting
                ? mode === 'setup' || mode === 'reset'
                    ? 'Verifying…'
                    : 'Signing in…'
                : mode === 'setup' || mode === 'reset'
                    ? 'Verify OTP and continue'
                    : 'Sign in'}
            </button>

            {mode === 'setup' || mode === 'reset' ? (
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

            {mode === 'login' ? (
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={onStartResetFlow}
                disabled={otpSubmitting}
              >
                {otpSubmitting ? 'Preparing reset…' : 'Forgot password? Reset with OTP'}
              </button>
            ) : null}

            {mode !== 'setup' && mode !== 'reset' ? (
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
