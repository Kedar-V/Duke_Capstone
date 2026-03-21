import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { getStudents, getTeammateChoices, saveTeammateChoices } from '../api'
import { getUser } from '../auth'
import footerBadge from '../assets/footer-badge.svg'
import midsLogo from '../assets/mids-logo-white-bg.svg'

function SectionCard({ title, subtitle, children, onDrop, onDragOver }) {
  return (
    <div className="card p-4 space-y-3">
      <div>
        <h2 className="text-lg font-heading text-duke-900">{title}</h2>
        <p className="muted mt-1">{subtitle}</p>
      </div>
      <div
        className="min-h-[88px] flex gap-3 overflow-x-auto rounded-card border border-slate-200 bg-white px-3 py-3"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {children}
      </div>
    </div>
  )
}

export default function PartnersPage() {
  const navigate = useNavigate()
  const user = getUser()

  const [students, setStudents] = useState([])
  const [wantIds, setWantIds] = useState([])
  const [avoidIds, setAvoidIds] = useState([])
  const [comments, setComments] = useState({})
  const [selectedId, setSelectedId] = useState('')
  const [saving, setSaving] = useState(false)
  const [popup, setPopup] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const popupTimerRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [s, choices] = await Promise.all([getStudents(), getTeammateChoices()])
      if (cancelled) return
      setStudents(s)
      setWantIds(choices.want_ids || [])
      setAvoidIds(choices.avoid_ids || [])
      setComments(choices.comments || choices.avoid_reasons || {})
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

  const available = useMemo(() => {
    const taken = new Set([...wantIds, ...avoidIds])
    return students.filter((s) => !taken.has(s.id))
  }, [students, wantIds, avoidIds])

  function handleAdd(target) {
    if (!selectedId) return
    const id = Number(selectedId)
    if (target === 'want') {
      if (wantIds.length >= 5 || wantIds.includes(id) || avoidIds.includes(id)) return
      setWantIds([...wantIds, id])
      setComments({ ...comments, [id]: comments[id] || '' })
    } else {
      if (avoidIds.length >= 5 || avoidIds.includes(id) || wantIds.includes(id)) return
      setAvoidIds([...avoidIds, id])
      setComments({ ...comments, [id]: comments[id] || '' })
    }
    setSelectedId('')
  }

  function handleRemove(target, id) {
    if (target === 'want') setWantIds(wantIds.filter((x) => x !== id))
    if (target === 'avoid') {
      setAvoidIds(avoidIds.filter((x) => x !== id))
      const next = { ...comments }
      delete next[id]
      setComments(next)
    }
    if (target === 'want') {
      const next = { ...comments }
      delete next[id]
      setComments(next)
    }
  }

  function onDragStart(id) {
    setDragId(id)
  }

  function onDrop(target) {
    if (!dragId) return
    const id = dragId
    setDragId(null)

    if (target === 'want') {
      if (wantIds.length >= 5 || wantIds.includes(id) || avoidIds.includes(id)) return
      setWantIds([...wantIds.filter((x) => x !== id), id])
      setAvoidIds(avoidIds.filter((x) => x !== id))
    }

    if (target === 'avoid') {
      if (avoidIds.length >= 5 || avoidIds.includes(id) || wantIds.includes(id)) return
      setAvoidIds([...avoidIds.filter((x) => x !== id), id])
      setWantIds(wantIds.filter((x) => x !== id))
    }
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
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
                    {['Teammate Choices', 'Projects', 'Rankings'].map((label) => (
                      <button
                        key={label}
                        type="button"
                        className="w-full text-left px-3 py-2 rounded-card text-sm text-slate-700 hover:bg-slate-100"
                        onClick={() => {
                          setMenuOpen(false)
                          if (label === 'Teammate Choices') navigate('/partners')
                          if (label === 'Projects') navigate('/projects')
                          if (label === 'Rankings') navigate('/rankings')
                        }}
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
          </div>
        </div>
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-heading text-duke-900">Teammate Choices</h1>
              <p className="muted mt-1">Choose up to 5 teammates you prefer and 5 you want to avoid</p>
              <p className="muted mt-1">If you do not have anyone in mind, kindly leave this section blank.</p>
            </div>
            {/* <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('/projects')}
            >
              Back to projects
            </button> */}
          </div>
        </div>

        <div className="card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <div className="label">Select a student</div>
              <select
                className="select-base w-full"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                <option value="">Choose a student</option>
                {available.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} · {s.program}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 md:self-end">
              <button type="button" className="btn-secondary" onClick={() => handleAdd('want')}>
                Add to Want ({wantIds.length}/5)
              </button>
              <button type="button" className="btn-secondary" onClick={() => handleAdd('avoid')}>
                Add to Don’t Want ({avoidIds.length}/5)
              </button>
            </div>
            <button type="button" className="btn-primary md:self-end" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save choices'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <SectionCard
            title="Teammate Choices"
            subtitle="Add people you want to work with here"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop('want')}
          >
            {wantIds.length === 0 ? (
              <div className="text-sm text-slate-400">No teammates selected yet.</div>
            ) : (
              wantIds.map((id) => {
                const student = studentsById.get(id)
                if (!student) return null
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={() => onDragStart(id)}
                    className="min-w-[200px] rounded-card border border-duke-200 bg-duke-50 px-3 py-2 text-sm text-duke-900 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium">{student.full_name}</div>
                      <div className="text-xs text-duke-700">{student.program}</div>
                      <textarea
                        className="input-base mt-2 text-xs"
                        rows={2}
                        placeholder="Comment (optional)"
                        value={comments[id] || ''}
                        onChange={(event) =>
                          setComments({
                            ...comments,
                            [id]: event.target.value,
                          })
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className="text-duke-700"
                      onClick={() => handleRemove('want', id)}
                    >
                      ✕
                    </button>
                  </div>
                )
              })
            )}
          </SectionCard>

          <SectionCard
            title="Don’t Work With"
            subtitle="Add people you dont want to work with here"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop('avoid')}
          >
            {avoidIds.length === 0 ? (
              <div className="text-sm text-slate-400">No students listed yet.</div>
            ) : (
              avoidIds.map((id) => {
                const student = studentsById.get(id)
                if (!student) return null
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={() => onDragStart(id)}
                    className="min-w-[200px] rounded-card border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium">{student.full_name}</div>
                      <div className="text-xs text-rose-700">{student.program}</div>
                      <textarea
                        className="input-base mt-2 text-xs"
                        rows={2}
                        placeholder="Comment (optional)"
                        value={comments[id] || ''}
                        onChange={(event) =>
                          setComments({
                            ...comments,
                            [id]: event.target.value,
                          })
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className="text-rose-700"
                      onClick={() => handleRemove('avoid', id)}
                    >
                      ✕
                    </button>
                  </div>
                )
              })
            )}
          </SectionCard>
        </div>

        <div className="flex justify-start pt-2">
          <img src={footerBadge} alt="© Designed by Kedar Vaidya (Mids 2027)" className="h-7 w-auto" />
        </div>
      </div>
    </div>
  )
}
