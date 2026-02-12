import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  addCartItem,
  getCart,
  getFilters,
  getProjects,
  getStats,
  getUserSummary,
  removeCartItem,
} from '../api'
import { clearAuth, getUser } from '../auth'

function Stars() {
  return (
    <div className="mt-3 flex items-center gap-1">
      <button
        type="button"
        className="text-lg transition text-slate-300 hover:scale-110"
        aria-label="Rate 1 stars"
      >
        ★
      </button>
      <button
        type="button"
        className="text-lg transition text-slate-300 hover:scale-110"
        aria-label="Rate 2 stars"
      >
        ★
      </button>
      <button
        type="button"
        className="text-lg transition text-slate-300 hover:scale-110"
        aria-label="Rate 3 stars"
      >
        ★
      </button>
      <button
        type="button"
        className="text-lg transition text-slate-300 hover:scale-110"
        aria-label="Rate 4 stars"
      >
        ★
      </button>
      <button
        type="button"
        className="text-lg transition text-slate-300 hover:scale-110"
        aria-label="Rate 5 stars"
      >
        ★
      </button>
    </div>
  )
}

function ProjectCard({ project, inCart, onToggleCart }) {
  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="pill">{project.domain}</span>
          <Stars />
          <h3 className="text-lg font-semibold text-duke-900 mt-3">{project.title}</h3>
          <p className="muted mt-2">{project.description}</p>
        </div>
        <div className="text-xs text-slate-500">{project.duration}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {project.tags.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <span className="text-xs text-slate-600">{project.difficulty}</span>
        <span className="text-xs text-slate-600">{project.time}</span>
        <span className="text-xs text-slate-600">{project.modality}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">Sponsored by {project.organization}</div>
        <button
          type="button"
          className={inCart ? 'btn-secondary flex items-center gap-2' : 'btn-primary'}
          onClick={() => onToggleCart(project.id, inCart)}
        >
          {inCart ? 'Remove from cart' : 'Add to cart'}
        </button>
      </div>
    </div>
  )
}

function initialsFor(user) {
  const base = user?.display_name || user?.email || ''
  const parts = base.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export default function CatalogPage() {
  const navigate = useNavigate()
  const user = getUser()

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
  })
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [avgMatchScore, setAvgMatchScore] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [s, p, f] = await Promise.all([
          getStats(),
          getProjects({ limit: 50 }),
          getFilters(),
        ])
        if (cancelled) return

        setStats(s)
        setFilters(f)

        const mapped = p.map((x) => ({
          id: x.id,
          domain: x.domain ?? '',
          title: x.title,
          description: x.description,
          duration: x.duration_weeks ? `${x.duration_weeks} weeks` : '—',
          tags: Array.isArray(x.tags) ? x.tags : [],
          difficulty: x.difficulty ?? '—',
          time:
            x.min_hours_per_week && x.max_hours_per_week
              ? `${x.min_hours_per_week}-${x.max_hours_per_week} hrs/week`
              : '—',
          modality: x.modality ?? '—',
          organization: x.organization ?? '—',
        }))

        setProjects(mapped)

        if (user) {
          const [c, summary] = await Promise.all([getCart(), getUserSummary()])
          if (!cancelled) {
            setCart(c)
            setAvgMatchScore(summary.avg_match_score)
          }
        } else {
          setCart({ selected: 0, limit: 10 })
          setAvgMatchScore(0)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const curatedCount = useMemo(() => projects.length, [projects])

  async function handleToggleCart(projectId, inCart) {
    if (!user) {
      navigate('/login')
      return
    }
    const updated = inCart ? await removeCartItem(projectId) : await addCartItem({ projectId })
    setCart(updated)
  }

  function onAvatarClick() {
    if (!user) {
      navigate('/login')
      return
    }
    clearAuth()
    setCart({ selected: 0, limit: 10 })
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        <div className="card p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-heading text-duke-900">Capstone Projects</h1>
              <p className="muted mt-1">Explore capstone opportunities tailored to your skills.</p>
            </div>
            <div className="flex items-center gap-3 relative">
              <button
                type="button"
                className="h-10 w-10 rounded-full border border-slate-200 bg-white text-slate-600 flex items-center justify-center text-lg"
                aria-label="Open menu"
                onClick={() => setMenuOpen((v) => !v)}
              >
                ☰
              </button>
              {menuOpen ? (
                <div className="absolute right-0 top-12 w-56 rounded-card border border-slate-200 bg-white shadow-sm p-2 z-10">
                  <div className="text-xs uppercase tracking-wide text-slate-400 px-2 py-1">
                    Sections
                  </div>
                  {["Teammate Choices", "Projects", "Rankings"].map((label) => (
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
              ) : null}
              <div className="relative w-full md:w-[420px]">
                <input
                  className="input-base pl-10"
                  placeholder="Try: ‘ML projects with NLP focus’ or ‘Sustainability analytics’..."
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔎</span>
              </div>
              <button
                type="button"
                className="h-10 w-10 rounded-full bg-duke-900 text-white flex items-center justify-center font-semibold"
                aria-label={user ? 'Account (click to sign out)' : 'Sign in'}
                title={user ? 'Sign out' : 'Sign in'}
                onClick={onAvatarClick}
              >
                {initialsFor(user)}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <aside className="w-full md:w-[300px] space-y-4">
              <div className="card p-4">
                <h2 className="text-lg font-heading text-duke-900">Filters</h2>
                <p className="muted mt-1">Refine results by skill and logistics.</p>
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
                              className="px-3 py-1 rounded-full border border-duke-700 text-duke-700 text-sm"
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
                              className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm"
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
                        <select className="select-base">
                          {filters.industries.map((industry) => (
                            <option key={industry}>{industry}</option>
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
                <div>
                  <div className="text-sm text-slate-500">Welcome {user?.display_name || user?.email || '<PRIVATE_PERSON>'}</div>
                  <div className="text-xl font-heading text-duke-900">Your curated capstone list</div>
                  <div className="text-sm text-slate-500 mt-1">
                    Showing <span className="font-semibold">{curatedCount}</span> curated projects based on your profile.
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="card px-4 py-3">
                    <div className="text-xs text-slate-500">Average match</div>
                    <div className="text-2xl font-semibold text-duke-900">{avgMatchScore}%</div>
                  </div>
                  <div className="card px-4 py-3">
                    <div className="text-xs text-slate-500">Selected</div>
                    <div className="text-2xl font-semibold text-duke-900">
                      {cart.selected} / {cart.limit}
                    </div>
                    <button
                      type="button"
                      className="btn-primary mt-2"
                      onClick={() => navigate('/rankings')}
                    >
                      Go to selected projects
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">
                {stats.active_projects} active • {stats.new_this_week} new this week
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">Sort by</span>
                <select className="select-base">
                  <option>Best match</option>
                  <option>Newest</option>
                  <option>Highest rated</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="card p-6 text-slate-600">Loading…</div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {projects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    inCart={cart.project_ids?.includes(p.id)}
                    onToggleCart={handleToggleCart}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
