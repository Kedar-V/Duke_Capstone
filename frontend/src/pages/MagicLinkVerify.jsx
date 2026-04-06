import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { verifyMagicLink } from '../api'
import { setAuth } from '../auth'
import midsLogo from '../assets/mids-logo-white-bg.svg'

export default function MagicLinkVerifyPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setError('No magic link token found.')
      return
    }

    const verify = async () => {
      try {
        const auth = await verifyMagicLink(token)
        setAuth(auth)
        navigate('/projects', { replace: true })
      } catch (err) {
        setError(err?.message || 'Invalid or expired magic link.')
      }
    }

    verify()
  }, [token, navigate])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-card shadow p-8 text-center">
        <div className="flex justify-center mb-6">
          <img src={midsLogo} alt="MIDS" className="h-10 w-auto" />
        </div>
        
        {error ? (
          <>
            <div className="text-red-700 bg-red-50 border border-red-200 rounded-card p-4 mb-6">
              {error}
            </div>
            <button
              className="btn-primary w-full"
              onClick={() => navigate('/login')}
            >
              Back to Login
            </button>
          </>
        ) : (
          <div className="py-8">
            <h2 className="text-xl font-heading text-duke-900 mb-2">Verifying your link...</h2>
            <div className="animate-pulse space-y-4 max-w-sm mx-auto mt-6">
              <div className="h-2 bg-slate-200 rounded"></div>
              <div className="h-2 bg-slate-200 rounded w-5/6 mx-auto"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
