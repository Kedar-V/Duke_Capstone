import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { getRankings, getRatings, removeCartItem, saveRankings } from '../api'
import { clearAuth, getUser } from '../auth'
import midsLogo from '../assets/mids-logo-white-bg.svg'
import { DEFAULT_PROFILE_IMAGE_URL, initialsForPerson, resolveProfileImageUrl } from '../profileImage'

export default function RankingsPage() {
  const navigate = useNavigate()
  const user = getUser()
  const [additionalSelections, setAdditionalSelections] = useState([])
  const [topTen, setTopTen] = useState([])
  const [popup, setPopup] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [ratings, setRatings] = useState({})
  const [hasLoaded, setHasLoaded] = useState(false)
  const [autoSaveState, setAutoSaveState] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [submittedAt, setSubmittedAt] = useState(null)
  const [isLocked, setIsLocked] = useState(false)
  const [editableUntil, setEditableUntil] = useState(null)
  const [accountAvatarFailed, setAccountAvatarFailed] = useState(false)
  const popupTimerRef = useRef(null)
  const autoSaveTimerRef = useRef(null)

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
    refreshRankings()
  }, [])

  useEffect(() => {
    return () => {
      if (popupTimerRef.current) {
        clearTimeout(popupTimerRef.current)
      }
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!hasLoaded) return
    if (isLocked) return

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    setAutoSaveState('Saving...')
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        await saveRankings({ topTenIds: topTen.map((item) => item.id) })
        setAutoSaveState('Saved')
        setTimeout(() => setAutoSaveState(''), 1200)
      } catch (err) {
        setAutoSaveState('Save failed')
      }
    }, 450)
  }, [topTen, hasLoaded, isLocked])

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
      setAdditionalSelections(additional)
      setTopTen(ranked)
      setIsSubmitted(Boolean(data.is_submitted))
      setSubmittedAt(data.submitted_at || null)
      setIsLocked(Boolean(data.is_locked))
      setEditableUntil(data.editable_until || null)
      setHasLoaded(true)
    } catch (err) {
      setAdditionalSelections([])
      setTopTen([])
      setRatings({})
      setIsSubmitted(false)
      setSubmittedAt(null)
      setIsLocked(false)
      setEditableUntil(null)
      setHasLoaded(true)
      showPopup('error', String(err?.message || 'Failed to load rankings data'))
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

  function hasRating(projectId) {
    return ratingValue(projectId) > 0
  }

  function RatingRow({ projectId }) {
    const value = ratingValue(projectId)
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
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

  const handleDragEnd = (result) => {
    if (isLocked) return
    const { source, destination } = result

    if (!destination) {
      return
    }

    const isTopSlot = (id) => id.startsWith('top-slot-')
    const topSlotIndex = (id) => Number(id.replace('top-slot-', ''))

    const sourceIsTopSlot = isTopSlot(source.droppableId)
    const destinationIsTopSlot = isTopSlot(destination.droppableId)

    if (sourceIsTopSlot || destinationIsTopSlot) {
      const sourceTopIndex = sourceIsTopSlot ? topSlotIndex(source.droppableId) : -1
      const destinationTopIndex = destinationIsTopSlot ? topSlotIndex(destination.droppableId) : -1

      if (
        sourceIsTopSlot &&
        destinationIsTopSlot &&
        sourceTopIndex === destinationTopIndex
      ) {
        return
      }

      // Move/reorder inside Top 10 with explicit target rank slots.
      if (sourceIsTopSlot && destinationIsTopSlot) {
        const moving = topTen[sourceTopIndex]
        if (!moving) return
        const nextTop = Array.from(topTen)
        nextTop.splice(sourceTopIndex, 1)
        nextTop.splice(destinationTopIndex, 0, moving)
        setTopTen(nextTop.slice(0, 10))
        return
      }

      // Add from Unranked into an exact Top 10 rank slot.
      if (source.droppableId === 'additional' && destinationIsTopSlot) {
        if (topTen.length >= 10) {
          showPopup('error', 'Top 10 is already full.')
          return
        }
        const sourceList = Array.from(additionalSelections)
        const candidate = sourceList[source.index]
        if (!candidate) return
        if (!hasRating(candidate.id)) {
          showPopup('error', 'Rate this project before adding it to your Top 10.')
          return
        }
        const [movedItem] = sourceList.splice(source.index, 1)
        const nextTop = Array.from(topTen)
        nextTop.splice(destinationTopIndex, 0, movedItem)
        setAdditionalSelections(sourceList)
        setTopTen(nextTop.slice(0, 10))
        return
      }

      // Move from Top 10 slot back to Unranked list.
      if (sourceIsTopSlot && destination.droppableId === 'additional') {
        const moving = topTen[sourceTopIndex]
        if (!moving) return
        const nextTop = Array.from(topTen)
        nextTop.splice(sourceTopIndex, 1)
        const nextAdditional = Array.from(additionalSelections)
        nextAdditional.splice(destination.index, 0, moving)
        setTopTen(nextTop)
        setAdditionalSelections(nextAdditional)
        return
      }
    }

    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return
    }

    if (source.droppableId === destination.droppableId) {
      const isTop = source.droppableId === 'top'
      const items = Array.from(isTop ? topTen : additionalSelections)
      const [reorderedItem] = items.splice(source.index, 1)
      items.splice(destination.index, 0, reorderedItem)

      if (isTop) {
        setTopTen(items)
      } else {
        setAdditionalSelections(items)
      }
      return
    }

    const sourceList = source.droppableId === 'top' ? Array.from(topTen) : Array.from(additionalSelections)
    const destinationList = destination.droppableId === 'top' ? Array.from(topTen) : Array.from(additionalSelections)

    if (destination.droppableId === 'top' && topTen.length >= 10) {
      showPopup('error', 'Top 10 is already full.')
      return
    }

    const candidate = sourceList[source.index]
    if (destination.droppableId === 'top' && candidate && !hasRating(candidate.id)) {
      showPopup('error', 'Rate this project before adding it to your Top 10.')
      return
    }

    const [movedItem] = sourceList.splice(source.index, 1)
    destinationList.splice(destination.index, 0, movedItem)

    if (source.droppableId === 'top') {
      setTopTen(sourceList)
      setAdditionalSelections(destinationList)
    } else {
      setAdditionalSelections(sourceList)
      setTopTen(destinationList)
    }
  }

  async function removeFromAdditional(projectId) {
    if (isLocked) return
    const item = additionalSelections.find((entry) => entry.id === projectId)
    if (!item) return
    await removeCartItem(item.id)
    await refreshRankings()
  }

  function addToTop(projectId) {
    if (isLocked) return
    const item = additionalSelections.find((entry) => entry.id === projectId)
    if (!item) return
    if (!hasRating(item.id)) {
      showPopup('error', 'Rate this project before adding it to your Top 10.')
      return
    }
    if (topTen.length >= 10) {
      showPopup('error', 'Top 10 is already full.')
      return
    }
    setAdditionalSelections(additionalSelections.filter((entry) => entry.id !== projectId))
    setTopTen([...topTen, item])
  }

  function sendToBench(index) {
    if (isLocked) return
    const item = topTen[index]
    if (!item) return
    setTopTen(topTen.filter((_, i) => i !== index))
    setAdditionalSelections([item, ...additionalSelections])
  }

  async function removeFromTop(index) {
    if (isLocked) return
    const item = topTen[index]
    if (!item) return
    await removeCartItem(item.id)
    await refreshRankings()
  }

  const progressPercent = Math.min(100, Math.round((topTen.length / 10) * 100))
  const remainingToRank = Math.max(0, 10 - topTen.length)
  const unratedAdditionalCount = (additionalSelections || []).filter((item) => !hasRating(item.id)).length
  const isComplete = topTen.length === 10

  const filteredAdditionalSelections = additionalSelections || []
  const hasUnrankedItems = filteredAdditionalSelections.length > 0

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
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
                  const isActive = label === 'Rankings'
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
        <header className="card p-6 mb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="pill">Rankings</div>
              <h1 className="text-xl font-semibold text-duke-900">Capstone Project Ranking</h1>
              <p className="muted mt-2">
                Step 1: move projects from Unranked to Top 10. Step 2: reorder Top 10 by priority. Rankings auto-save until the edit window closes.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium">
                {topTen.length}/10 ranked
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                {isSubmitted
                  ? `Submitted${submittedAt ? ` ${new Date(submittedAt).toLocaleDateString()}` : ''}`
                  : isLocked
                    ? 'Locked'
                    : autoSaveState || 'Editing'}
              </span>
            </div>
          </div>
          {editableUntil ? (
            <div className="mt-2 text-xs text-slate-500">Editable until {new Date(editableUntil).toLocaleString()}</div>
          ) : null}
          <div className="rankings-progress" role="progressbar" aria-valuenow={topTen.length} aria-valuemin={0} aria-valuemax={10}>
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </header>

        <div className="sticky top-2 z-30 rankings-fade-in">
          <div className="card px-4 py-3 border-duke-200 bg-white/95 backdrop-blur">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-700">
                <span className="font-semibold text-duke-900">Ranking progress:</span>{' '}
                {isLocked
                  ? 'Ranking window closed'
                  : isComplete
                    ? 'Top 10 complete'
                    : `${remainingToRank} more project(s) needed in Top 10`}
              </div>
              {!isLocked ? (
                <span className="text-xs text-slate-500">{autoSaveState || 'Autosave active'}</span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  Locked
                </span>
              )}
            </div>
          </div>
        </div>

        <section className="card px-4 py-3 mb-4 rankings-fade-in">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full border px-2.5 py-1 font-medium ${remainingToRank === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
              Top 10: {remainingToRank === 0 ? 'Complete' : `${remainingToRank} left`}
            </span>
            <span className={`rounded-full border px-2.5 py-1 font-medium ${unratedAdditionalCount === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
              Ratings: {unratedAdditionalCount === 0 ? 'Done' : `${unratedAdditionalCount} unrated`}
            </span>
            <span className={`rounded-full border px-2.5 py-1 font-medium ${isComplete || isLocked ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
              Top 10: {isLocked ? 'Locked' : isComplete ? 'Complete' : 'In progress'}
            </span>
            <span className="text-slate-500">
              {isLocked ? 'Ranking window closed.' : 'Drag cards between Step 1 and Step 2.'}
            </span>
          </div>
        </section>

        <DragDropContext onDragEnd={handleDragEnd}>
          <div className={`grid gap-6 items-start ${hasUnrankedItems ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
            <section className={`card ${hasUnrankedItems ? 'p-6' : 'p-4'}`}>
              <div className="flex items-center justify-between pointer-events-none mb-3">
                <div>
                  <div className="text-lg font-semibold text-duke-900">Step 1: Unranked</div>
                  <div className="text-xs text-slate-500">
                    {hasUnrankedItems
                      ? 'Projects in your cart not yet added to Top 10.'
                      : 'No unranked projects right now. Move one from Top 10 back here if needed.'}
                  </div>
                </div>
                <div className="text-xs text-slate-400">{filteredAdditionalSelections.length} items</div>
              </div>

              <Droppable droppableId="additional">
                {(provided, snapshot) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className={`rankings-list transition-colors rounded-xl ${
                      snapshot.isDraggingOver ? 'bg-slate-50' : ''
                    } ${hasUnrankedItems ? 'min-h-[320px]' : 'min-h-[96px]'}`}
                  >
                    {filteredAdditionalSelections.map((item, index) => (
                      <Draggable
                        key={String(item.id)}
                        draggableId={String(`additional-${item.id}`)}
                        index={index}
                        isDragDisabled={isLocked}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            onClick={() => navigate(`/projects/${encodeURIComponent(item.slug || String(item.id))}`)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === "Enter") navigate(`/projects/${encodeURIComponent(item.slug || String(item.id))}`) }}
                            className={`rankings-card hover:border-duke-300 hover:shadow-md transition-shadow ${
                              snapshot.isDragging ? 'shadow-lg border-blue-300 ring-2 ring-blue-500/20 z-50 ' : ''
                            }`}
                            style={{
                              ...provided.draggableProps.style,
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <RatingRow projectId={item.id} />
                                <div className="text-sm font-semibold text-duke-900">{item.title}</div>
                                <div className="text-xs text-slate-500">{item.organization}</div>
                                {!hasRating(item.id) ? (
                                  <div className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                    Rate this project before adding to Top 10
                                  </div>
                                ) : null}
                              </div>
                              {!isLocked ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={!hasRating(item.id)}
                                    title={!hasRating(item.id) ? 'Rate this project first' : 'Add to Top 10'}
                                    className={`text-xs ${
                                      hasRating(item.id)
                                        ? 'text-slate-500 hover:text-slate-700'
                                        : 'text-slate-300 cursor-not-allowed'
                                    }`}
                                    onClick={(e) => { e.stopPropagation(); addToTop(item.id) }}
                                  >
                                    Add
                                  </button>
                                  <button
                                    type="button"
                                    className="text-sm text-red-600 hover:text-red-700"
                                    onClick={(e) => { e.stopPropagation(); removeFromAdditional(item.id) }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2 mt-3">
                              {(item.tags ?? []).map((tag) => (
                                <span key={tag} className="tag">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {filteredAdditionalSelections.length === 0 && !snapshot.isDraggingOver && (
                      <div className="text-center p-6 text-sm text-slate-400 md:col-span-2">
                        No unranked items yet.
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </section>

            <section className={`card p-6 ${hasUnrankedItems ? '' : 'lg:col-span-1'}`}>
              <div className="flex items-center justify-between pointer-events-none mb-3">
                <div>
                  <div className="text-lg font-semibold text-duke-900">Step 2: Your Top 10</div>
                  <div className="text-xs text-slate-500">Order from most preferred (#1) to least preferred (#10).</div>
                </div>
                <div className="text-xs text-slate-400">{topTen.length}/10</div>
              </div>

              <div className="rankings-list min-h-[320px] transition-colors rounded-xl">
                {Array.from({ length: 10 }, (_, index) => {
                  const item = topTen[index]
                  return (
                    <Droppable key={`top-slot-${index}`} droppableId={`top-slot-${index}`}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`rounded-xl min-h-[88px] ${snapshot.isDraggingOver ? 'bg-slate-50' : ''}`}
                        >
                          {item ? (
                            <Draggable
                              key={String(item.id)}
                              draggableId={String(item.id)}
                              index={0}
                              isDragDisabled={isLocked}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  onClick={() => navigate(`/projects/${encodeURIComponent(item.slug || String(item.id))}`)}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => { if (e.key === "Enter") navigate(`/projects/${encodeURIComponent(item.slug || String(item.id))}`) }}
                                  className={`rankings-card hover:border-duke-300 hover:shadow-md transition-shadow ${
                                    snapshot.isDragging ? 'shadow-lg border-blue-300 ring-2 ring-blue-500/20 z-50 ' : ''
                                  }`}
                                  style={{
                                    ...provided.draggableProps.style,
                                  }}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <div className="rankings-rank text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Rank {index + 1}</div>
                                      <RatingRow projectId={item.id} />
                                    </div>
                                    {!isLocked ? (
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          className="text-xs text-slate-500 hover:text-slate-700"
                                          onClick={(e) => { e.stopPropagation(); sendToBench(index) }}
                                        >
                                          Move
                                        </button>
                                        <button
                                          type="button"
                                          className="text-slate-400 hover:text-red-500"
                                          aria-label="Remove from top ten"
                                          onClick={(e) => { e.stopPropagation(); removeFromTop(index) }}
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ) : null}
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
                              )}
                            </Draggable>
                          ) : (
                            <div className="rankings-placeholder border border-dashed border-slate-300 rounded-xl p-4 text-center text-slate-500 bg-slate-50">
                              <div className="rankings-rank mx-auto">#{index + 1}</div>
                              <div className="text-sm">Drop here</div>
                            </div>
                          )}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  )
                })}
              </div>
            </section>
          </div>
        </DragDropContext>
      </div>
    </div>
  )
}
