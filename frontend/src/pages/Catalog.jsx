import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { layout, prepare } from '@chenglou/pretext'

import {
  addCartItem,
  getCart,
  getFilters,
  getRatings,
  getRankings,
  searchProjects,
  getStats,
  getUserSummary,
  removeCartItem,
  saveRating,
} from '../api'
import { clearAuth, getUser } from '../auth'
import { DEFAULT_PROFILE_IMAGE_URL, resolveProfileImageUrl } from '../profileImage'
import AppHeader from '../components/AppHeader'

const PROJECT_CARD_DESC_FONT = "400 14px 'Plus Jakarta Sans'"
const PROJECT_CARD_DESC_LINE_HEIGHT = 22.75

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
  const justifyClass = align === 'between' ? 'justify-center sm:justify-between' : 'justify-center sm:justify-end'

  return (
    <div className={`flex items-center ${justifyClass} gap-2 sm:gap-3 flex-wrap`}>
      <button
        type="button"
        className="btn-secondary h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm"
        disabled={loading || page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </button>

      <div className="flex items-center gap-1 sm:gap-1.5">
        {tokens.map((token) => {
          if (token.type === 'ellipsis') {
            return (
              <span key={token.key} className="px-1 sm:px-2 text-slate-400" aria-hidden="true">
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
                  ? 'h-9 sm:h-10 min-w-[2rem] sm:min-w-[2.5rem] px-2 sm:px-3 rounded-lg bg-duke-900 text-white text-xs sm:text-sm font-semibold'
                  : 'h-9 sm:h-10 min-w-[2rem] sm:min-w-[2.5rem] px-2 sm:px-3 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-50'
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
        className="btn-secondary h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm"
        disabled={loading || !hasNext}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>
    </div>
  )
}

function formatPublishedRelative(isoText) {
  if (!isoText) return 'Published recently'
  const published = new Date(isoText)
  if (Number.isNaN(published.getTime())) return 'Published recently'

  const diffMs = Date.now() - published.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < minute) return 'Published just now'
  if (diffMs < hour) {
    const mins = Math.floor(diffMs / minute)
    return `Published ${mins} minute${mins === 1 ? '' : 's'} ago`
  }
  if (diffMs < day) {
    const hours = Math.floor(diffMs / hour)
    return `Published ${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  const days = Math.floor(diffMs / day)
  return `Published ${days} day${days === 1 ? '' : 's'} ago`
}

function ProjectCard({ project, inCart, onToggleCart, rating, onRate, onOpen, isGuest = false, rankingsLocked = false }) {
  const descriptionRef = useRef(null)
  const [descriptionHeight, setDescriptionHeight] = useState(() => Math.ceil(PROJECT_CARD_DESC_LINE_HEIGHT))
  const isArchived = project.projectStatus === 'archived'
  const canAddToCart = !isGuest && !isArchived && !rankingsLocked && (inCart || rating > 0)
  const headerMeta = project.cohort || (project.tags.length ? `${project.tags.length} tagged skills` : 'Open project')
  const metaChips = [
    project.domain ? `Focus: ${project.domain}` : null,
    project.cohort ? `Cohort: ${project.cohort}` : null,
    project.tags.length ? `Skills: ${project.tags.length}` : null,
  ].filter(Boolean)
  const cartAnimClass =
    project?.cartAnim === 'add'
      ? 'cart-action-pop-add'
      : project?.cartAnim === 'remove'
        ? 'cart-action-pop-remove'
        : ''

  useEffect(() => {
    const measureDescription = () => {
      const el = descriptionRef.current
      const text = (project.description || '').trim()
      if (!el) return
      if (!text) {
        setDescriptionHeight(Math.ceil(PROJECT_CARD_DESC_LINE_HEIGHT))
        return
      }

      const width = el.clientWidth
      if (!width) return

      try {
        const prepared = prepare(text, PROJECT_CARD_DESC_FONT)
        const metrics = layout(prepared, width, PROJECT_CARD_DESC_LINE_HEIGHT)
        const visibleLines = Math.max(1, Math.min(3, Number(metrics?.lineCount || 1)))
        setDescriptionHeight(Math.ceil(visibleLines * PROJECT_CARD_DESC_LINE_HEIGHT))
      } catch {
        setDescriptionHeight(Math.ceil(PROJECT_CARD_DESC_LINE_HEIGHT * 3))
      }
    }

    measureDescription()

    const el = descriptionRef.current
    if (!el) return undefined

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => measureDescription())
      observer.observe(el)
      return () => observer.disconnect()
    }

    const onResize = () => measureDescription()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [project.description])

  return (
    <div
      className={
        isArchived
          ? 'project-card card cursor-pointer group opacity-70 bg-slate-50 border-slate-300'
          : 'project-card card cursor-pointer group'
      }
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
          {isArchived ? (
            <div className="mb-2 inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Archived
            </div>
          ) : null}
          <h3 className="project-card-title group-hover:text-duke-800 transition-colors">{project.title}</h3>
          <p
            ref={descriptionRef}
            className="project-card-description mt-2"
            style={{ minHeight: `${descriptionHeight}px` }}
          >
            {project.description}
          </p>
          <div className="mt-2 text-xs text-slate-500" title={project.publishedDateExact || ''}>
            {project.publishedDateLabel}
          </div>
        </div>

        <div className="project-card-rating mt-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Rate project match</div>
            <div className={`text-xs font-bold px-2 py-0.5 rounded ${isArchived ? 'bg-slate-200 text-slate-600' : rating >= 7 ? 'bg-green-100 text-green-700' : rating >= 4 ? 'bg-amber-100 text-amber-700' : rating > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{isGuest ? 'Sign in' : isArchived ? 'Archived' : `${rating || 0}/10`}</div>
          </div>
          <Stars rating={rating} onRate={onRate} disabled={isGuest || rankingsLocked || isArchived} />
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
                : isArchived
                  ? 'Archived projects are not rankable'
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
                : isArchived
                  ? 'btn-secondary opacity-60 cursor-not-allowed flex items-center gap-1.5'
                : rankingsLocked
                  ? 'btn-secondary opacity-60 cursor-not-allowed flex items-center gap-1.5'
                : inCart
                ? `btn-secondary flex items-center gap-1.5 !text-pink-700 !border-pink-200 !bg-pink-50 hover:!bg-pink-100 ${cartAnimClass}`
                : canAddToCart
                  ? `btn-primary flex items-center gap-1.5 ${cartAnimClass}`
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
            ) : isArchived ? (
               <>
                 <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>
                 Archived
               </>
            ) : inCart ? (
               <>
                 <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                 Remove
               </>
            ) : (
               <>
                 <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
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
  const [filtersMobileOpen, setFiltersMobileOpen] = useState(false)
  const [avgMatchScore, setAvgMatchScore] = useState(0)
  const [rankingsLocked, setRankingsLocked] = useState(false)
  const [ratings, setRatings] = useState({})
  const [actionMessage, setActionMessage] = useState('')
  const [cartAnimByProject, setCartAnimByProject] = useState({})
  const [page, setPage] = useState(0)
  const [hasNext, setHasNext] = useState(false)

  function getDefaultCohortValue(cohorts = []) {
    const targetYear = String(new Date().getFullYear() + 1)
    const normalized = (cohorts || [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)

    // Prefer exact year match (e.g., "2027") before looser label matches (e.g., "MIDS 2027").
    const exact = normalized.find((value) => value === targetYear)
    if (exact) return exact

    const includesYear = normalized.find((value) => value.includes(targetYear))
    return includesYear || ''
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
      projectStatus: String(x.project_status || 'published').toLowerCase(),
      createdAt: x.created_at || null,
      publishedDateExact: x.published_at ? new Date(x.published_at).toLocaleString() : '',
      publishedDateLabel: formatPublishedRelative(x.published_at || x.created_at),
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
        const [s, f] = await Promise.all([
          getStats(),
          getFilters(),
        ])
        if (cancelled) return

        const defaultCohort = getDefaultCohortValue(f?.cohorts || [])
        const p = await searchProjects({
          cohort: defaultCohort || undefined,
          limit: FETCH_LIMIT,
          offset: 0,
        })
        if (cancelled) return

        setStats(s)
        setFilters(f)
        setSelectedCohort(defaultCohort)

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

  useEffect(() => {
    if (!actionMessage) return undefined
    const timer = window.setTimeout(() => setActionMessage(''), 3000)
    return () => window.clearTimeout(timer)
  }, [actionMessage])

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
    const project = projects.find((item) => Number(item.id) === Number(projectId))
    if (project?.projectStatus === 'archived') {
      setActionMessage('Archived projects are visible but cannot be selected for ranking.')
      return
    }
    if (!inCart && getRatingValue(projectId) <= 0) {
      setActionMessage('Please rate a project before adding it to Selected Projects.')
      return
    }
    if (!inCart && Number(cart?.selected || 0) >= Number(cart?.limit || 10)) {
      setActionMessage('Not allowed: You can select up to 10 projects.')
      return
    }
    try {
      const animType = inCart ? 'remove' : 'add'
      const updated = inCart ? await removeCartItem(projectId) : await addCartItem({ projectId })
      setCart(updated)
      setActionMessage('')
      setCartAnimByProject((prev) => ({ ...prev, [String(projectId)]: animType }))
      window.setTimeout(() => {
        setCartAnimByProject((prev) => {
          const next = { ...prev }
          delete next[String(projectId)]
          return next
        })
      }, 420)
    } catch (err) {
      setActionMessage(String(err?.message || 'Unable to update selected projects.'))
    }
  }

  function onSignOut() {
    clearAuth()
    setCart({ selected: 0, limit: 10 })
    navigate('/', { replace: true })
  }

  function onOpenProfile() {
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
    const project = projects.find((item) => Number(item.id) === Number(projectId))
    if (project?.projectStatus === 'archived') {
      setActionMessage('Archived projects cannot be rated.')
      return
    }
    const key = String(projectId)
    const previous = Number(ratings[key] || 0)
    setRatings((prev) => ({ ...prev, [key]: Number(value || 0) }))
    try {
      await saveRating({ projectId, rating: value })
      setActionMessage('')
    } catch (err) {
      setRatings((prev) => ({ ...prev, [key]: previous }))
      setActionMessage(String(err?.message || 'Unable to save rating.'))
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        <AppHeader
          showSearch={true}
          searchText={searchText}
          setSearchText={setSearchText}
          onSearch={(query) => {
            setPage(0)
            applySearch({ q: query, pageIndex: 0 })
          }}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <div className="md:hidden mb-4">
              <button 
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 bg-white border border-slate-200 rounded-lg shadow-sm text-sm font-semibold text-duke-900" 
                onClick={() => setFiltersMobileOpen(!filtersMobileOpen)}
              >
                <span>Filters & Logistics</span>
                <span>{filtersMobileOpen ? '▲' : '▼'}</span>
              </button>
            </div>
            <aside className={`w-full md:w-[300px] space-y-4 ${filtersMobileOpen ? 'block' : 'hidden md:block'}`}>
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
                    <div className="text-sm text-slate-500">Welcome {user?.display_name || user?.email || 'Guest'}</div>
                    <div className="text-xl font-heading text-duke-900">Available capstone projects</div>
                    <div className="text-sm text-slate-500 mt-1">
                      Showing <span className="font-semibold">{curatedCount}</span> projects currently available.
                    </div>
                  </div>
                </div>
                <div className="flex w-full md:w-auto mt-2 md:mt-0">
                  <div className="card px-4 py-3 flex gap-4 w-full md:w-auto justify-between md:justify-start">
                    <div className="flex-1">
                      <div className="text-xs text-slate-500">Total Projects</div>
                      <div className="text-xl font-semibold text-duke-900">{stats.active_projects || 0}</div>
                    </div>
                    <div className="border-l border-slate-200 pl-4 flex-1">
                      <div className="text-xs text-slate-500">New This Week</div>
                      <div className="text-xl font-semibold text-duke-900">{stats.new_this_week || 0}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="hidden sm:inline text-sm text-slate-600 shrink-0">Sort by</span>
                <select
                  className="select-base text-xs sm:text-sm py-1.5 pl-2.5 pr-7 h-9 sm:h-10 border-slate-200"
                  value={projectSort}
                  onChange={(event) => {
                    const next = event.target.value
                    setProjectSort(next)
                    setPage(0)
                    applySearch({ sort: next, pageIndex: 0 })
                  }}
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="title-az">A-Z</option>
                  <option value="title-za">Z-A</option>
                </select>
              </div>
              <div className="flex items-center">
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
                      project={{ ...p, cartAnim: cartAnimByProject[String(p.id)] || null }}
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

                <div className="mt-4 flex justify-center md:justify-end">
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
      {actionMessage ? (
        <div className="app-toast fixed bottom-4 right-4 z-[70] max-w-md rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 shadow-lg">
          {actionMessage}
        </div>
      ) : null}
    </div>
  )
}
