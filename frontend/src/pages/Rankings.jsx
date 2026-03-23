import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRankings, getRatings, removeCartItem, saveRankings } from '../api'
import footerBadge from '../assets/footer-badge.svg'
import midsLogo from '../assets/mids-logo-white-bg.svg'

export default function RankingsPage() {
  const navigate = useNavigate()
  const [additionalSelections, setAdditionalSelections] = useState([])
  const [topTen, setTopTen] = useState([])
  const [dragItem, setDragItem] = useState(null)
  const [topDropIndex, setTopDropIndex] = useState(null)
  const [dragEnabled, setDragEnabled] = useState(true)
  const [topTenHidden, setTopTenHidden] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [popup, setPopup] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [ratings, setRatings] = useState({})
  const popupTimerRef = useRef(null)

  useEffect(() => {
    refreshRankings()
  }, [])

  useEffect(() => {
    return () => {
      if (popupTimerRef.current) {
        clearTimeout(popupTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia('(pointer: coarse)')
    const updateDragAvailability = () => {
      setDragEnabled(!mediaQuery.matches)
    }

    updateDragAvailability()
    mediaQuery.addEventListener('change', updateDragAvailability)
    return () => mediaQuery.removeEventListener('change', updateDragAvailability)
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

  async function refreshRankings() {
    try {
      const [data, ratingRows] = await Promise.all([
        getRankings(),
        getRatings().catch(() => []),
      ])

      const nextRatings = {}
      ;(ratingRows || []).forEach((row) => {
        nextRatings[row.project_id] = row.rating
      })
      setRatings(nextRatings)

      const additional = data.additional ?? []
      const ranked = data.top_ten ?? []
      if (ranked.length === 0 && additional.length > 0) {
        setTopTen(additional.slice(0, 10))
        setAdditionalSelections(additional.slice(10))
      } else {
        setAdditionalSelections(additional)
        setTopTen(ranked)
      }
    } catch {
      setAdditionalSelections([])
      setTopTen([])
      setRatings({})
    }
  }

  function ratingText(projectId) {
    const value = ratings?.[projectId]
    return value ? `${value}/10` : '—/10'
  }

  function ratingValue(projectId) {
    const value = Number(ratings?.[projectId] || 0)
    return Number.isFinite(value) ? value : 0
  }

  function RatingRow({ projectId }) {
    const value = ratingValue(projectId)
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="sr-only">Rating {value ? `${value}/10` : 'unrated'}</span>
        <div className="flex items-center gap-0.5 leading-none" aria-hidden="true">
          {Array.from({ length: 10 }, (_, index) => index + 1).map((n) => (
            <span
              key={n}
              className={n <= value ? 'text-amber-400' : 'text-slate-200'}
            >
              ★
            </span>
          ))}
        </div>
        <div>{ratingText(projectId)}</div>
      </div>
    )
  }

  async function handleSubmit() {
    if (topTen.length !== 10) {
      showPopup('error', 'You must rank 10 projects before submitting.')
      return
    }
    setSubmitting(true)
    try {
      await saveRankings({ topTenIds: topTen.map((item) => item.id) })
      showPopup('success', 'Submitted rankings.')
      await refreshRankings()
    } catch (err) {
      showPopup('error', String(err?.message || 'Submit failed'))
    } finally {
      setSubmitting(false)
    }
  }

  function onDragStart(event, listName, index) {
    if (!dragEnabled) return
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', `${listName}:${index}`)
    }
    setDragItem({ listName, index })
  }

  function onDrop(event, listName, index) {
    event.preventDefault()
    event.stopPropagation()
    if (!dragItem) return

    if (listName === 'top' && dragItem.listName === 'additional' && topTen.length >= 10) {
      setDragItem(null)
      showPopup('error', 'Top 10 is already full.')
      return
    }

    if (dragItem.listName === listName) {
      if (listName === 'top' && typeof index === 'number' && index !== dragItem.index) {
        const nextTop = [...topTen]
        const temp = nextTop[dragItem.index]
        nextTop[dragItem.index] = nextTop[index]
        nextTop[index] = temp
        setTopTen(nextTop)
        setDragItem(null)
        return
      }

      const list = listName === 'top' ? [...topTen] : [...additionalSelections]
      const [moved] = list.splice(dragItem.index, 1)
      const insertIndex = index ?? list.length
      list.splice(insertIndex, 0, moved)
      if (listName === 'top') {
        setTopTen(list)
      } else {
        setAdditionalSelections(list)
      }
      setDragItem(null)
      setTopDropIndex(null)
      return
    }

    const fromList = dragItem.listName === 'top' ? [...topTen] : [...additionalSelections]
    const [moved] = fromList.splice(dragItem.index, 1)
    const toList = listName === 'top' ? [...topTen] : [...additionalSelections]
    const insertIndex = index ?? toList.length
    toList.splice(insertIndex, 0, moved)

    if (dragItem.listName === 'top') {
      setTopTen(fromList)
    } else {
      setAdditionalSelections(fromList)
    }

    if (listName === 'top') {
      setTopTen(toList)
    } else {
      setAdditionalSelections(toList)
    }

    setDragItem(null)
    setTopDropIndex(null)
  }

  async function removeFromAdditional(index) {
    const item = additionalSelections[index]
    if (!item) return
    await removeCartItem(item.id)
    await refreshRankings()
  }

  async function removeFromTop(index) {
    const item = topTen[index]
    if (!item) return
    await removeCartItem(item.id)
    await refreshRankings()
  }

  return (
    <div className={`min-h-screen bg-slate-50 ${topTenHidden ? 'pb-24' : 'pb-72'}`}>
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
            onClick={(e) => e.stopPropagation()}
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
      <div className="max-w-6xl mx-auto px-4 py-10 pb-16 space-y-6">
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
        <div>
          <h1 className="text-3xl font-heading text-duke-900">Capstone Project Ranking</h1>
          <p className="muted mt-2">Reorder your selected projects to finalize your ranking.</p>
        </div>

        <div className="card p-6 ">
          <div className="text-duke-900 font-semibold">Additional selections (not ranked yet)</div>
          <div className="muted mt-1">Drag into the top bar to include in your top 10.</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {additionalSelections.map((item, index) => (
              <div
                key={item.id}
                className={`card p-4 ${dragEnabled ? 'cursor-grab active:cursor-grabbing' : ''}`}
                role="button"
                tabIndex={0}
                aria-disabled="false"
                draggable={dragEnabled}
                onDragStart={(event) => onDragStart(event, 'additional', index)}
                onDragEnd={() => {
                  setDragItem(null)
                  setTopDropIndex(null)
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDrop(event, 'additional', index)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <RatingRow projectId={item.id} />
                    <div className="text-sm font-semibold text-duke-900">{item.title}</div>
                    <div className="text-xs text-slate-500">{item.organization}</div>
                  </div>
                  <button
                    type="button"
                    className="text-sm text-red-600 hover:text-red-700"
                    onClick={() => removeFromAdditional(index)}
                  >
                    Remove
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {(item.tags ?? []).map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center pt-2">
          <img src={footerBadge} alt="© Designed by Kedar Vaidya (Mids 2027)" className="h-7 w-auto" />
        </div>

        {!topTenHidden ? <div className="h-80 md:h-72" aria-hidden="true" /> : null}
      </div>

      {topTenHidden ? (
        <button
          type="button"
          className="fixed bottom-4 right-4 z-40 btn-secondary shadow-sm"
          onClick={() => setTopTenHidden(false)}
        >
          Show Top 10
        </button>
      ) : null}

      <section
        className={`${topTenHidden ? 'hidden' : 'fixed'} bottom-0 left-0 right-0 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.08)] border-t border-slate-200`}
      >
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-heading text-duke-900">Your Top 10 Choices (Ranked)</h3>
            <div className="flex items-center gap-3">
              <div className="text-sm text-slate-500">{topTen.length}/10 ranked</div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setTopTenHidden(true)}
              >
                Hide
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
          {dragItem ? (
            <div className="mt-2 text-xs text-duke-700">
              Drop on a ranked card to swap positions, or drop in empty space to place at the end.
            </div>
          ) : null}
          <div
            className="mt-3 flex items-center gap-3 overflow-x-auto pb-2"
            onDragOver={(event) => {
              event.preventDefault()
              if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
              setTopDropIndex(null)
            }}
            onDrop={(event) => onDrop(event, 'top', undefined)}
          >
            {topTen.map((item, index) => (
              <div
                key={item.id}
                className={`w-[220px] shrink-0 rounded-xl bg-white border border-slate-200 p-3 ${dragEnabled ? 'cursor-grab active:cursor-grabbing' : ''} ${topDropIndex === index ? 'ring-2 ring-duke-500 border-duke-500 bg-duke-50/30' : ''}`}
                role="button"
                tabIndex={0}
                aria-disabled="false"
                draggable={dragEnabled}
                onDragStart={(event) => onDragStart(event, 'top', index)}
                onDragEnd={() => {
                  setDragItem(null)
                  setTopDropIndex(null)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
                  setTopDropIndex(index)
                }}
                onDrop={(event) => onDrop(event, 'top', index)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-duke-700">#{index + 1}</div>
                    <div className="mt-1">
                      <RatingRow projectId={item.id} />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-500"
                    aria-label="Remove from top ten"
                    onClick={() => removeFromTop(index)}
                  >
                    ✕
                  </button>
                </div>
                <div className="text-sm font-semibold text-duke-900 mt-2">{item.title}</div>
                <div className="text-xs text-slate-500 mt-1">{item.organization}</div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {(item.tags ?? []).map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
