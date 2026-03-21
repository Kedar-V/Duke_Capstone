import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  addCartItem,
  getCart,
  getProject,
  getRatings,
  removeCartItem,
  saveRating,
} from '../api'
import footerBadge from '../assets/footer-badge.svg'
import midsLogo from '../assets/mids-logo-white-bg.svg'

function Stars({ rating, onRate }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
        <button
          key={value}
          type="button"
          className={
            value <= rating
              ? 'text-lg transition text-amber-400 hover:scale-110'
              : 'text-lg transition text-slate-300 hover:scale-110'
          }
          aria-label={`Rate ${value} stars`}
          onClick={() => onRate(value)}
        >
          ★
        </button>
      ))}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="card p-6">
      <div className="text-lg font-heading text-duke-900">{title}</div>
      <div className="mt-3 text-slate-700 min-w-0">{children}</div>
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

export default function ProjectDisplayPage() {
  const navigate = useNavigate()
  const { projectId } = useParams()

  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [cart, setCart] = useState({ selected: 0, limit: 10, project_ids: [] })
  const [rating, setRating] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const [p, c, r] = await Promise.all([
          getProject(projectId),
          getCart(),
          getRatings(),
        ])
        if (cancelled) return

        setProject(p)
        setCart(c)
        const found = (r || []).find((x) => x.project_id === projectId)
        setRating(found?.rating || 0)
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load project')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (projectId) load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const inCart = useMemo(() => {
    return Boolean(cart?.project_ids?.includes(projectId))
  }, [cart, projectId])

  async function handleToggleCart() {
    const updated = inCart
      ? await removeCartItem(projectId)
      : await addCartItem({ projectId })
    setCart(updated)
  }

  async function handleRate(value) {
    setRating(value)
    await saveRating({ projectId, rating: value })
  }

  const headerTitle = project?.title || projectId
  const org = project?.organization || projectId

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
        <div className="card p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
                <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate('/projects')}
              >
                Back
              </button>
              <button
                type="button"
                className="inline-flex"
                aria-label="Go to projects"
                onClick={() => navigate('/projects')}
              >
                <img src={midsLogo} alt="MIDS" className="h-9 sm:h-10 md:h-12 w-auto" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="muted">{rating}/10</div>
                <Stars rating={rating} onRate={handleRate} />
              </div>
              <button
                type="button"
                className={inCart ? 'btn-secondary' : 'btn-primary'}
                onClick={handleToggleCart}
              >
                {inCart ? 'Remove from cart' : 'Add to cart'}
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="card p-6 text-slate-600">Loading…</div>
        ) : error ? (
          <div className="card p-6 text-red-700">{error}</div>
        ) : (
          <>
            <div className="card p-6">
              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-2xl font-heading text-duke-900">{headerTitle}</div>
                  <div className="muted mt-1">{org}</div>
                </div>

                {(project?.technical_domains?.length || project?.required_skills?.length) ? (
                  <div className="flex flex-wrap gap-2">
                    {(project?.technical_domains || []).map((t) => (
                      <span key={`d-${t}`} className="pill">{t}</span>
                    ))}
                    {(project?.required_skills || []).slice(0, 12).map((t) => (
                      <span key={`s-${t}`} className="tag">{t}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-6">
                <Section title="Overview">
                  {project?.summary ? (
                    <div className="mb-4">
                      <div className="text-sm font-semibold text-slate-700">Summary</div>
                      <div className="mt-1"><Lines text={project.summary} /></div>
                    </div>
                  ) : null}
                  <div className="text-sm font-semibold text-slate-700">Description</div>
                  <div className="mt-1"><Lines text={project?.description} /></div>
                </Section>

                <Section title="Deliverables">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-700">Minimum deliverables</div>
                      <div className="mt-1"><Lines text={project?.minimum_deliverables} /></div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-700">Stretch goals</div>
                      <div className="mt-1"><Lines text={project?.stretch_goals} /></div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="text-sm font-semibold text-slate-700">Long-term impact</div>
                    <div className="mt-1"><Lines text={project?.long_term_impact} /></div>
                  </div>
                </Section>
              </div>

              <div className="space-y-6">
                <Section title="Requirements">
                  <div className="text-sm font-semibold text-slate-700">Required skills</div>
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
                      <div className="text-sm font-semibold text-slate-700">Other</div>
                      <div className="mt-1"><Lines text={project.required_skills_other} /></div>
                    </div>
                  ) : null}

                  <div className="mt-4 text-sm font-semibold text-slate-700">Data access</div>
                  <div className="mt-1"><Lines text={project?.data_access} /></div>

                  <div className="mt-4 text-sm font-semibold text-slate-700">Sector</div>
                  <div className="mt-1"><Lines text={project?.project_sector} /></div>
                </Section>

                <Section title="Organization">
                  <div className="text-sm"><span className="font-semibold">Industry:</span> {project?.org_industry || '—'}</div>
                  {project?.org_industry_other ? (
                    <div className="text-sm mt-2"><span className="font-semibold">Industry (other):</span> {project.org_industry_other}</div>
                  ) : null}
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
                  <div className="text-sm font-semibold text-slate-700">Documents</div>
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

                  <div className="mt-4 text-sm font-semibold text-slate-700">Video links</div>
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

        <div className="flex justify-start pt-2">
          <img src={footerBadge} alt="© Designed by Kedar Vaidya (Mids 2027)" className="h-7 w-auto" />
        </div>
      </div>
    </div>
  )
}
