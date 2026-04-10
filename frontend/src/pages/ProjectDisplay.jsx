import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { layout, prepare } from '@chenglou/pretext'

import {
  addCartItem,
  getCart,
  getMyProjectComments,
  getProjectBySlug,
  getRankings,
  getRatings,
  removeCartItem,
  submitProjectComment,
  saveRating,
} from '../api'
import { getUser } from '../auth'
import AppHeader from '../components/AppHeader'

const DETAIL_TEXT_FONT = "400 16px 'Plus Jakarta Sans'"
const DETAIL_TEXT_LINE_HEIGHT = 26
const DETAIL_COLLAPSED_LINES = 6

function Stars({ rating, onRate, disabled = false }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
        <button
          key={value}
          type="button"
          disabled={disabled}
          className={
            value <= rating
              ? `text-xl transition text-amber-400 drop-shadow-sm ${disabled ? 'cursor-not-allowed opacity-70' : 'hover:scale-110'}`
              : `text-xl transition text-slate-200 ${disabled ? 'cursor-not-allowed opacity-70' : 'hover:scale-110'}`
          }
          aria-label={disabled ? 'Sign in to rate' : `Rate ${value} stars`}
          onClick={() => {
            if (disabled) return
            onRate(value)
          }}
        >
          ★
        </button>
      ))}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="card p-6 md:p-8 transition-shadow duration-200 hover:shadow-md border-t-4 border-t-transparent hover:border-t-duke-700/20">
      <div className="text-xl font-heading font-semibold text-duke-900 mb-5 pb-3 border-b border-slate-100">{title}</div>
      <div className="text-slate-700 min-w-0 space-y-6">{children}</div>
    </div>
  )
}

function Lines({ text }) {
  const value = String(text || '').trim()
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)
  const [collapsedHeightPx, setCollapsedHeightPx] = useState(DETAIL_COLLAPSED_LINES * DETAIL_TEXT_LINE_HEIGHT)
  const containerRef = useRef(null)

  useEffect(() => {
    setExpanded(false)
  }, [value])

  useEffect(() => {
    const containerEl = containerRef.current
    if (!containerEl) return undefined

    const measure = () => {
      const width = containerEl.clientWidth
      if (!width || !value) {
        setCanExpand(false)
        return
      }

      try {
        const prepared = prepare(value, DETAIL_TEXT_FONT, { whiteSpace: 'pre-wrap' })
        const metrics = layout(prepared, width, DETAIL_TEXT_LINE_HEIGHT)
        const lineCount = Number(metrics?.lineCount || 1)
        setCanExpand(lineCount > DETAIL_COLLAPSED_LINES)
        setCollapsedHeightPx(DETAIL_COLLAPSED_LINES * DETAIL_TEXT_LINE_HEIGHT)
      } catch {
        setCanExpand(value.length > 600)
        setCollapsedHeightPx(DETAIL_COLLAPSED_LINES * DETAIL_TEXT_LINE_HEIGHT)
      }
    }

    measure()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => measure())
      observer.observe(containerEl)
      return () => observer.disconnect()
    }

    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [value])

  if (!value) return <div className="muted">—</div>

  return (
    <div>
      <div className="relative">
        <div
          ref={containerRef}
          className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-justify leading-relaxed"
          style={
            !expanded && canExpand
              ? { maxHeight: `${collapsedHeightPx}px`, overflow: 'hidden' }
              : undefined
          }
        >
          {text}
        </div>
        {!expanded && canExpand ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white via-white/90 to-transparent" />
        ) : null}
      </div>
      {canExpand ? (
        <button
          type="button"
          className="mt-2 text-sm font-semibold text-duke-800 hover:text-duke-900"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  )
}

function OrganizationLogo({ logoUrl, organization }) {
  const [failed, setFailed] = useState(false)
  const initials = (organization || '??').slice(0, 2).toUpperCase()

  if (!logoUrl || failed) {
    return (
      <div className="org-logo-frame org-logo-frame-lg bg-slate-100" aria-hidden="true">
        <span className="org-logo-fallback text-lg md:text-xl">{initials}</span>
      </div>
    )
  }

  return (
    <div className="org-logo-frame org-logo-frame-lg" title={`${organization || 'Organization'} logo`}>
      <img
        src={logoUrl}
        alt={`${organization || 'Organization'} logo`}
        className="org-logo-img"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  )
}

export default function ProjectDisplayPage() {
  const navigate = useNavigate()
  const { projectSlug } = useParams()
  const user = getUser()

  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [cart, setCart] = useState({ selected: 0, limit: 10, project_ids: [] })
  const [rating, setRating] = useState(0)
  const [rankingsLocked, setRankingsLocked] = useState(false)
  const [projectComment, setProjectComment] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)
  const [myComments, setMyComments] = useState([])
  const [commentDrawerOpen, setCommentDrawerOpen] = useState(false)
  const [error, setError] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [commentMessage, setCommentMessage] = useState('')
  const [cartAnim, setCartAnim] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const p = await getProjectBySlug(projectSlug)
        if (cancelled) return

        setProject(p)

        if (user) {
          const [c, r, rankings, mine] = await Promise.all([
            getCart(),
            getRatings(),
            getRankings().catch(() => null),
            user.role === 'student'
              ? getMyProjectComments({ projectId: p.id, limit: 20 }).catch(() => [])
              : Promise.resolve([]),
          ])
          if (cancelled) return
          setCart(c)
          const found = (r || []).find((x) => x.project_id === p.id)
          setRating(found?.rating || 0)
          setRankingsLocked(Boolean(rankings?.is_locked))
          setMyComments(Array.isArray(mine) ? mine : [])
        } else {
          setCart({ selected: 0, limit: 10, project_ids: [] })
          setRating(0)
          setRankingsLocked(false)
          setMyComments([])
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load project')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (projectSlug) load()
    return () => {
      cancelled = true
    }
  }, [projectSlug])

  const inCart = useMemo(() => {
    return Boolean(cart?.project_ids?.includes(project?.id))
  }, [cart, project?.id])
  const isArchived = String(project?.project_status || '').toLowerCase() === 'archived'

  useEffect(() => {
    if (!toastMessage) return undefined
    const timer = window.setTimeout(() => setToastMessage(''), 3000)
    return () => window.clearTimeout(timer)
  }, [toastMessage])

  async function handleToggleCart() {
    if (!project?.id) return
    if (!user) {
      navigate('/login')
      return
    }
    if (rankingsLocked) {
      setToastMessage('Ranking window is closed. Project selection is disabled.')
      return
    }
    if (isArchived) {
      setToastMessage('Archived projects are visible but cannot be selected for ranking.')
      return
    }
    if (!inCart && rating <= 0) {
      setToastMessage('Please rate this project before adding it to selected projects.')
      return
    }
    if (!inCart && Number(cart?.selected || 0) >= Number(cart?.limit || 10)) {
      setToastMessage('Not allowed: You can select up to 10 projects.')
      return
    }
    try {
      const animType = inCart ? 'remove' : 'add'
      const updated = inCart
        ? await removeCartItem(project.id)
        : await addCartItem({ projectId: project.id })
      setCart(updated)
      setToastMessage('')
      setCartAnim(animType)
      window.setTimeout(() => setCartAnim(''), 420)
    } catch (err) {
      setToastMessage(String(err?.message || 'Unable to update selected projects.'))
    }
  }

  async function handleRate(value) {
    if (!user) {
      navigate('/login')
      return
    }
    if (rankingsLocked) {
      setToastMessage('Ranking window is closed. Rating changes are disabled.')
      return
    }
    if (isArchived) {
      setToastMessage('Archived projects cannot be rated.')
      return
    }
    if (!project?.id) return
    const previous = Number(rating || 0)
    setRating(value)
    try {
      await saveRating({ projectId: project.id, rating: value })
      setToastMessage('')
    } catch (err) {
      setRating(previous)
      setToastMessage(String(err?.message || 'Unable to save rating.'))
    }
  }

  async function handleSubmitComment() {
    if (!user) {
      navigate('/login')
      return
    }
    const text = (projectComment || '').trim()
    if (!text) {
      setCommentMessage('Comment cannot be empty.')
      return
    }
    if (!project?.id) return

    setCommentSaving(true)
    setCommentMessage('')
    try {
      await submitProjectComment({ projectId: project.id, comment: text })
      const mine = await getMyProjectComments({ projectId: project.id, limit: 20 }).catch(() => [])
      setProjectComment('')
      setMyComments(Array.isArray(mine) ? mine : [])
      setCommentMessage('Comment sent to admins. Only admins can view it.')
    } catch (err) {
      setCommentMessage(String(err?.message || 'Failed to submit comment'))
    } finally {
      setCommentSaving(false)
    }
  }

  function closeDrawers() {
    setCommentDrawerOpen(false)
  }

  const headerTitle = project?.title || projectSlug
  const org = project?.organization || projectSlug

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-6 md:space-y-8">
        <AppHeader />

        {user?.role === 'student' && commentDrawerOpen ? (
          <div className="fixed inset-0 z-40" aria-live="polite">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/30"
              aria-label="Close question drawer"
              onClick={() => setCommentDrawerOpen(false)}
            />
            <aside className="absolute right-0 top-0 h-full w-full max-w-xl border-l border-slate-200 bg-white shadow-2xl p-5 overflow-auto">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Project Questions</div>
                  <div className="text-lg font-heading text-duke-900">Ask Admin About This Project</div>
                  <div className="text-xs text-slate-500 mt-1">Visible only to admins. Not visible to other students.</div>
                </div>
                <button type="button" className="btn-secondary" onClick={() => setCommentDrawerOpen(false)}>
                  Close
                </button>
              </div>

              <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">New Question</div>
                <textarea
                  className="input-base mt-2 h-24"
                  value={projectComment}
                  onChange={(event) => setProjectComment(event.target.value)}
                  placeholder="Share questions, concerns, or clarifications about this project"
                />
                <button
                  type="button"
                  className="btn-primary mt-2 w-full"
                  onClick={handleSubmitComment}
                  disabled={commentSaving}
                >
                  {commentSaving ? 'Sending...' : 'Send Comment'}
                </button>
                {commentMessage ? (
                  <div className="mt-2 text-xs text-slate-600">{commentMessage}</div>
                ) : null}
              </div>

              <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Your Previous Questions</div>
                <div className="mt-2 space-y-2 max-h-[55vh] overflow-auto">
                  {myComments.length ? (
                    myComments.map((item) => {
                      const created = item?.created_at ? new Date(item.created_at) : null
                      const createdText = created && !Number.isNaN(created.getTime())
                        ? created.toLocaleString()
                        : 'Unknown time'
                      const resolved = Boolean(item?.is_resolved)
                      return (
                        <div key={item.id} className="rounded border border-slate-200 bg-white p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[11px] text-slate-500">{createdText}</div>
                            <span
                              className={
                                resolved
                                  ? 'rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700'
                                  : 'rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700'
                              }
                            >
                              {resolved ? 'Resolved' : 'Unresolved'}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-700 whitespace-pre-wrap">{item.comment}</div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-xs text-slate-500">You have not posted a question for this project yet.</div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        ) : null}

        {loading ? (
          <div className="card p-6 text-slate-600">Loading…</div>
        ) : error ? (
          <div className="card p-6 text-red-700">{error}</div>
        ) : (
          <>
            <div className="card p-6 md:p-8 hover:shadow-md transition-shadow duration-200">
              {project?.cover_image_url ? (
                <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                  <img
                    src={project.cover_image_url}
                    alt={`${headerTitle} cover`}
                    className="h-52 w-full object-cover md:h-64"
                    loading="lazy"
                  />
                </div>
              ) : null}
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 xl:gap-8 items-start">
                <div className="space-y-6">
                  <div className="flex items-start gap-4 md:gap-5">
                    <div className="flex-shrink-0 rounded-xl shadow-inner border border-slate-200/60">
                      <OrganizationLogo logoUrl={project?.organization_logo_url} organization={org} />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <h1 className="text-2xl md:text-3xl font-heading text-duke-900 leading-tight">{headerTitle}</h1>
                      {isArchived ? (
                        <div className="mt-2 inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Archived
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5">
                        <span className="font-medium text-slate-700 flex items-center gap-1.5 hover:text-duke-800 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                          {org}
                        </span>
                        {project?.cohort ? (
                          <>
                            <span className="text-slate-300 hidden sm:inline">•</span>
                            <span className="text-sm text-slate-500 flex items-center gap-1.5">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                              Cohort: {project.cohort}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {(project?.technical_domains?.length || project?.required_skills?.length) ? (
                    <div className="pt-5 border-t border-slate-100 space-y-3">
                      {(project?.technical_domains || []).length ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] uppercase tracking-wide font-semibold text-duke-800/80">Domains</span>
                          {(project?.technical_domains || []).map((t) => (
                            <span key={`d-${t}`} className="pill px-3 py-1.5 text-sm shadow-sm">{t}</span>
                          ))}
                        </div>
                      ) : null}
                      {(project?.required_skills || []).length ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Skills</span>
                          {(project?.required_skills || []).slice(0, 12).map((t) => (
                            <span key={`s-${t}`} className="tag px-3 py-1.5 text-sm border border-slate-200/60 shadow-sm bg-white hover:bg-slate-50 transition-colors">{t}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="match-rating-panel rounded-2xl border border-slate-200 bg-slate-50/70 p-4 md:p-5 space-y-4 xl:sticky xl:top-6">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Your Match Rating</div>
                  <div className="flex items-center justify-between gap-3">
                    <Stars rating={rating} onRate={handleRate} disabled={!user || rankingsLocked || isArchived} />
                    <div className={`text-sm font-bold px-2 py-0.5 rounded ${isArchived ? 'bg-slate-200 text-slate-600' : rating >= 7 ? 'bg-green-100 text-green-700' : rating >= 4 ? 'bg-amber-100 text-amber-700' : rating > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                      {!user ? 'Sign in' : isArchived ? 'Archived' : rankingsLocked ? 'Locked' : `${rating || 0}/10`}
                    </div>
                  </div>
                  {!user ? (
                    <div className="text-xs text-slate-500">Sign in to rate and select this project.</div>
                  ) : isArchived ? (
                    <div className="text-xs text-slate-500">Archived projects remain visible but are locked for rating and ranking.</div>
                  ) : rankingsLocked ? (
                    <div className="text-xs text-slate-500">Ranking window is closed. Rating and selection are locked.</div>
                  ) : null}

                  <button
                    type="button"
                    disabled={isArchived || rankingsLocked || (Boolean(user) && !inCart && rating <= 0)}
                    title={!user ? 'Sign in to select projects' : isArchived ? 'Archived projects are not rankable' : rankingsLocked ? 'Ranking window is closed' : !inCart && rating <= 0 ? 'Rate this project first' : inCart ? 'Remove from selected projects' : 'Add to selected projects'}
                    className={
                      !user
                        ? 'btn-secondary h-[52px] w-full px-5 flex items-center justify-center gap-2 shadow-sm'
                        : isArchived
                          ? 'btn-secondary h-[52px] w-full px-5 opacity-60 cursor-not-allowed flex items-center justify-center gap-2'
                        : rankingsLocked
                          ? 'btn-secondary h-[52px] w-full px-5 opacity-60 cursor-not-allowed flex items-center justify-center gap-2'
                        : inCart
                        ? `btn-secondary h-[52px] w-full px-5 flex items-center justify-center gap-2 !text-pink-700 !border-pink-200 !bg-pink-50 hover:!bg-pink-100 transition-colors shadow-sm ${cartAnim === 'remove' ? 'cart-action-pop-remove' : ''}`
                        : rating > 0
                          ? `btn-primary h-[52px] w-full px-5 flex items-center justify-center gap-2 shadow-sm ${cartAnim === 'add' ? 'cart-action-pop-add' : ''}`
                          : 'btn-secondary h-[52px] w-full px-5 opacity-60 cursor-not-allowed flex items-center justify-center gap-2'
                    }
                    onClick={handleToggleCart}
                  >
                    {!user ? (
                       <>
                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v7h-7"/><path d="M3 10 14 21"/></svg>
                         Sign in to select
                       </>
                    ) : isArchived ? (
                       <>
                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>
                         Archived
                       </>
                    ) : rankingsLocked ? (
                       <>
                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                         Locked
                       </>
                    ) : inCart ? (
                       <>
                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                         Remove List
                       </>
                    ) : (
                       <>
                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
                         Select Project
                       </>
                    )}
                  </button>

                  {user?.role === 'student' ? (
                    <button
                      type="button"
                      className="btn-secondary w-full"
                      onClick={() => {
                        setCommentMessage('')
                        setCommentDrawerOpen(true)
                      }}
                    >
                      Ask admin a question
                      {myComments.length ? ` (${myComments.length})` : ''}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-6">
                <Section title="Overview">
                  {project?.summary ? (
                    <div className="mb-4">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>Summary</div>
                      <div className="mt-1"><Lines text={project.summary} /></div>
                    </div>
                  ) : null}
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>Description</div>
                  <div className="mt-1"><Lines text={project?.description} /></div>
                </Section>

                <Section title="Deliverables">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>Minimum deliverables</div>
                      <div className="mt-1"><Lines text={project?.minimum_deliverables} /></div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>Stretch goals</div>
                      <div className="mt-1"><Lines text={project?.stretch_goals} /></div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:col-span-2">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>Long-term impact</div>
                      <div className="mt-1"><Lines text={project?.long_term_impact} /></div>
                    </div>
                  </div>
                </Section>
              </div>

              <div className="space-y-6">
                <Section title="Requirements">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>Required skills</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(project?.required_skills || []).length ? (
                      (project.required_skills || []).map((t) => (
                        <span key={t} className="tag">{t}</span>
                      ))
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </div>
                  {project?.required_skills_other ? (
                    <div className="mt-3">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>Other</div>
                      <div className="mt-1"><Lines text={project.required_skills_other} /></div>
                    </div>
                  ) : null}

                  <div className="mt-6 text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>Data access</div>
                  <div className="mt-1"><Lines text={project?.data_access} /></div>

                </Section>

                <Section title="Organization">
                  <div className="text-sm"><span className="font-semibold">Industry:</span> {project?.org_industry || '—'}</div>
                  <div className="text-sm mt-2">
                    <span className="font-semibold">Website:</span>{' '}
                    {project?.org_website ? (
                      <a
                        className="text-blue-700 hover:underline break-all"
                        href={project.org_website}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {project.org_website}
                      </a>
                    ) : (
                      '—'
                    )}
                  </div>
                </Section>

                <Section title="Resources">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>Documents</div>
                  <div className="mt-2 space-y-2">
                    {(project?.supplementary_documents || []).length ? (
                      project.supplementary_documents.map((u) => (
                        <a
                          key={u}
                          className="block text-blue-700 hover:underline break-all"
                          href={u}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {u}
                        </a>
                      ))
                    ) : (
                      <div className="muted">—</div>
                    )}
                  </div>

                  <div className="mt-6 text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>Video links</div>
                  <div className="mt-2 space-y-2">
                    {(project?.video_links || []).length ? (
                      project.video_links.map((u) => (
                        <a
                          key={u}
                          className="block text-blue-700 hover:underline break-all"
                          href={u}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {u}
                        </a>
                      ))
                    ) : (
                      <div className="muted">—</div>
                    )}
                  </div>
                </Section>
              </div>
            </div>
          </>
        )}
      </div>
      {toastMessage ? (
        <div className="app-toast fixed bottom-4 right-4 z-[70] max-w-md rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 shadow-lg">
          {toastMessage}
        </div>
      ) : null}
    </div>
  )
}
