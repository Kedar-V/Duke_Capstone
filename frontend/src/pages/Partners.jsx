import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { getStudents, getTeammateChoices, saveTeammateChoices } from '../api'
import { clearAuth, getUser } from '../auth'
import midsLogo from '../assets/mids-logo-white-bg.svg'
import { DEFAULT_PROFILE_IMAGE_URL, initialsForPerson, resolveProfileImageUrl } from '../profileImage'

export default function PartnersPage() {
  const navigate = useNavigate()
  const user = getUser()

  const [students, setStudents] = useState([])
  const [wantIds, setWantIds] = useState([])
  const [avoidIds, setAvoidIds] = useState([])
  const [comments, setComments] = useState({})
  const [searchText, setSearchText] = useState('')
  const [saving, setSaving] = useState(false)
  const [popup, setPopup] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountAvatarFailed, setAccountAvatarFailed] = useState(false)
  const popupTimerRef = useRef(null)

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

  function onSignOut() {
    setAccountOpen(false)
    clearAuth()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const studentsPromise = user?.role === 'student'
          ? getStudents({ cohort_id: user?.cohort_id })
          : getStudents()
        const choicesPromise = getTeammateChoices().catch(() => ({
          want_ids: [],
          avoid_ids: [],
          comments: {},
          avoid_reasons: {},
        }))

        const [s, choices] = await Promise.all([studentsPromise, choicesPromise])
        if (cancelled) return

        setStudents(Array.isArray(s) ? s : [])
        setWantIds(choices.want_ids || [])
        setAvoidIds(choices.avoid_ids || [])
        setComments(choices.comments || choices.avoid_reasons || {})
      } catch (err) {
        if (cancelled) return
        setStudents([])
        setWantIds([])
        setAvoidIds([])
        setComments({})
        const fallback = user?.role === 'student'
          ? 'Failed to load students for your cohort'
          : 'Failed to load students'
        showPopup('error', String(err?.message || fallback))
      }
    }

    if (user) load()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  useEffect(() => {
    return () => {
      if (popupTimerRef.current) {
        clearTimeout(popupTimerRef.current)
      }
    }
  }, [])

  function showPopup(type, text) {
    setPopup({ type, text })
    if (popupTimerRef.current) {
      clearTimeout(popupTimerRef.current)
    }
    popupTimerRef.current = setTimeout(() => {
      setPopup(null)
      popupTimerRef.current = null
    }, 3000)
  }

  const studentsById = useMemo(() => {
    const map = new Map()
    students.forEach((s) => map.set(s.id, s))
    return map
  }, [students])

  const visibleStudents = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return students.filter((s) => {
      if (user?.email && String(s.email || '').toLowerCase() === user.email.toLowerCase()) {
        return false
      }
      if (!query) return true
      const haystack = `${s.full_name || ''} ${s.email || ''} ${s.program || ''}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [students, searchText, user?.email])

  const wantStudents = useMemo(
    () => wantIds.map((id) => studentsById.get(id)).filter(Boolean),
    [wantIds, studentsById]
  )

  const avoidStudents = useMemo(
    () => avoidIds.map((id) => studentsById.get(id)).filter(Boolean),
    [avoidIds, studentsById]
  )

  function setPreference(studentId, target) {
    const inWant = wantIds.includes(studentId)
    const inAvoid = avoidIds.includes(studentId)

    if (target === 'want') {
      if (!inWant && wantIds.length >= 5) {
        showPopup('error', 'Want list is full (5/5). Remove someone first.')
        return
      }
      setWantIds((prev) => (prev.includes(studentId) ? prev : [...prev, studentId]))
      setAvoidIds((prev) => prev.filter((id) => id !== studentId))
      return
    }

    if (target === 'avoid') {
      if (!inAvoid && avoidIds.length >= 5) {
        showPopup('error', 'Avoid list is full (5/5). Remove someone first.')
        return
      }
      setAvoidIds((prev) => (prev.includes(studentId) ? prev : [...prev, studentId]))
      setWantIds((prev) => prev.filter((id) => id !== studentId))
      return
    }

    setWantIds((prev) => prev.filter((id) => id !== studentId))
    setAvoidIds((prev) => prev.filter((id) => id !== studentId))
    setComments((prev) => {
      const next = { ...prev }
      delete next[studentId]
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveTeammateChoices({
        wantIds,
        avoidIds,
        comments,
        avoidReasons: avoidIds.reduce((acc, id) => {
          acc[id] = comments[id] || ''
          return acc
        }, {}),
      })
      showPopup('success', 'Saved teammate choices.')
    } catch (err) {
      showPopup('error', String(err?.message || 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {popup ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/30"
          role="presentation"
          onClick={() => setPopup(null)}
        >
          <div
            role="alert"
            aria-live="assertive"
            className={`card w-[min(520px,calc(100vw-2rem))] px-4 py-4 text-sm pointer-events-auto ${
              popup.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="font-semibold">
                {popup.type === 'error' ? 'Action Required' : 'Success'}
              </div>
              <button
                type="button"
                className="text-current/70 hover:text-current"
                aria-label="Close"
                onClick={() => setPopup(null)}
              >
                ✕
              </button>
            </div>
            <div className="mt-2 text-justify">{popup.text}</div>
          </div>
        </div>
      ) : null}
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
                  const isActive = label === 'Partners'
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
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-heading text-duke-900">Partners</h1>
              <p className="muted mt-1">Set up to 5 people you want to work with and up to 5 you want to avoid.</p>
              <p className="muted mt-1">Use the class list below and click Want or Avoid for each student. Both lists support optional comments.</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Want {wantIds.length}/5</div>
              <div className="text-xs text-slate-500">Avoid {avoidIds.length}/5</div>
              <button type="button" className="btn-primary mt-2" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save choices'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6">
          <div className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-heading text-duke-900">Classmates</div>
                <div className="text-sm text-slate-500">Click Want or Avoid. Selecting one clears the other.</div>
              </div>
              <div className="text-xs text-slate-500">{visibleStudents.length} shown</div>
            </div>
            <div className="mt-3">
              <input
                className="input-base"
                type="text"
                placeholder="Search by name or email"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
            <div className="mt-3 max-h-[520px] overflow-auto space-y-2 pr-1">
              {visibleStudents.length === 0 ? (
                <div className="rounded-card border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                  No students found for your cohort.
                </div>
              ) : (
                visibleStudents.map((student) => {
                  const inWant = wantIds.includes(student.id)
                  const inAvoid = avoidIds.includes(student.id)
                  const wantDisabled = !inWant && wantIds.length >= 5
                  const avoidDisabled = !inAvoid && avoidIds.length >= 5
                  return (
                    <div key={student.id} className="rounded-card border border-slate-200 bg-white p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={resolveProfileImageUrl({ displayName: student.full_name, email: student.email })}
                            alt={student.full_name || 'Student'}
                            className="h-9 w-9 rounded-full border border-slate-200 bg-white object-cover flex-shrink-0"
                            onError={(event) => {
                              event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                              event.currentTarget.onerror = null
                            }}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-800 truncate">{student.full_name}</div>
                            <div className="text-xs text-slate-500 truncate">{student.email || 'No email'} {student.program ? `· ${student.program}` : ''}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className={
                              inWant
                                ? 'px-3 py-1 rounded-full text-xs bg-emerald-600 text-white'
                                : wantDisabled
                                  ? 'px-3 py-1 rounded-full text-xs bg-emerald-100 text-emerald-300 cursor-not-allowed'
                                  : 'px-3 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            }
                            disabled={wantDisabled}
                            onClick={() => setPreference(student.id, 'want')}
                          >
                            Want
                          </button>
                          <button
                            type="button"
                            className={
                              inAvoid
                                ? 'px-3 py-1 rounded-full text-xs bg-rose-600 text-white'
                                : avoidDisabled
                                  ? 'px-3 py-1 rounded-full text-xs bg-rose-100 text-rose-300 cursor-not-allowed'
                                  : 'px-3 py-1 rounded-full text-xs bg-rose-100 text-rose-700 hover:bg-rose-200'
                            }
                            disabled={avoidDisabled}
                            onClick={() => setPreference(student.id, 'avoid')}
                          >
                            Avoid
                          </button>
                          {(inWant || inAvoid) ? (
                            <button
                              type="button"
                              className="px-3 py-1 rounded-full text-xs bg-slate-100 text-slate-600 hover:bg-slate-200"
                              onClick={() => setPreference(student.id, 'none')}
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-heading text-duke-900">Want ({wantIds.length}/5)</div>
                  <div className="text-sm text-slate-500">People you prefer to work with</div>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {wantStudents.length === 0 ? (
                  <div className="text-sm text-slate-400">No students selected.</div>
                ) : (
                  wantStudents.map((student) => (
                    <div key={student.id} className="rounded-card border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={resolveProfileImageUrl({ displayName: student.full_name, email: student.email })}
                            alt={student.full_name || 'Student'}
                            className="h-9 w-9 rounded-full border border-emerald-200 bg-white object-cover flex-shrink-0"
                            onError={(event) => {
                              event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                              event.currentTarget.onerror = null
                            }}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-emerald-900 truncate">{student.full_name}</div>
                            <div className="text-xs text-emerald-700 truncate">{student.email || 'No email'}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="text-xs px-3 py-1 rounded-full bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-100"
                          onClick={() => setPreference(student.id, 'none')}
                        >
                          Remove
                        </button>
                      </div>
                      <div>
                        <div className="text-xs text-emerald-700 mb-1">Comment (optional)</div>
                        <textarea
                          className="input-base text-sm"
                          rows={2}
                          placeholder="Add context for your want preference"
                          value={comments[student.id] || ''}
                          onChange={(event) =>
                            setComments((prev) => ({
                              ...prev,
                              [student.id]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card p-4">
              <div>
                <div className="text-lg font-heading text-duke-900">Avoid ({avoidIds.length}/5)</div>
                <div className="text-sm text-slate-500">People you prefer not to work with</div>
              </div>
              <div className="mt-3 space-y-2">
                {avoidStudents.length === 0 ? (
                  <div className="text-sm text-slate-400">No students selected.</div>
                ) : (
                  avoidStudents.map((student) => (
                    <div key={student.id} className="rounded-card border border-rose-200 bg-rose-50 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={resolveProfileImageUrl({ displayName: student.full_name, email: student.email })}
                            alt={student.full_name || 'Student'}
                            className="h-9 w-9 rounded-full border border-rose-200 bg-white object-cover flex-shrink-0"
                            onError={(event) => {
                              event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                              event.currentTarget.onerror = null
                            }}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-rose-900 truncate">{student.full_name}</div>
                            <div className="text-xs text-rose-700 truncate">{student.email || 'No email'}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="text-xs px-3 py-1 rounded-full bg-white text-rose-700 border border-rose-300 hover:bg-rose-100"
                          onClick={() => setPreference(student.id, 'none')}
                        >
                          Remove
                        </button>
                      </div>
                      <div>
                        <div className="text-xs text-rose-700 mb-1">Reason (optional)</div>
                        <textarea
                          className="input-base text-sm"
                          rows={2}
                          placeholder="Add context for your avoid preference"
                          value={comments[student.id] || ''}
                          onChange={(event) =>
                            setComments((prev) => ({
                              ...prev,
                              [student.id]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
