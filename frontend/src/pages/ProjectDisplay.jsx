import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  addCartItem,
  getCart,
  getProjectBySlug,
  getRankings,
  getRatings,
  removeCartItem,
  saveRating,
} from '../api'
import { clearAuth, getUser } from '../auth'
import midsLogo from '../assets/mids-logo-white-bg.svg'
import { DEFAULT_PROFILE_IMAGE_URL, initialsForPerson, resolveProfileImageUrl } from '../profileImage'

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
  if (!text) return <div className="muted">—</div>
  return (
    <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-justify leading-relaxed">
      {text}
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
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountAvatarFailed, setAccountAvatarFailed] = useState(false)

  const menuItems = user?.role === 'admin'
    ? ['Projects', 'Partners', 'Rankings', 'Admin']
    : user
      ? ['Projects', 'Partners', 'Rankings']
      : ['Projects']

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
        const p = await getProjectBySlug(projectSlug)
        if (cancelled) return

        setProject(p)

        if (user) {
          const [c, r, rankings] = await Promise.all([
            getCart(),
            getRatings(),
            getRankings().catch(() => null),
          ])
          if (cancelled) return
          setCart(c)
          const found = (r || []).find((x) => x.project_id === p.id)
          setRating(found?.rating || 0)
          setRankingsLocked(Boolean(rankings?.is_locked))
        } else {
          setCart({ selected: 0, limit: 10, project_ids: [] })
          setRating(0)
          setRankingsLocked(false)
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

  async function handleToggleCart() {
    if (!project?.id) return
    if (!user) {
      navigate('/login')
      return
    }
    if (rankingsLocked) {
      setError('Ranking window is closed. Project selection is disabled.')
      return
    }
    if (isArchived) {
      setError('Archived projects are visible but cannot be selected for ranking.')
      return
    }
    if (!inCart && rating <= 0) {
      setError('Please rate this project before adding it to selected projects.')
      return
    }
    const updated = inCart
      ? await removeCartItem(project.id)
      : await addCartItem({ projectId: project.id })
    setCart(updated)
    setError('')
  }

  async function handleRate(value) {
    if (!user) {
      navigate('/login')
      return
    }
    if (rankingsLocked) {
      setError('Ranking window is closed. Rating changes are disabled.')
      return
    }
    if (isArchived) {
      setError('Archived projects cannot be rated.')
      return
    }
    setRating(value)
    if (!project?.id) return
    await saveRating({ projectId: project.id, rating: value })
  }

  function onOpenProfile() {
    setAccountOpen(false)
    navigate('/profile')
  }

  function onSignOut() {
    setAccountOpen(false)
    clearAuth()
    navigate('/login', { replace: true })
  }

  const headerTitle = project?.title || projectSlug
  const org = project?.organization || projectSlug

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
                  const isActive = label === 'Projects'
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
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <button
                  type="button"
                  className="h-10 w-10 rounded-full bg-duke-900 text-white text-sm font-semibold"
                  aria-label={user ? 'Account menu' : 'Sign in'}
                  title={user ? 'Account menu' : 'Sign in'}
                  onClick={() => {
                    if (!user) {
                      navigate('/login')
                      return
                    }
                    setAccountOpen((v) => !v)
                  }}
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
                {user && accountOpen ? (
                  <div className="absolute right-0 top-full mt-2 w-44 rounded-card border border-slate-200 bg-white shadow-sm p-2 z-20">
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 rounded-card text-sm text-slate-700 hover:bg-slate-100"
                      onClick={onOpenProfile}
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
        </div>

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

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 md:p-5 space-y-4 xl:sticky xl:top-6">
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
                        ? 'btn-secondary h-[52px] w-full px-5 flex items-center justify-center gap-2 !text-pink-700 !border-pink-200 !bg-pink-50 hover:!bg-pink-100 transition-colors shadow-sm'
                        : rating > 0
                          ? 'btn-primary h-[52px] w-full px-5 flex items-center justify-center gap-2 shadow-sm'
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
    </div>
  )
}
