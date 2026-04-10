import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { getStudents, getTeammateChoices, saveTeammateChoices } from '../api'
import { getUser } from '../auth'
import AppHeader from '../components/AppHeader'
import { DEFAULT_PROFILE_IMAGE_URL, resolveProfileImageUrl } from '../profileImage'

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
  const popupTimerRef = useRef(null)

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
        <AppHeader />
        <div className="card p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-heading text-duke-900">Partners</h1>
              <p className="muted mt-1">Set up to 5 people you want to work with and up to 5 you want to avoid.</p>
              <p className="muted mt-1">Use the class list below and click Want or Avoid for each student. Both lists support optional comments.</p>
            </div>
            <div className="w-full sm:w-auto sm:text-right">
              <div className="flex items-center gap-3 text-xs text-slate-500 sm:justify-end">
                <div>Want {wantIds.length}/5</div>
                <div>Avoid {avoidIds.length}/5</div>
              </div>
              <button type="button" className="btn-primary mt-2 w-full sm:w-auto" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save choices'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6">
          <div className="card p-5 order-2 lg:order-1" id="classmates-section">
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
            <div className="mt-3 space-y-2">
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
                        <div className="flex w-full sm:w-auto items-center gap-2 flex-wrap sm:flex-nowrap">
                          <button
                            type="button"
                            className={
                              inWant
                                ? 'px-3 py-1 rounded-full text-xs bg-emerald-600 text-white flex-1 sm:flex-none text-center'
                                : wantDisabled
                                  ? 'px-3 py-1 rounded-full text-xs bg-emerald-100 text-emerald-300 cursor-not-allowed flex-1 sm:flex-none text-center'
                                  : 'px-3 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex-1 sm:flex-none text-center'
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
                                ? 'px-3 py-1 rounded-full text-xs bg-rose-600 text-white flex-1 sm:flex-none text-center'
                                : avoidDisabled
                                  ? 'px-3 py-1 rounded-full text-xs bg-rose-100 text-rose-300 cursor-not-allowed flex-1 sm:flex-none text-center'
                                  : 'px-3 py-1 rounded-full text-xs bg-rose-100 text-rose-700 hover:bg-rose-200 flex-1 sm:flex-none text-center'
                            }
                            disabled={avoidDisabled}
                            onClick={() => setPreference(student.id, 'avoid')}
                          >
                            Avoid
                          </button>
                          {(inWant || inAvoid) ? (
                            <button
                              type="button"
                              className="px-3 py-1 rounded-full text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 w-full sm:w-auto text-center"
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

          <div className="space-y-4 order-1 lg:order-2 lg:sticky lg:top-4 self-start">
            <div className="card p-3 md:hidden">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick jump</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href="#want-section" className="px-3 py-1.5 rounded-full text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-200">Want comments</a>
                <a href="#avoid-section" className="px-3 py-1.5 rounded-full text-xs bg-rose-100 text-rose-800 hover:bg-rose-200">Avoid comments</a>
                <a href="#classmates-section" className="px-3 py-1.5 rounded-full text-xs bg-slate-100 text-slate-700 hover:bg-slate-200">Class list</a>
              </div>
            </div>

            <div className="card p-4" id="want-section">
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

            <div className="card p-4" id="avoid-section">
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
