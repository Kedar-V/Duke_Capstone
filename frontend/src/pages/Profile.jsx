import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { getMe, updateMe } from '../api'
import { clearAuth, getUser, updateStoredUser } from '../auth'
import midsLogo from '../assets/mids-logo-white-bg.svg'
import { DEFAULT_PROFILE_IMAGE_URL, initialsForPerson, resolveProfileImageUrl } from '../profileImage'

export default function ProfilePage() {
  const navigate = useNavigate()
  const user = getUser()

  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [initialProfileImageUrl, setInitialProfileImageUrl] = useState('')
  const [profileImageUrl, setProfileImageUrl] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [accountAvatarFailed, setAccountAvatarFailed] = useState(false)

  const menuItems = user?.role === 'admin'
    ? ['Projects', 'Partners', 'Rankings', 'Admin']
    : ['Projects', 'Partners', 'Rankings']

  function navigateSection(label) {
    setMenuOpen(false)
    setAccountOpen(false)
    if (label === 'Partners') navigate('/partners')
    if (label === 'Projects') navigate('/projects')
    if (label === 'Rankings') navigate('/rankings')
    if (label === 'Admin') navigate('/admin')
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const me = await getMe()
        if (cancelled) return
        setDisplayName(me?.display_name || '')
        setEmail(me?.email || '')
        setProfileImageUrl(me?.profile_image_url || '')
        setInitialProfileImageUrl(me?.profile_image_url || '')
      } catch (err) {
        if (!cancelled) setError(String(err?.message || 'Failed to load profile'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function onSave(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (password && password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Password confirmation does not match.')
      return
    }

    setSaving(true)
    try {
      const normalizedImageUrl = (profileImageUrl || '').trim()
      const imageChanged = normalizedImageUrl !== (initialProfileImageUrl || '').trim()
      const updated = await updateMe({
        display_name: displayName,
        password: password || undefined,
        ...(imageChanged ? { profile_image_url: normalizedImageUrl } : {}),
      })
      updateStoredUser(updated)
      setPassword('')
      setConfirmPassword('')
      setProfileImageUrl(updated?.profile_image_url || '')
      setInitialProfileImageUrl(updated?.profile_image_url || '')
      setSuccess('Profile updated successfully.')
    } catch (err) {
      setError(String(err?.message || 'Failed to update profile'))
    } finally {
      setSaving(false)
    }
  }

  function onSignOut() {
    setAccountOpen(false)
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
        <div className="card p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="relative md:hidden">
                <button
                  type="button"
                  className="h-10 w-10 rounded-full border border-slate-200 bg-white text-slate-600 flex items-center justify-center text-lg"
                  aria-label="Open menu"
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  ☰
                </button>
                {menuOpen ? (
                  <div className="absolute left-0 top-full mt-2 w-56 rounded-card border border-slate-200 bg-white shadow-sm p-2 z-10">
                    <div className="text-xs uppercase tracking-wide text-slate-400 px-2 py-1">
                      Sections
                    </div>
                    <div className="flex flex-col gap-1">
                      {menuItems.map((label) => (
                        <button
                          key={label}
                          type="button"
                          className="w-full text-left px-3 py-2 rounded-card text-sm text-slate-700 hover:bg-slate-100"
                          onClick={() => navigateSection(label)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="inline-flex"
                aria-label="Go to projects"
                onClick={() => navigate('/projects')}
              >
                <img src={midsLogo} alt="MIDS" className="h-9 sm:h-10 md:h-12 w-auto" />
              </button>
              <div className="hidden md:flex items-center gap-2 md:ml-3 md:pl-3 md:border-l md:border-slate-200">
                {menuItems.map((label) => {
                  const isActive = label === 'Profile'
                  return (
                    <button
                      key={label}
                      type="button"
                      className={
                        isActive
                          ? 'px-3 py-2 rounded-card text-sm bg-duke-900 text-white'
                          : 'px-3 py-2 rounded-card text-sm text-slate-700 hover:bg-slate-100'
                      }
                      onClick={() => navigateSection(label)}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="relative">
              <button
                type="button"
                className="h-10 w-10 rounded-full bg-duke-900 text-white text-sm font-semibold"
                aria-label="Account menu"
                title="Account menu"
                onClick={() => setAccountOpen((v) => !v)}
              >
                {!accountAvatarFailed ? (
                  <img
                    src={resolveProfileImageUrl({
                      displayName: user?.display_name,
                      email: user?.email,
                      profileImageUrl: user?.profile_image_url,
                    })}
                    alt="Profile"
                    className="h-full w-full rounded-full object-cover"
                    onError={(event) => {
                      if (event.currentTarget.src !== DEFAULT_PROFILE_IMAGE_URL) {
                        event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                        return
                      }
                      setAccountAvatarFailed(true)
                    }}
                  />
                ) : (
                  initialsForPerson({ displayName: user?.display_name, email: user?.email })
                )}
              </button>
              {accountOpen ? (
                <div className="absolute right-0 top-full mt-2 w-44 rounded-card border border-slate-200 bg-white shadow-sm p-2 z-20">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-card text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => {
                      setAccountOpen(false)
                      navigate('/profile')
                    }}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-card text-sm text-red-700 hover:bg-red-50"
                    onClick={onSignOut}
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="max-w-2xl">
          <div className="card p-6 md:p-8">
            <h1 className="text-2xl font-heading text-duke-900">Profile</h1>
            <p className="muted mt-1">Edit your personal attributes used in the platform.</p>

            {loading ? (
              <div className="mt-6 text-slate-600">Loading profile…</div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={onSave}>
                <div className="flex items-center gap-4 rounded-card border border-slate-200 bg-slate-50 p-3">
                  <img
                    src={profileImageUrl || DEFAULT_PROFILE_IMAGE_URL}
                    alt="Profile preview"
                    className="h-16 w-16 rounded-full border border-slate-200 bg-white object-cover"
                    onError={(event) => {
                      event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                    }}
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Profile photo preview</div>
                    <div className="text-xs text-slate-500">
                      Defaults to Duke MIDS format `last_first-400x400.jpg` when not set.
                    </div>
                  </div>
                </div>

                <div>
                  <div className="label">Email</div>
                  <input className="input-base bg-slate-100" type="email" value={email} disabled />
                </div>

                <div>
                  <div className="label">Display name</div>
                  <input
                    className="input-base"
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>

                <div>
                  <div className="label">Profile image URL</div>
                  <input
                    className="input-base"
                    type="url"
                    value={profileImageUrl}
                    onChange={(e) => setProfileImageUrl(e.target.value)}
                    placeholder="https://datascience.duke.edu/wp-content/uploads/2025/09/last_first-400x400.jpg"
                  />
                  <div className="mt-1 text-xs text-slate-500">
                    Clear this field and save to use the default Duke MIDS URL pattern based on your name.
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="label">New password</div>
                    <input
                      className="input-base"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={8}
                      placeholder="Leave blank to keep current"
                    />
                  </div>

                  <div>
                    <div className="label">Confirm password</div>
                    <input
                      className="input-base"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      minLength={8}
                      placeholder="Re-enter new password"
                    />
                  </div>
                </div>

                {error ? (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-card p-3">
                    {error}
                  </div>
                ) : null}

                {success ? (
                  <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-card p-3">
                    {success}
                  </div>
                ) : null}

                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
