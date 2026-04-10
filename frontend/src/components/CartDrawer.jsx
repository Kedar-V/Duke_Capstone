import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { getRankings, getRatings, removeCartItem, saveRankings } from '../api'
import { subscribe } from '../events'
import { getUser } from '../auth'

function RatingPreview({ value = 0 }) {
  const safeValue = Math.max(0, Math.min(10, Number(value) || 0))
  return (
    <div className="mt-1 flex items-center gap-1.5" aria-label={`Rating ${safeValue} out of 10`}>
      <div className="flex items-center gap-0.5 leading-none" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => index + 1).map((n) => (
          <span key={n} className={n <= safeValue ? 'text-amber-400 text-[12px]' : 'text-slate-200 text-[12px]'}>
            ★
          </span>
        ))}
      </div>
      <span className="text-xs text-slate-500">{safeValue > 0 ? `${safeValue}/10` : 'Not rated'}</span>
    </div>
  )
}

function buildRatingMap(rows) {
  const map = {}
  ;(rows || []).forEach((item) => {
    const pid = item?.project_id ?? item?.projectId
    if (pid === undefined || pid === null) return
    map[String(pid)] = Number(item?.rating || 0)
  })
  return map
}

export default function CartDrawer() {
  const navigate = useNavigate()
  const user = getUser()

  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rankingsLocked, setRankingsLocked] = useState(false)
  const [topTen, setTopTen] = useState([])
  const [additional, setAdditional] = useState([])
  const [ratings, setRatings] = useState({})

  function getRatingValue(projectId) {
    return Number(ratings[String(projectId)] || 0)
  }

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [data, ratingRows] = await Promise.all([
        getRankings(),
        getRatings().catch(() => []),
      ])
      setTopTen(data?.top_ten || [])
      setAdditional(data?.additional || [])
      setRankingsLocked(Boolean(data?.is_locked))
      setRatings(buildRatingMap(ratingRows))
    } catch (err) {
      setError(String(err?.message || 'Failed to load selected projects'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = subscribe('toggle_cart_drawer', () => {
      setIsOpen((prev) => {
        const next = !prev
        if (next && user) loadData()
        return next
      })
    })
    return unsub
  }, [user])

  // Also close drawer on route change
  useEffect(() => {
    setIsOpen(false)
  }, [navigate])

  async function persist(nextTop, nextAdd) {
    setSaving(true)
    setError('')
    try {
      await saveRankings({ topTenIds: nextTop.map((item) => item.id) })
      setTopTen(nextTop)
      setAdditional(nextAdd)
    } catch (err) {
      setError(String(err?.message || 'Failed to save ranking order'))
    } finally {
      setSaving(false)
    }
  }

  async function moveRank(index, direction) {
    if (rankingsLocked) return
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= topTen.length) return
    const nextTop = [...topTen]
    const [moved] = nextTop.splice(index, 1)
    nextTop.splice(nextIndex, 0, moved)
    await persist(nextTop, additional)
  }

  async function removeFromTop(index) {
    if (rankingsLocked) return
    const item = topTen[index]
    if (!item) return
    const nextTop = topTen.filter((_, idx) => idx !== index)
    const nextAdd = [item, ...additional]
    await persist(nextTop, nextAdd)
  }

  async function addToTop(itemId) {
    if (rankingsLocked) return
    const item = additional.find((row) => row.id === itemId)
    if (!item) return
    if (getRatingValue(itemId) <= 0) {
      setError('Rate this project first before adding to Top 10.')
      return
    }
    if (topTen.length >= 10) {
      setError('Top 10 is already full.')
      return
    }
    const nextTop = [...topTen, item]
    const nextAdd = additional.filter((row) => row.id !== itemId)
    await persist(nextTop, nextAdd)
  }

  async function removeFromAdditional(itemId) {
    if (rankingsLocked || saving) return
    const item = additional.find((row) => row.id === itemId)
    if (!item) return
    setSaving(true)
    setError('')
    try {
      await removeCartItem(item.id)
      await loadData()
    } catch (err) {
      setError(String(err?.message || 'Failed to remove selected project'))
    } finally {
      setSaving(false)
    }
  }

  function openProject(item) {
    if (!item) return
    setIsOpen(false)
    navigate(`/projects/${encodeURIComponent(item.slug || String(item.id))}`)
  }

  async function handleDragEnd(result) {
    if (rankingsLocked || saving) return
    const { source, destination } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const nextTop = [...topTen]
    const nextAdd = [...additional]

    if (source.droppableId === 'drawer-top' && destination.droppableId === 'drawer-top') {
      const [moved] = nextTop.splice(source.index, 1)
      nextTop.splice(destination.index, 0, moved)
      await persist(nextTop, nextAdd)
      return
    }

    if (source.droppableId === 'drawer-additional' && destination.droppableId === 'drawer-additional') {
      const [moved] = nextAdd.splice(source.index, 1)
      nextAdd.splice(destination.index, 0, moved)
      setAdditional(nextAdd)
      return
    }

    if (source.droppableId === 'drawer-additional' && destination.droppableId === 'drawer-top') {
      if (nextTop.length >= 10) {
        setError('Top 10 is already full.')
        return
      }
      const candidate = nextAdd[source.index]
      if (!candidate) return
      if (getRatingValue(candidate.id) <= 0) {
        setError('Rate this project first before adding to Top 10.')
        return
      }
      const [moved] = nextAdd.splice(source.index, 1)
      nextTop.splice(destination.index, 0, moved)
      await persist(nextTop, nextAdd)
      return
    }

    if (source.droppableId === 'drawer-top' && destination.droppableId === 'drawer-additional') {
      const [moved] = nextTop.splice(source.index, 1)
      nextAdd.splice(destination.index, 0, moved)
      await persist(nextTop, nextAdd)
    }
  }

  if (!user) return null

  return (
    <div
      className={`fixed inset-0 z-50 transition ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!isOpen}
    >
      <div
        className={`absolute inset-0 bg-slate-900/30 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => setIsOpen(false)}
      />
      <aside
        className={`absolute top-0 h-full w-full max-w-2xl bg-white shadow-2xl border-l border-slate-200 transition-[right] duration-300 ${isOpen ? 'right-0' : '-right-full'}`}
      >
        <div className="h-full flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Selected Projects</div>
              <div className="text-lg font-semibold text-duke-900">Rankings</div>
            </div>
            <button type="button" className="btn-secondary" onClick={() => setIsOpen(false)}>Close</button>
          </div>

          {loading ? (
            <div className="p-5 text-sm text-slate-600">Loading selected projects…</div>
          ) : (
            <div className="p-5 space-y-4 overflow-auto flex-1">
              <div className="text-xs text-slate-600">
                {rankingsLocked ? 'Ranking window closed' : `${topTen.length}/10 ranked`}
              </div>
              {error ? <div className="text-sm text-red-700">{error}</div> : null}

              <DragDropContext onDragEnd={handleDragEnd}>
                <section className="rounded-xl border border-slate-200 p-3">
                  <div className="text-sm font-semibold text-duke-900 mb-2">Top 10</div>
                  <Droppable droppableId="drawer-top">
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`space-y-2 min-h-[80px] rounded-lg ${snapshot.isDraggingOver ? 'bg-slate-100/70 p-1' : ''}`}
                      >
                        {topTen.map((item, index) => (
                          <Draggable
                            key={`drawer-top-${item.id}`}
                            draggableId={`drawer-top-${item.id}`}
                            index={index}
                            isDragDisabled={rankingsLocked || saving}
                          >
                            {(providedDraggable, snapshotDraggable) => (
                              <div
                                ref={providedDraggable.innerRef}
                                {...providedDraggable.draggableProps}
                                {...providedDraggable.dragHandleProps}
                                className={`rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${snapshotDraggable.isDragging ? 'shadow-lg ring-2 ring-blue-200' : ''}`}
                                style={providedDraggable.draggableProps.style}
                                role="button"
                                tabIndex={0}
                                onClick={() => openProject(item)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    openProject(item)
                                  }
                                }}
                              >
                                <div>
                                  <div className="text-xs text-slate-500">Rank {index + 1}</div>
                                  <div className="text-sm font-semibold text-duke-900">{item.title}</div>
                                  <div className="text-xs text-slate-500">{item.organization}</div>
                                  <RatingPreview value={getRatingValue(item.id)} />
                                </div>
                                {!rankingsLocked ? (
                                  <div className="flex items-center gap-2 mt-2 sm:mt-0 w-full sm:w-auto shrink-0 border-t border-slate-200 pt-2 sm:border-0 sm:pt-0">
                                    <button type="button" className="btn-secondary !px-2 !py-1 flex-1 sm:flex-none justify-center" onClick={(event) => { event.stopPropagation(); moveRank(index, -1) }} disabled={index === 0 || saving}>↑</button>
                                    <button type="button" className="btn-secondary !px-2 !py-1 flex-1 sm:flex-none justify-center" onClick={(event) => { event.stopPropagation(); moveRank(index, 1) }} disabled={index === topTen.length - 1 || saving}>↓</button>
                                    <button type="button" className="btn-secondary !px-2 !py-1 flex-1 sm:flex-none justify-center text-red-700 sm:text-slate-700" onClick={(event) => { event.stopPropagation(); removeFromTop(index) }} disabled={saving}>Remove</button>
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {topTen.length === 0 ? (
                          <div className="text-sm text-slate-500">No projects ranked yet.</div>
                        ) : null}
                      </div>
                    )}
                  </Droppable>
                </section>

                <section className="rounded-xl border border-slate-200 p-3">
                  <div className="text-sm font-semibold text-duke-900 mb-2">Unranked selected projects</div>
                  <Droppable droppableId="drawer-additional">
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`space-y-2 max-h-[260px] overflow-auto min-h-[80px] rounded-lg ${snapshot.isDraggingOver ? 'bg-slate-100/70 p-1' : ''}`}
                      >
                        {additional.map((item, index) => (
                          <Draggable
                            key={`drawer-additional-${item.id}`}
                            draggableId={`drawer-additional-${item.id}`}
                            index={index}
                            isDragDisabled={rankingsLocked || saving}
                          >
                            {(providedDraggable, snapshotDraggable) => (
                              <div
                                ref={providedDraggable.innerRef}
                                {...providedDraggable.draggableProps}
                                {...providedDraggable.dragHandleProps}
                                className={`rounded-lg border border-slate-200 px-3 py-2 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${snapshotDraggable.isDragging ? 'shadow-lg ring-2 ring-blue-200' : ''}`}
                                style={providedDraggable.draggableProps.style}
                                role="button"
                                tabIndex={0}
                                onClick={() => openProject(item)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    openProject(item)
                                  }
                                }}
                              >
                                <div>
                                  <div className="text-sm font-semibold text-duke-900">{item.title}</div>
                                  <div className="text-xs text-slate-500">{item.organization}</div>
                                  <RatingPreview value={getRatingValue(item.id)} />
                                </div>
                                {!rankingsLocked ? (
                                  <div className="w-full sm:w-auto mt-2 sm:mt-0 flex items-center gap-2">
                                    <button
                                      type="button"
                                      className="btn-secondary flex-1 sm:flex-none justify-center"
                                      onClick={(event) => { event.stopPropagation(); addToTop(item.id) }}
                                      disabled={saving || getRatingValue(item.id) <= 0}
                                      title={getRatingValue(item.id) <= 0 ? 'Rate this project first' : 'Add to Top 10'}
                                    >
                                      Add
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-secondary flex-1 sm:flex-none justify-center text-red-700 sm:text-slate-700"
                                      onClick={(event) => { event.stopPropagation(); removeFromAdditional(item.id) }}
                                      disabled={saving}
                                      title="Remove from selected projects"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {additional.length === 0 ? (
                          <div className="text-sm text-slate-500">No additional selected projects.</div>
                        ) : null}
                      </div>
                    )}
                  </Droppable>
                </section>
              </DragDropContext>
            </div>
          )}

          <div className="px-5 py-4 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2 bg-slate-50">
            {!rankingsLocked ? (
              <span className="text-xs text-slate-500">
                Changes auto-save until the ranking window closes.
              </span>
            ) : (
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">Locked</span>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
