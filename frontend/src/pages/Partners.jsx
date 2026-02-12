import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { getStudents, getTeammateChoices, saveTeammateChoices } from '../api'
import { getUser } from '../auth'

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
  const [selectedId, setSelectedId] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [dragId, setDragId] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [s, choices] = await Promise.all([getStudents(), getTeammateChoices()])
      if (cancelled) return
      setStudents(s)
      setWantIds(choices.want_ids || [])
      setAvoidIds(choices.avoid_ids || [])
    }

    if (user) load()
    return () => {
      cancelled = true
    }
  }, [user?.id])

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
    } else {
      if (avoidIds.length >= 5 || avoidIds.includes(id) || wantIds.includes(id)) return
      setAvoidIds([...avoidIds, id])
    }
    setSelectedId('')
  }

  function handleRemove(target, id) {
    if (target === 'want') setWantIds(wantIds.filter((x) => x !== id))
    if (target === 'avoid') setAvoidIds(avoidIds.filter((x) => x !== id))
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
    setMessage('')
    try {
      await saveTeammateChoices({ wantIds, avoidIds })
      setMessage('Saved teammate choices.')
    } catch (err) {
      setMessage(String(err?.message || 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-heading text-duke-900">Teammate Choices</h1>
              <p className="muted mt-1">Choose up to 5 teammates you prefer and 5 you want to avoid.</p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('/projects')}
            >
              Back to projects
            </button>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
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
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => handleAdd('want')}>
                Add to Want ({wantIds.length}/5)
              </button>
              <button type="button" className="btn-secondary" onClick={() => handleAdd('avoid')}>
                Add to Don’t Want ({avoidIds.length}/5)
              </button>
            </div>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save choices'}
            </button>
          </div>
          {message ? <div className="mt-3 text-sm text-slate-600">{message}</div> : null}
        </div>

        <div className="grid grid-cols-1 gap-6">
          <SectionCard
            title="Teammate Choices"
            subtitle="Drag and drop students here (max 5)."
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
            subtitle="Drag and drop students here (max 5)."
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
      </div>
    </div>
  )
}
