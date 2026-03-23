import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'

import {
  addCartItem,
  getCart,
  getFilters,
  getRatings,
  getRankings,
  saveRankings,
  searchProjects,
  getStats,
  getUserSummary,
  removeCartItem,
  saveRating,
} from '../api'
import { clearAuth, getUser } from '../auth'
import midsLogo from '../assets/mids-logo-white-bg.svg'
import { DEFAULT_PROFILE_IMAGE_URL, initialsForPerson, resolveProfileImageUrl } from '../profileImage'

function Stars({ rating, onRate, disabled = false }) {
  return (
    <div className="mt-3 flex items-center gap-1">
      {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
        <button
          key={value}
          type="button"
          disabled={disabled}
          className={
            value <= rating
              ? `text-lg transition text-amber-400 ${disabled ? 'cursor-not-allowed opacity-70' : 'hover:scale-110'}`
              : `text-lg transition text-slate-300 ${disabled ? 'cursor-not-allowed opacity-70' : 'hover:scale-110'}`
          }
          aria-label={disabled ? 'Sign in to rate' : `Rate ${value} stars`}
          onClick={(event) => {
            event.stopPropagation()
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

function OrganizationLogo({ logoUrl, organization }) {
  const [failed, setFailed] = useState(false)
  const initials = (organization || '??').slice(0, 2).toUpperCase()

  if (!logoUrl || failed) {
    return (
      <div className="org-logo-frame org-logo-frame-sm bg-slate-100" aria-hidden="true">
        <span className="org-logo-fallback text-[10px]">{initials}</span>
      </div>
    )
  }

  return (
    <div className="org-logo-frame org-logo-frame-sm" title={`${organization || 'Organization'} logo`}>
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

function buildPaginationTokens(currentPage, hasNext) {
  const lastKnownPage = hasNext ? currentPage + 1 : currentPage
  const candidates = new Set([
    0,
    Math.max(0, currentPage - 1),
    currentPage,
    Math.min(lastKnownPage, currentPage + 1),
    lastKnownPage,
  ])

  const pages = [...candidates].filter((p) => p >= 0 && p <= lastKnownPage).sort((a, b) => a - b)
  const tokens = []
  let prev = null
  for (const page of pages) {
    if (prev !== null && page - prev > 1) {
      tokens.push({ type: 'ellipsis', key: `e-${prev}-${page}` })
    }
    tokens.push({ type: 'page', page, key: `p-${page}` })
    prev = page
  }
  return tokens
}

function GooglePagination({ page, hasNext, loading, onPageChange, align = 'end' }) {
  const tokens = buildPaginationTokens(page, hasNext)
  const justifyClass = align === 'between' ? 'justify-between' : 'justify-end'

  return (
    <div className={`flex items-center ${justifyClass} gap-2 flex-wrap`}>
      <button
        type="button"
        className="btn-secondary"
        disabled={loading || page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </button>

      <div className="flex items-center gap-1.5">
        {tokens.map((token) => {
          if (token.type === 'ellipsis') {
            return (
              <span key={token.key} className="px-2 text-slate-400" aria-hidden="true">
                ...
              </span>
            )
          }

          const isActive = token.page === page
          return (
            <button
              key={token.key}
              type="button"
              disabled={loading}
              aria-current={isActive ? 'page' : undefined}
              className={
                isActive
                  ? 'h-10 min-w-[2.5rem] px-3 rounded-lg bg-duke-900 text-white text-sm font-semibold'
                  : 'h-10 min-w-[2.5rem] px-3 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50'
              }
              onClick={() => onPageChange(token.page)}
            >
              {token.page + 1}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className="btn-secondary"
        disabled={loading || !hasNext}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>
    </div>
  )
}

function ProjectCard({ project, inCart, onToggleCart, rating, onRate, onOpen, isGuest = false, rankingsLocked = false }) {
  const canAddToCart = !isGuest && !rankingsLocked && (inCart || rating > 0)
  const headerMeta = project.cohort || (project.tags.length ? `${project.tags.length} tagged skills` : 'Open project')
  const metaChips = [
    project.domain ? `Focus: ${project.domain}` : null,
    project.cohort ? `Cohort: ${project.cohort}` : null,
    project.tags.length ? `Skills: ${project.tags.length}` : null,
  ].filter(Boolean)

  return (
    <div
      className="project-card card cursor-pointer group"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onOpen()
      }}
    >
      <div className="project-card-top">
        <div className="flex items-start justify-between gap-3">
          <span className="pill">{project.domain || 'General'}</span>
          <div className="project-card-duration">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round" className="text-slate-400"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            {headerMeta}
          </div>
        </div>

        <div className="mt-3">
          <h3 className="project-card-title group-hover:text-duke-800 transition-colors">{project.title}</h3>
          <p className="project-card-description mt-2">{project.description}</p>
          <div className="mt-2 text-xs text-slate-500">
            Published: {project.publishedDateLabel}
          </div>
        </div>

        <div className="project-card-rating mt-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Rate project match</div>
            <div className={`text-xs font-bold px-2 py-0.5 rounded ${rating >= 7 ? 'bg-green-100 text-green-700' : rating >= 4 ? 'bg-amber-100 text-amber-700' : rating > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{isGuest ? 'Sign in' : `${rating || 0}/10`}</div>
          </div>
          <Stars rating={rating} onRate={onRate} disabled={isGuest || rankingsLocked} />
        </div>
      </div>

      {metaChips.length ? (
        <div className="project-card-meta">
          {metaChips.map((chip) => (
            <span key={chip} className="project-meta-chip">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round" className="text-duke-700/60"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              {chip}
            </span>
          ))}
        </div>
      ) : null}

      <div className="project-card-tags">
        {project.tags.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
      </div>

      <div className="project-card-footer">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <OrganizationLogo logoUrl={project.organizationLogoUrl} organization={project.organization} />
          <span className="truncate max-w-[140px] font-medium text-slate-800" title={project.organization}>{project.organization}</span>
        </div>
        <div className="flex items-center gap-2 project-card-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={(event) => {
              event.stopPropagation()
              onOpen()
            }}
          >
            Details
          </button>
          <button
            type="button"
            disabled={rankingsLocked || (!canAddToCart && !isGuest)}
            title={
              isGuest
                ? 'Sign in to select projects'
                : rankingsLocked
                  ? 'Ranking window is closed'
                : !canAddToCart
                  ? 'Rate this project first'
                  : inCart
                    ? 'Remove from selected projects'
                    : 'Add to selected projects'
            }
            className={
              isGuest
                ? 'btn-secondary flex items-center gap-1.5'
                : rankingsLocked
                  ? 'btn-secondary opacity-60 cursor-not-allowed flex items-center gap-1.5'
                : inCart
                ? 'btn-secondary flex items-center gap-1.5 !text-pink-700 !border-pink-200 !bg-pink-50 hover:!bg-pink-100'
                : canAddToCart
                  ? 'btn-primary flex items-center gap-1.5'
                  : 'btn-secondary opacity-60 cursor-not-allowed flex items-center gap-1.5'
            }
            onClick={(event) => {
              event.stopPropagation()
              onToggleCart(project.id, inCart)
            }}
          >
            {isGuest ? (
               <>
                 <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinelinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v7h-7"/><path d="M3 10 14 21"/></svg>
                 Sign in
               </>
            ) : rankingsLocked ? (
               <>
                 <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                 Locked
               </>
            ) : inCart ? (
               <>
                 <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinelinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                 Remove
               </>
            ) : (
               <>
                 <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinelinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
                 Select
               </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CatalogPage() {
  const navigate = useNavigate()
  const user = getUser()

  const PAGE_SIZE = 5
  const FETCH_LIMIT = PAGE_SIZE + 1

  const [projects, setProjects] = useState([])
  const [stats, setStats] = useState({ active_projects: 0, new_this_week: 0 })
  const [cart, setCart] = useState({ selected: 0, limit: 10 })
  const [filters, setFilters] = useState({
    domains: [],
    skills: [],
    difficulties: [],
    modalities: [],
    cadences: [],
    confidentiality: [],
    industries: [],
    company_sizes: [],
    cohorts: [],
  })
  const [selectedDomains, setSelectedDomains] = useState([])
  const [selectedSkills, setSelectedSkills] = useState([])
  const [selectedIndustries, setSelectedIndustries] = useState([])
  const [selectedCohort, setSelectedCohort] = useState('')
  const [matchMode, setMatchMode] = useState('and')
  const [projectSort, setProjectSort] = useState('newest')
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [avgMatchScore, setAvgMatchScore] = useState(0)
  const [rankingsLocked, setRankingsLocked] = useState(false)
  const [ratings, setRatings] = useState({})
  const [actionMessage, setActionMessage] = useState('')
  const [rankingPanelOpen, setRankingPanelOpen] = useState(false)
  const [rankingPanelLoading, setRankingPanelLoading] = useState(false)
  const [rankingPanelSaving, setRankingPanelSaving] = useState(false)
  const [rankingPanelError, setRankingPanelError] = useState('')
  const [rankingPanelTopTen, setRankingPanelTopTen] = useState([])
  const [rankingPanelAdditional, setRankingPanelAdditional] = useState([])
  const [page, setPage] = useState(0)
  const [hasNext, setHasNext] = useState(false)
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

  function mapProjects(list) {
    return list.map((x) => ({
      id: x.id,
      slug: x.slug,
      domain: x.domain ?? '',
      title: x.title,
      description: x.description,
      cohort: x.cohort ?? '',
      organizationLogoUrl: x.organization_logo_url ?? '',
      tags: Array.isArray(x.tags) ? x.tags : [],
      organization: x.organization ?? '—',
      createdAt: x.created_at || null,
      publishedDateLabel: x.created_at ? new Date(x.created_at).toLocaleDateString() : 'Unknown',
    }))
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

  function getRatingValue(projectId) {
    return Number(ratings[String(projectId)] || 0)
  }

  function setPagedProjects(raw) {
    const mapped = mapProjects(raw)
    setHasNext(mapped.length > PAGE_SIZE)
    setProjects(mapped.slice(0, PAGE_SIZE))
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [s, p, f] = await Promise.all([
          getStats(),
          searchProjects({ limit: FETCH_LIMIT, offset: 0 }),
          getFilters(),
        ])
        if (cancelled) return

        setStats(s)
        setFilters(f)

        setPage(0)
        setPagedProjects(p)

        if (user) {
          const [c, summary, ratingRows, rankings] = await Promise.all([
            getCart(),
            getUserSummary(),
            getRatings(),
            getRankings().catch(() => null),
          ])
          if (!cancelled) {
            setCart(c)
            setAvgMatchScore(summary.avg_match_score)
            setRankingsLocked(Boolean(rankings?.is_locked))
            setRatings(buildRatingMap(ratingRows))
          }
        } else {
          setCart({ selected: 0, limit: 10 })
          setAvgMatchScore(0)
          setRankingsLocked(false)
          setRatings({})
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function applySearch({ domains, skills, industries, cohort, mode, q, pageIndex, sort } = {}) {
    setLoading(true)
    try {
      const nextPage = Math.max(0, Number.isFinite(pageIndex) ? pageIndex : page)
      const nextSort = sort ?? projectSort
      const sortBy = nextSort === 'title-az' || nextSort === 'title-za' ? 'title' : 'created_at'
      const sortDir = nextSort === 'oldest' || nextSort === 'title-az' ? 'asc' : 'desc'
      const payload = {
        q: q ?? searchText,
        domains: domains ?? selectedDomains,
        skills: skills ?? selectedSkills,
        industries: industries ?? selectedIndustries,
        cohort: cohort ?? (selectedCohort || undefined),
        match_mode: mode ?? matchMode,
        sort_by: sortBy,
        sort_dir: sortDir,
        limit: FETCH_LIMIT,
        offset: nextPage * PAGE_SIZE,
      }
      const data = await searchProjects(payload)
      setPage(nextPage)
      setPagedProjects(data)
    } finally {
      setLoading(false)
    }
  }

  function toggleSelection(value, list, setter) {
    const exists = list.includes(value)
    const next = exists ? list.filter((item) => item !== value) : [...list, value]
    setter(next)
    return next
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      setPage(0)
      applySearch({ q: searchText, pageIndex: 0 })
    }, 350)
    return () => clearTimeout(handle)
  }, [searchText, projectSort])

  const curatedCount = useMemo(() => projects.length, [projects])

  async function handleToggleCart(projectId, inCart) {
    if (!user) {
      navigate('/login')
      return
    }
    if (rankingsLocked) {
      setActionMessage('Ranking window is closed. Project selection is disabled.')
      return
    }
    if (!inCart && getRatingValue(projectId) <= 0) {
      setActionMessage('Please rate a project before adding it to Selected Projects.')
      return
    }
    try {
      const updated = inCart ? await removeCartItem(projectId) : await addCartItem({ projectId })
      setCart(updated)
      setActionMessage('')
    } catch (err) {
      setActionMessage(String(err?.message || 'Unable to update selected projects.'))
    }
  }

  function onSignOut() {
    if (!user) {
      navigate('/login')
      return
    }
    setAccountOpen(false)
    clearAuth()
    setCart({ selected: 0, limit: 10 })
    navigate('/', { replace: true })
  }

  function onOpenProfile() {
    setAccountOpen(false)
    navigate('/profile')
  }

  async function handleRate(projectId, value) {
    if (!user) {
      navigate('/login')
      return
    }
    if (rankingsLocked) {
      setActionMessage('Ranking window is closed. Rating changes are disabled.')
      return
    }
    setRatings((prev) => ({ ...prev, [String(projectId)]: Number(value || 0) }))
    await saveRating({ projectId, rating: value })
  }

  async function loadRankingPanelData() {
    setRankingPanelLoading(true)
    setRankingPanelError('')
    try {
      const data = await getRankings()
      setRankingPanelTopTen(data?.top_ten || [])
      setRankingPanelAdditional(data?.additional || [])
      setRankingsLocked(Boolean(data?.is_locked))
    } catch (err) {
      setRankingPanelError(String(err?.message || 'Failed to load selected projects'))
    } finally {
      setRankingPanelLoading(false)
    }
  }

  async function openRankingPanel() {
    if (!user) {
      navigate('/login')
      return
    }
    setRankingPanelOpen(true)
    const [panelResult, ratingRows] = await Promise.all([
      loadRankingPanelData(),
      getRatings().catch(() => []),
    ])
    const ratingMap = buildRatingMap(ratingRows)
    setRatings((prev) => ({ ...prev, ...ratingMap }))
    return panelResult
  }

  async function persistRankingPanel(nextTopTen, nextAdditional) {
    setRankingPanelSaving(true)
    setRankingPanelError('')
    try {
      await saveRankings({ topTenIds: nextTopTen.map((item) => item.id) })
      setRankingPanelTopTen(nextTopTen)
      setRankingPanelAdditional(nextAdditional)
    } catch (err) {
      setRankingPanelError(String(err?.message || 'Failed to save ranking order'))
    } finally {
      setRankingPanelSaving(false)
    }
  }

  async function panelMoveRank(index, direction) {
    if (rankingsLocked) return
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= rankingPanelTopTen.length) return
    const nextTop = [...rankingPanelTopTen]
    const [moved] = nextTop.splice(index, 1)
    nextTop.splice(nextIndex, 0, moved)
    await persistRankingPanel(nextTop, rankingPanelAdditional)
  }

  async function panelRemoveFromTop(index) {
    if (rankingsLocked) return
    const item = rankingPanelTopTen[index]
    if (!item) return
    const nextTop = rankingPanelTopTen.filter((_, idx) => idx !== index)
    const nextAdditional = [item, ...rankingPanelAdditional]
    await persistRankingPanel(nextTop, nextAdditional)
  }

  async function panelAddToTop(itemId) {
    if (rankingsLocked) return
    const item = rankingPanelAdditional.find((row) => row.id === itemId)
    if (!item) return
    if (getRatingValue(itemId) <= 0) {
      setRankingPanelError('Rate this project first before adding to Top 10.')
      return
    }
    if (rankingPanelTopTen.length >= 10) {
      setRankingPanelError('Top 10 is already full.')
      return
    }
    const nextTop = [...rankingPanelTopTen, item]
    const nextAdditional = rankingPanelAdditional.filter((row) => row.id !== itemId)
    await persistRankingPanel(nextTop, nextAdditional)
  }

  function openProjectFromRankingPanel(item) {
    if (!item) return
    setRankingPanelOpen(false)
    navigate(`/projects/${encodeURIComponent(item.slug || String(item.id))}`)
  }

  async function handlePanelDragEnd(result) {
    if (rankingsLocked || rankingPanelSaving) return
    const { source, destination } = result
    if (!destination) return
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return
    }

    const nextTop = [...rankingPanelTopTen]
    const nextAdditional = [...rankingPanelAdditional]

    if (source.droppableId === 'panel-top' && destination.droppableId === 'panel-top') {
      const [moved] = nextTop.splice(source.index, 1)
      nextTop.splice(destination.index, 0, moved)
      await persistRankingPanel(nextTop, nextAdditional)
      return
    }

    if (source.droppableId === 'panel-additional' && destination.droppableId === 'panel-additional') {
      const [moved] = nextAdditional.splice(source.index, 1)
      nextAdditional.splice(destination.index, 0, moved)
      setRankingPanelAdditional(nextAdditional)
      return
    }

    if (source.droppableId === 'panel-additional' && destination.droppableId === 'panel-top') {
      if (nextTop.length >= 10) {
        setRankingPanelError('Top 10 is already full.')
        return
      }
      const candidate = nextAdditional[source.index]
      if (!candidate) return
      if (getRatingValue(candidate.id) <= 0) {
        setRankingPanelError('Rate this project first before adding to Top 10.')
        return
      }
      const [moved] = nextAdditional.splice(source.index, 1)
      nextTop.splice(destination.index, 0, moved)
      await persistRankingPanel(nextTop, nextAdditional)
      return
    }

    if (source.droppableId === 'panel-top' && destination.droppableId === 'panel-additional') {
      const [moved] = nextTop.splice(source.index, 1)
      nextAdditional.splice(destination.index, 0, moved)
      await persistRankingPanel(nextTop, nextAdditional)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
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
            <div className="flex items-center gap-3">
              <div className="relative w-full md:w-[420px]">
                <input
                  className="input-base pl-10"
                  placeholder="Try: ‘Finance’ or ‘Machine Learning’"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setPage(0)
                      applySearch({ q: searchText, pageIndex: 0 })
                    }
                  }}
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔎</span>
              </div>
              <div className="relative">
                <button
                  type="button"
                  className="h-10 w-10 rounded-full bg-duke-900 text-white flex items-center justify-center font-semibold"
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
                  {user && !accountAvatarFailed ? (
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <aside className="w-full md:w-[300px] space-y-4">
              <div className="card p-4">
                <h2 className="text-lg font-heading text-duke-900">Filters</h2>
                <p className="muted mt-1">Refine results by skill and logistics.</p>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span className="text-slate-500">Match mode</span>
                  <div className="inline-flex rounded-full border border-slate-200 p-1 bg-slate-50">
                    <button
                      type="button"
                      className={
                        matchMode === 'and'
                          ? 'px-3 py-1 rounded-full bg-duke-900 text-white'
                          : 'px-3 py-1 rounded-full text-slate-600'
                      }
                      onClick={() => {
                        setMatchMode('and')
                        setPage(0)
                        applySearch({ mode: 'and', pageIndex: 0 })
                      }}
                    >
                      Match all
                    </button>
                    <button
                      type="button"
                      className={
                        matchMode === 'or'
                          ? 'px-3 py-1 rounded-full bg-duke-900 text-white'
                          : 'px-3 py-1 rounded-full text-slate-600'
                      }
                      onClick={() => {
                        setMatchMode('or')
                        setPage(0)
                        applySearch({ mode: 'or', pageIndex: 0 })
                      }}
                    >
                      Match any
                    </button>
                  </div>
                </div>
                {filters.cohorts.length > 0 ? (
                  <div className="mt-4">
                    <div className="label">Cohort</div>
                    <select
                      className="select-base"
                      value={selectedCohort}
                      onChange={(event) => {
                        setSelectedCohort(event.target.value)
                        setPage(0)
                        applySearch({ cohort: event.target.value || undefined, pageIndex: 0 })
                      }}
                    >
                      <option value="">All cohorts</option>
                      {filters.cohorts.map((cohort) => (
                        <option key={cohort} value={cohort}>
                          {cohort}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>

              {(filters.domains.length > 0 || filters.skills.length > 0) && (
                <div className="border border-slate-200 rounded-card bg-white">
                  <button className="w-full flex items-center justify-between px-4 py-3 text-left">
                    <span className="font-semibold text-slate-700">Domain &amp; Skills</span>
                    <span className="text-slate-500">▾</span>
                  </button>
                  <div className="px-4 pb-4 space-y-3">
                    {filters.domains.length > 0 && (
                      <div>
                        <div className="label">Technical Domain</div>
                        <div className="flex flex-wrap gap-2">
                          {filters.domains.map((d) => (
                            <span
                              key={d}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                const next = toggleSelection(d, selectedDomains, setSelectedDomains)
                                setPage(0)
                                applySearch({ domains: next, pageIndex: 0 })
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  const next = toggleSelection(d, selectedDomains, setSelectedDomains)
                                  setPage(0)
                                  applySearch({ domains: next, pageIndex: 0 })
                                }
                              }}
                              className={
                                selectedDomains.includes(d)
                                  ? 'px-3 py-1 rounded-full bg-duke-900 text-white text-sm'
                                  : 'px-3 py-1 rounded-full border border-duke-700 text-duke-700 text-sm'
                              }
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {filters.skills.length > 0 && (
                      <div>
                        <div className="label">Required Skills</div>
                        <input className="input-base" placeholder="Search skills" />
                        <div className="flex flex-wrap gap-2 mt-2">
                          {filters.skills.slice(0, 6).map((skill) => (
                            <span
                              key={skill}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  const next = toggleSelection(skill, selectedSkills, setSelectedSkills)
                                  setPage(0)
                                  applySearch({ skills: next, pageIndex: 0 })
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    const next = toggleSelection(skill, selectedSkills, setSelectedSkills)
                                    setPage(0)
                                    applySearch({ skills: next, pageIndex: 0 })
                                  }
                                }}
                                className={
                                  selectedSkills.includes(skill)
                                    ? 'px-3 py-1 rounded-full bg-duke-900 text-white text-sm'
                                    : 'px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm'
                                }
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {filters.difficulties.length > 0 && (
                <div className="border border-slate-200 rounded-card bg-white">
                  <button className="w-full flex items-center justify-between px-4 py-3 text-left">
                    <span className="font-semibold text-slate-700">Project Characteristics</span>
                    <span className="text-slate-500">▾</span>
                  </button>
                  <div className="px-4 pb-4 space-y-3">
                    <div>
                      <div className="label">Difficulty Level</div>
                      <div className="space-y-2">
                        {filters.difficulties.map((lvl) => (
                          <label key={lvl} className="flex items-center gap-2 text-sm text-slate-700">
                            <input type="checkbox" className="accent-duke-900" />
                            {lvl}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {(filters.modalities.length > 0 ||
                filters.cadences.length > 0 ||
                filters.confidentiality.length > 0 ||
                filters.industries.length > 0 ||
                filters.company_sizes.length > 0) && (
                <div className="border border-slate-200 rounded-card bg-white">
                  <button className="w-full flex items-center justify-between px-4 py-3 text-left">
                    <span className="font-semibold text-slate-700">Logistics</span>
                    <span className="text-slate-500">▾</span>
                  </button>
                  <div className="px-4 pb-4 space-y-3">
                    {filters.modalities.length > 0 && (
                      <div>
                        <div className="label">Modality</div>
                        <div className="flex flex-wrap gap-2">
                          {filters.modalities.map((m) => (
                            <span
                              key={m}
                              className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {filters.cadences.length > 0 && (
                      <div>
                        <div className="label">Cadence</div>
                        <select className="select-base">
                          {filters.cadences.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {filters.confidentiality.length > 0 && (
                      <div>
                        <div className="label">Confidentiality</div>
                        <div className="flex flex-wrap gap-2">
                          {filters.confidentiality.map((c) => (
                            <span
                              key={c}
                              className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {filters.industries.length > 0 && (
                      <div>
                        <div className="label">Industry</div>
                        <select
                          className="select-base"
                          value={selectedIndustries[0] ?? ''}
                          onChange={(event) => {
                            const value = event.target.value
                            const next = value ? [value] : []
                            setSelectedIndustries(next)
                            setPage(0)
                            applySearch({ industries: next, pageIndex: 0 })
                          }}
                        >
                          <option value="">All industries</option>
                          {filters.industries.map((industry) => (
                            <option key={industry} value={industry}>
                              {industry}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {filters.company_sizes.length > 0 && (
                      <div>
                        <div className="label">Organization Size</div>
                        <div className="flex flex-wrap gap-2">
                          {filters.company_sizes.map((s) => (
                            <span
                              key={s}
                              className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </aside>
          </div>

          <div className="md:col-span-2 space-y-4">
            <div className="card p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={resolveProfileImageUrl({
                      displayName: user?.display_name,
                      email: user?.email,
                      profileImageUrl: user?.profile_image_url,
                    })}
                    alt={user?.display_name || user?.email || 'Profile'}
                    className="h-10 w-10 rounded-full border border-slate-200 bg-white object-cover"
                    onError={(event) => {
                      event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                      event.currentTarget.onerror = null
                    }}
                  />
                  <div>
                    <div className="text-sm text-slate-500">Welcome {user?.display_name || user?.email || '<PRIVATE_PERSON>'}</div>
                    <div className="text-xl font-heading text-duke-900">Available capstone projects</div>
                    <div className="text-sm text-slate-500 mt-1">
                      Showing <span className="font-semibold">{curatedCount}</span> projects currently available.
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="card px-4 py-3">
                    <div className="text-xs text-slate-500">Selected</div>
                    <div className="text-2xl font-semibold text-duke-900">
                      {cart.selected} / {cart.limit}
                    </div>
                    <button
                      type="button"
                      className="btn-primary mt-2"
                      onClick={openRankingPanel}
                    >
                      Go to selected projects
                    </button>
                  </div>
                </div>
              </div>
              {actionMessage ? (
                <div className="mt-3 text-sm text-red-700">{actionMessage}</div>
              ) : null}
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">
                {stats.active_projects} active • {stats.new_this_week} new this week
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">Sort by</span>
                  <select
                    className="select-base"
                    value={projectSort}
                    onChange={(event) => {
                      const next = event.target.value
                      setProjectSort(next)
                      setPage(0)
                      applySearch({ sort: next, pageIndex: 0 })
                    }}
                  >
                    <option value="newest">Most recent first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="title-az">Title A-Z</option>
                    <option value="title-za">Title Z-A</option>
                  </select>
                </div>
                <GooglePagination
                  page={page}
                  hasNext={hasNext}
                  loading={loading}
                  align="end"
                  onPageChange={(nextPage) => applySearch({ pageIndex: nextPage })}
                />
              </div>
            </div>

            {loading ? (
              <div className="card p-6 text-slate-600">Loading…</div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4">
                  {projects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      inCart={cart.project_ids?.includes(p.id)}
                      onToggleCart={handleToggleCart}
                      rating={getRatingValue(p.id)}
                      onRate={(value) => handleRate(p.id, value)}
                      isGuest={!user}
                      rankingsLocked={rankingsLocked}
                      onOpen={() =>
                        navigate(`/projects/${encodeURIComponent(p.slug || String(p.id))}`)
                      }
                    />
                  ))}
                </div>

                <div className="mt-4">
                  <GooglePagination
                    page={page}
                    hasNext={hasNext}
                    loading={loading}
                    align="end"
                    onPageChange={(nextPage) => applySearch({ pageIndex: nextPage })}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-50 transition ${rankingPanelOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
        aria-hidden={!rankingPanelOpen}
      >
        <div
          className={`absolute inset-0 bg-slate-900/30 transition-opacity ${rankingPanelOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setRankingPanelOpen(false)}
        />
        <aside
          className={`absolute top-0 h-full w-full max-w-2xl bg-white shadow-2xl border-l border-slate-200 transition-[right] duration-300 ${rankingPanelOpen ? 'right-0' : '-right-full'}`}
        >
          <div className="h-full flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Selected Projects</div>
                <div className="text-lg font-semibold text-duke-900">Rank in-page</div>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setRankingPanelOpen(false)}>Close</button>
            </div>

            {rankingPanelLoading ? (
              <div className="p-5 text-sm text-slate-600">Loading selected projects…</div>
            ) : (
              <div className="p-5 space-y-4 overflow-auto">
                <div className="text-xs text-slate-600">
                  {rankingsLocked ? 'Ranking window closed' : `${rankingPanelTopTen.length}/10 ranked`}
                </div>
                {rankingPanelError ? <div className="text-sm text-red-700">{rankingPanelError}</div> : null}

                <DragDropContext onDragEnd={handlePanelDragEnd}>
                  <section className="rounded-xl border border-slate-200 p-3">
                    <div className="text-sm font-semibold text-duke-900 mb-2">Top 10</div>
                    <Droppable droppableId="panel-top">
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`space-y-2 min-h-[80px] rounded-lg ${snapshot.isDraggingOver ? 'bg-slate-100/70 p-1' : ''}`}
                        >
                          {rankingPanelTopTen.map((item, index) => (
                            <Draggable
                              key={`panel-top-${item.id}`}
                              draggableId={`panel-top-${item.id}`}
                              index={index}
                              isDragDisabled={rankingsLocked || rankingPanelSaving}
                            >
                              {(providedDraggable, snapshotDraggable) => (
                                <div
                                  ref={providedDraggable.innerRef}
                                  {...providedDraggable.draggableProps}
                                  {...providedDraggable.dragHandleProps}
                                  className={`rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 flex items-start justify-between gap-2 ${snapshotDraggable.isDragging ? 'shadow-lg ring-2 ring-blue-200' : ''}`}
                                  style={providedDraggable.draggableProps.style}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => openProjectFromRankingPanel(item)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault()
                                      openProjectFromRankingPanel(item)
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
                                    <div className="flex items-center gap-1">
                                      <button type="button" className="btn-secondary !px-2 !py-1" onClick={(event) => { event.stopPropagation(); panelMoveRank(index, -1) }} disabled={index === 0 || rankingPanelSaving}>↑</button>
                                      <button type="button" className="btn-secondary !px-2 !py-1" onClick={(event) => { event.stopPropagation(); panelMoveRank(index, 1) }} disabled={index === rankingPanelTopTen.length - 1 || rankingPanelSaving}>↓</button>
                                      <button type="button" className="btn-secondary !px-2 !py-1" onClick={(event) => { event.stopPropagation(); panelRemoveFromTop(index) }} disabled={rankingPanelSaving}>Remove</button>
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                          {rankingPanelTopTen.length === 0 ? (
                            <div className="text-sm text-slate-500">No projects ranked yet.</div>
                          ) : null}
                        </div>
                      )}
                    </Droppable>
                  </section>

                  <section className="rounded-xl border border-slate-200 p-3">
                    <div className="text-sm font-semibold text-duke-900 mb-2">Unranked selected projects</div>
                    <Droppable droppableId="panel-additional">
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`space-y-2 max-h-[260px] overflow-auto min-h-[80px] rounded-lg ${snapshot.isDraggingOver ? 'bg-slate-100/70 p-1' : ''}`}
                        >
                          {rankingPanelAdditional.map((item, index) => (
                            <Draggable
                              key={`panel-additional-${item.id}`}
                              draggableId={`panel-additional-${item.id}`}
                              index={index}
                              isDragDisabled={rankingsLocked || rankingPanelSaving}
                            >
                              {(providedDraggable, snapshotDraggable) => (
                                <div
                                  ref={providedDraggable.innerRef}
                                  {...providedDraggable.draggableProps}
                                  {...providedDraggable.dragHandleProps}
                                  className={`rounded-lg border border-slate-200 px-3 py-2 bg-white flex items-start justify-between gap-2 ${snapshotDraggable.isDragging ? 'shadow-lg ring-2 ring-blue-200' : ''}`}
                                  style={providedDraggable.draggableProps.style}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => openProjectFromRankingPanel(item)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault()
                                      openProjectFromRankingPanel(item)
                                    }
                                  }}
                                >
                                  <div>
                                    <div className="text-sm font-semibold text-duke-900">{item.title}</div>
                                    <div className="text-xs text-slate-500">{item.organization}</div>
                                    <RatingPreview value={getRatingValue(item.id)} />
                                  </div>
                                  {!rankingsLocked ? (
                                    <button
                                      type="button"
                                      className="btn-secondary"
                                      onClick={(event) => { event.stopPropagation(); panelAddToTop(item.id) }}
                                      disabled={rankingPanelSaving || getRatingValue(item.id) <= 0}
                                      title={getRatingValue(item.id) <= 0 ? 'Rate this project first' : 'Add to Top 10'}
                                    >
                                      Add
                                    </button>
                                  ) : null}
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                          {rankingPanelAdditional.length === 0 ? (
                            <div className="text-sm text-slate-500">No additional selected projects.</div>
                          ) : null}
                        </div>
                      )}
                    </Droppable>
                  </section>
                </DragDropContext>
              </div>
            )}

            <div className="px-5 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="btn-secondary" onClick={() => navigate('/rankings')}>
                Open full rankings page
              </button>
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
    </div>
  )
}
