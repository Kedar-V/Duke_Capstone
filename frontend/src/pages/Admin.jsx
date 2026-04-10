import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  adminActivateAssignmentRule,
  adminCreateAssignmentRule,
  adminGetActiveAssignmentRule,
  adminGetSavedAssignmentRun,
  adminListAssignmentRules,
  adminListSavedAssignmentRuns,
  adminListPartnerPreferences,
  adminPreviewAssignmentRule,
  adminSaveAssignmentRun,
  adminCreateCompany,
  adminCreateCohort,
  adminCreateProject,
  adminCreateUser,
  adminDeleteCompany,
  adminUpdateCohort,
  adminUpdateCompany,
  adminUpdateUser,
  adminDeleteCohort,
  adminDeleteProject,
  adminGetUnresolvedProjectCommentCount,
  adminExportPartnerPreferencesCsv,
  adminListProjectComments,
  adminExportRankingSubmissionsCsv,
  adminListRankingSubmissions,
  adminUploadCohortStudentsCsv,
  adminDeleteUser,
  adminListCohorts,
  adminListCompanies,
  adminListProjects,
  adminListUsers,
  adminUpdateAssignmentRule,
  adminUpdateProjectCommentStatus,
  adminUpdateProject,
} from '../api'
import { getUser } from '../auth'
import AppHeader from '../components/AppHeader'
import { DEFAULT_PROFILE_IMAGE_URL, resolveProfileImageUrl } from '../profileImage'

const roleOptions = ['student', 'admin', 'faculty', 'client']

function toDateTimeLocalValue(isoText) {
  if (!isoText) return ''
  const value = new Date(isoText)
  if (Number.isNaN(value.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`
}

function toIsoOrNull(localValue) {
  if (!localValue) return null
  const parsed = new Date(localValue)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function partitionTeamSizes(total, minSize, maxSize, targetSize) {
  if (!Number.isFinite(total) || total <= 0) return []
  if (total <= maxSize) return [total]

  const minTeams = Math.max(1, Math.ceil(total / maxSize))
  const maxTeams = Math.max(1, Math.floor(total / minSize))
  if (minTeams > maxTeams) {
    const chunks = []
    let remaining = total
    while (remaining > 0) {
      const size = Math.min(maxSize, remaining)
      chunks.push(size)
      remaining -= size
    }
    return chunks
  }

  const preferred = Math.round(total / Math.max(1, targetSize))
  const teamCount = Math.max(minTeams, Math.min(maxTeams, preferred))
  const base = Math.floor(total / teamCount)
  const remainder = total % teamCount
  return Array.from({ length: teamCount }, (_, idx) => (idx < remainder ? base + 1 : base))
}

function PartnerNetwork3D({ graph, onNodeSelect, canvasClassName = 'h-[460px] w-full rounded border border-slate-100 bg-slate-50' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!graph?.nodes?.length) return undefined
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    const nodeCount = graph.nodes.length
    const idToIndex = new Map(graph.nodes.map((node, idx) => [node.id, idx]))
    const points = graph.nodes.map((node, idx) => {
      // Fibonacci sphere gives even-ish spread for 3D node placement.
      const t = nodeCount <= 1 ? 0 : idx / (nodeCount - 1)
      const phi = Math.acos(1 - 2 * t)
      const theta = Math.PI * (1 + Math.sqrt(5)) * idx
      const r = 130
      return {
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.cos(phi),
        z: r * Math.sin(phi) * Math.sin(theta),
        degree: node.degree || 0,
        label: node.label,
        imageUrl: node.imageUrl || '',
      }
    })

    const nodeImages = points.map((point) => {
      const src = String(point.imageUrl || '').trim()
      if (!src) return null
      const image = new Image()
      image.src = src
      return image
    })

    const edges = graph.edges
      .map((edge) => {
        const s = idToIndex.get(edge.source)
        const t = idToIndex.get(edge.target)
        if (s == null || t == null) return null
        return { source: s, target: t, type: edge.type }
      })
      .filter(Boolean)

    const state = {
      width: 0,
      height: 0,
      rx: -0.2,
      ry: 0.35,
      zoom: 1,
      dragging: false,
      moved: false,
      lastX: 0,
      lastY: 0,
      hovered: null,
      frame: 0,
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      state.width = Math.max(1, Math.floor(rect.width))
      state.height = Math.max(1, Math.floor(rect.height))
      canvas.width = Math.floor(state.width * dpr)
      canvas.height = Math.floor(state.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const rotatePoint = (p) => {
      const cY = Math.cos(state.ry)
      const sY = Math.sin(state.ry)
      const x1 = p.x * cY - p.z * sY
      const z1 = p.x * sY + p.z * cY

      const cX = Math.cos(state.rx)
      const sX = Math.sin(state.rx)
      const y2 = p.y * cX - z1 * sX
      const z2 = p.y * sX + z1 * cX

      return { x: x1, y: y2, z: z2 }
    }

    const render = () => {
      ctx.clearRect(0, 0, state.width, state.height)

      const cx = state.width / 2
      const cy = state.height / 2
      const focal = 360

      const projected = points.map((p, idx) => {
        const r = rotatePoint(p)
        const depth = focal / (focal + r.z + 220)
        const scaledDepth = depth * state.zoom
        return {
          idx,
          x: cx + r.x * scaledDepth,
          y: cy + r.y * scaledDepth,
          z: r.z,
          depth: scaledDepth,
          degree: p.degree,
          label: p.label,
        }
      })

      for (const edge of edges) {
        const s = projected[edge.source]
        const t = projected[edge.target]
        const alpha = Math.max(0.18, Math.min(0.85, (s.depth + t.depth) * 0.5))
        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(t.x, t.y)
        ctx.strokeStyle = edge.type === 'want' ? `rgba(16,185,129,${alpha})` : `rgba(244,63,94,${alpha})`
        ctx.lineWidth = edge.type === 'want' ? 2 : 1.6
        if (edge.type === 'avoid') {
          ctx.setLineDash([5, 4])
        } else {
          ctx.setLineDash([])
        }
        ctx.stroke()
      }
      ctx.setLineDash([])

      projected.sort((a, b) => a.z - b.z)
      for (const node of projected) {
        const radius = Math.max(4, Math.min(11, 5 + node.degree * 0.5)) * node.depth
        const isHover = state.hovered === node.idx

        ctx.beginPath()
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = '#e2e8f0'
        ctx.fill()

        const image = nodeImages[node.idx]
        if (image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
          ctx.save()
          ctx.beginPath()
          ctx.arc(node.x, node.y, radius - 0.8, 0, Math.PI * 2)
          ctx.clip()
          const size = (radius - 0.8) * 2
          ctx.drawImage(image, node.x - size / 2, node.y - size / 2, size, size)
          ctx.restore()
        } else {
          ctx.beginPath()
          ctx.arc(node.x, node.y, radius - 0.8, 0, Math.PI * 2)
          ctx.fillStyle = isHover ? '#1d4ed8' : '#1e3a8a'
          ctx.fill()
        }

        ctx.lineWidth = 1.2
        ctx.strokeStyle = isHover ? 'rgba(30,58,138,0.95)' : 'rgba(255,255,255,0.95)'
        ctx.stroke()
      }

      if (state.hovered != null) {
        const hoveredNode = projected.find((n) => n.idx === state.hovered)
        if (hoveredNode) {
          const text = hoveredNode.label
          ctx.font = '12px ui-sans-serif, system-ui, -apple-system, Segoe UI'
          const padding = 6
          const textW = ctx.measureText(text).width
          const boxW = textW + padding * 2
          const boxH = 22
          const x = Math.min(Math.max(8, hoveredNode.x + 10), state.width - boxW - 8)
          const y = Math.min(Math.max(8, hoveredNode.y - boxH - 10), state.height - boxH - 8)
          ctx.fillStyle = 'rgba(15,23,42,0.88)'
          ctx.fillRect(x, y, boxW, boxH)
          ctx.fillStyle = '#f8fafc'
          ctx.fillText(text, x + padding, y + 15)
        }
      }

      if (!state.dragging) {
        state.ry += 0.0025
      }
      state.frame = requestAnimationFrame(render)
    }

    const findHoveredNode = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect()
      const mx = clientX - rect.left
      const my = clientY - rect.top

      const cx = state.width / 2
      const cy = state.height / 2
      const focal = 360

      let best = null
      for (let i = 0; i < points.length; i += 1) {
        const r = rotatePoint(points[i])
        const depth = focal / (focal + r.z + 220)
        const scaledDepth = depth * state.zoom
        const px = cx + r.x * scaledDepth
        const py = cy + r.y * scaledDepth
        const radius = Math.max(4, Math.min(11, 5 + points[i].degree * 0.5)) * scaledDepth
        const dx = mx - px
        const dy = my - py
        const d2 = dx * dx + dy * dy
        if (d2 <= radius * radius * 1.8) {
          if (!best || d2 < best.d2) {
            best = { idx: i, d2 }
          }
        }
      }
      state.hovered = best ? best.idx : null
    }

    const onPointerDown = (e) => {
      state.dragging = true
      state.moved = false
      state.lastX = e.clientX
      state.lastY = e.clientY
      canvas.style.cursor = 'grabbing'
      canvas.setPointerCapture?.(e.pointerId)
    }

    const onPointerMove = (e) => {
      if (state.dragging) {
        const dx = e.clientX - state.lastX
        const dy = e.clientY - state.lastY
        if (Math.abs(dx) + Math.abs(dy) > 0.5) state.moved = true
        state.lastX = e.clientX
        state.lastY = e.clientY
        state.ry += dx * 0.008
        state.rx += dy * 0.008
        state.rx = Math.max(-1.35, Math.min(1.35, state.rx))
      }
      findHoveredNode(e.clientX, e.clientY)
    }

    const onPointerUp = (e) => {
      if (!state.moved && state.hovered != null) {
        const selectedNode = graph.nodes[state.hovered]
        if (selectedNode?.id != null) {
          onNodeSelect?.(selectedNode.id)
        }
      }
      state.dragging = false
      canvas.style.cursor = 'grab'
      canvas.releasePointerCapture?.(e.pointerId)
    }

    const onPointerLeave = () => {
      state.dragging = false
      state.hovered = null
      canvas.style.cursor = 'grab'
    }

    const onWheel = (e) => {
      e.preventDefault()
      const scale = e.deltaY > 0 ? 0.88 : 1.12
      state.zoom = Math.max(0.35, Math.min(8, state.zoom * scale))
    }

    resize()
    canvas.style.cursor = 'grab'
    render()

    window.addEventListener('resize', resize)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      cancelAnimationFrame(state.frame)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [graph, onNodeSelect])

  if (!graph?.nodes?.length) {
    return <div className="text-xs text-slate-400 py-6 text-center">No graph data yet.</div>
  }

  return (
    <div>
      <canvas ref={canvasRef} className={canvasClassName} />
      <div className="mt-2 text-[11px] text-slate-500">Drag to rotate. Scroll to zoom. Hover nodes for labels. Click a node for details.</div>
    </div>
  )
}

export default function AdminPage() {
  const navigate = useNavigate()
  const user = getUser()

  const [cohorts, setCohorts] = useState([])
  const [companies, setCompanies] = useState([])
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [assignmentRules, setAssignmentRules] = useState([])
  const [activeAssignmentRule, setActiveAssignmentRule] = useState(null)
  const [rulesCohortId, setRulesCohortId] = useState('')
  const [ruleFormCohortId, setRuleFormCohortId] = useState('')
  const [rulesLoading, setRulesLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewResult, setPreviewResult] = useState(null)
  const [savedAssignmentRuns, setSavedAssignmentRuns] = useState([])
  const [savingAssignmentRun, setSavingAssignmentRun] = useState(false)
  const [manualPreassignments, setManualPreassignments] = useState([])
  const [manualStudentId, setManualStudentId] = useState('')
  const [manualProjectId, setManualProjectId] = useState('')
  const [dragStudentUserId, setDragStudentUserId] = useState(null)
  const [partnerPreferences, setPartnerPreferences] = useState([])
  const [partnerCohortId, setPartnerCohortId] = useState('')
  const [partnerIncludeComments, setPartnerIncludeComments] = useState(true)
  const [partnerFilterMode, setPartnerFilterMode] = useState('all')
  const [selectedGraphUserId, setSelectedGraphUserId] = useState(null)
  const [partnerGraphExpanded, setPartnerGraphExpanded] = useState(false)
  const [partnerLoading, setPartnerLoading] = useState(false)
  const [rankingSubmissions, setRankingSubmissions] = useState([])
  const [rankingCohortId, setRankingCohortId] = useState('')
  const [rankingSubmittedOnly, setRankingSubmittedOnly] = useState(false)
  const [rankingLoading, setRankingLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('assignment-rules')

  const [cohortName, setCohortName] = useState('')
  const [cohortProgram, setCohortProgram] = useState('')
  const [cohortYear, setCohortYear] = useState('')
  const [cohortEditableUntil, setCohortEditableUntil] = useState('')
  const [editingCohortId, setEditingCohortId] = useState(null)
  const [uploadCohortId, setUploadCohortId] = useState('')
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadInputKey, setUploadInputKey] = useState(0)
  const [uploadingCsv, setUploadingCsv] = useState(false)
  const [uploadSummary, setUploadSummary] = useState(null)

  const [userEmail, setUserEmail] = useState('')
  const [userPassword, setUserPassword] = useState('')
  const [userDisplayName, setUserDisplayName] = useState('')
  const [userProfileImageUrl, setUserProfileImageUrl] = useState('')
  const [userRole, setUserRole] = useState('student')
  const [userProgramShorthand, setUserProgramShorthand] = useState('')
  const [userFacultyDepartment, setUserFacultyDepartment] = useState('')
  const [userFacultyTitle, setUserFacultyTitle] = useState('')
  const [userCohortId, setUserCohortId] = useState('')
  const [editingUserId, setEditingUserId] = useState(null)
  const [userSaving, setUserSaving] = useState(false)
  const [userFormError, setUserFormError] = useState('')

  const [projectTitle, setProjectTitle] = useState('')
  const [projectSlug, setProjectSlug] = useState('')
  const [projectSlugTouched, setProjectSlugTouched] = useState(false)
  const [projectSummary, setProjectSummary] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [projectMinimumDeliverables, setProjectMinimumDeliverables] = useState('')
  const [projectStretchGoals, setProjectStretchGoals] = useState('')
  const [projectLongTermImpact, setProjectLongTermImpact] = useState('')
  const [projectScopeClarity, setProjectScopeClarity] = useState('')
  const [projectScopeClarityOther, setProjectScopeClarityOther] = useState('')
  const [projectPublicationPotential, setProjectPublicationPotential] = useState('')
  const [projectDataAccess, setProjectDataAccess] = useState('')
  const [projectCoverImageUrl, setProjectCoverImageUrl] = useState('')
  const [projectContactName, setProjectContactName] = useState('')
  const [projectContactEmail, setProjectContactEmail] = useState('')
  const [projectSkills, setProjectSkills] = useState('')
  const [projectSkillsOther, setProjectSkillsOther] = useState('')
  const [projectDomains, setProjectDomains] = useState('')
  const [projectSupplementaryDocuments, setProjectSupplementaryDocuments] = useState('')
  const [projectVideoLinks, setProjectVideoLinks] = useState('')
  const [projectCohortId, setProjectCohortId] = useState('')
  const [projectCompanyId, setProjectCompanyId] = useState('')
  const [projectStatus, setProjectStatus] = useState('draft')
  const [editingProjectId, setEditingProjectId] = useState(null)

  const [companyName, setCompanyName] = useState('')
  const [companySector, setCompanySector] = useState('')
  const [companyIndustry, setCompanyIndustry] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [companyLogoUrl, setCompanyLogoUrl] = useState('')
  const [editingCompanyId, setEditingCompanyId] = useState(null)

  const [editingRuleId, setEditingRuleId] = useState(null)
  const [ruleExplainOpen, setRuleExplainOpen] = useState(false)
  const [ruleExplainItem, setRuleExplainItem] = useState(null)
  const [ruleName, setRuleName] = useState('')
  const [ruleIsActive, setRuleIsActive] = useState(true)
  const [ruleTeamSize, setRuleTeamSize] = useState('4')
  const [ruleEnforceSameCohort, setRuleEnforceSameCohort] = useState(true)
  const [ruleHardAvoid, setRuleHardAvoid] = useState(true)
  const [ruleMaxLowPreference, setRuleMaxLowPreference] = useState('1')
  const [ruleWeightProjectPreference, setRuleWeightProjectPreference] = useState('55')
  const [ruleWeightProjectRating, setRuleWeightProjectRating] = useState('15')
  const [ruleWeightMutualWant, setRuleWeightMutualWant] = useState('25')
  const [rulePenaltyAvoid, setRulePenaltyAvoid] = useState('100')
  const [ruleNotes, setRuleNotes] = useState('')
  const [ruleFormError, setRuleFormError] = useState('')
  const [ruleFlowOpen, setRuleFlowOpen] = useState(false)
  const [ruleFlowStep, setRuleFlowStep] = useState(1)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [commentBellOpen, setCommentBellOpen] = useState(false)
  const [unresolvedCommentCount, setUnresolvedCommentCount] = useState(0)
  const [recentProjectComments, setRecentProjectComments] = useState([])
  const [selectedProjectComments, setSelectedProjectComments] = useState([])
  const [selectedProjectCommentsLoading, setSelectedProjectCommentsLoading] = useState(false)
  const [projectDetailOpen, setProjectDetailOpen] = useState(false)
  const [projectDetailCommentsOpen, setProjectDetailCommentsOpen] = useState(false)
  const [commentActionsLoading, setCommentActionsLoading] = useState(false)

  const menuItems = ['Projects', 'Partners', 'Admin']
  const adminTabs = [
    {
      key: 'assignment-rules',
      label: 'Assignment Rules',
      hint: 'Configure matching constraints and scoring weights.',
      group: 'operations',
    },
    {
      key: 'rankings',
      label: 'Rankings',
      hint: 'Review and export submitted top-10 choices.',
      group: 'operations',
    },
    {
      key: 'team-preferences',
      label: 'Team Preferences',
      hint: 'Review student want/avoid partner selections.',
      group: 'operations',
    },
    {
      key: 'projects',
      label: 'Projects',
      hint: 'Manage client projects and assignments.',
      group: 'data',
    },
    {
      key: 'companies',
      label: 'Companies',
      hint: 'Maintain company profiles and branding.',
      group: 'data',
    },
    {
      key: 'cohorts',
      label: 'Cohorts',
      hint: 'Organize student groups and upload roster data.',
      group: 'data',
    },
    {
      key: 'users',
      label: 'Users',
      hint: 'Provision accounts, roles, and profile settings.',
      group: 'data',
    },
  ]

  const tabGroupMeta = {
    operations: 'Assignment Operations',
    data: 'Data Management',
  }

  const activeTabMeta = useMemo(
    () => adminTabs.find((tab) => tab.key === activeTab) || adminTabs[0],
    [activeTab]
  )

  const groupedAdminTabs = useMemo(() => {
    const groups = { operations: [], data: [] }
    for (const tab of adminTabs) {
      if (!groups[tab.group]) groups[tab.group] = []
      groups[tab.group].push(tab)
    }
    return groups
  }, [adminTabs])

  const [projectQuery, setProjectQuery] = useState('')
  const [companyQuery, setCompanyQuery] = useState('')
  const [userQuery, setUserQuery] = useState('')
  const [cohortQuery, setCohortQuery] = useState('')
  const [rankingQuery, setRankingQuery] = useState('')
  const [partnerQuery, setPartnerQuery] = useState('')

  const [projectSortDir, setProjectSortDir] = useState('asc')
  const [companySortDir, setCompanySortDir] = useState('asc')
  const [userSortDir, setUserSortDir] = useState('asc')
  const [cohortSortDir, setCohortSortDir] = useState('asc')
  const [rankingSortDir, setRankingSortDir] = useState('desc')
  const [projectStatusFilter, setProjectStatusFilter] = useState('all')

  const [panelOpen, setPanelOpen] = useState({
    projectsList: true,
    rulesList: true,
    rulesForm: true,
    rulesRuns: true,
    teamPreferencesList: true,
    companiesList: true,
    companiesForm: true,
    usersList: true,
    usersForm: true,
    cohortsList: true,
    cohortsForm: true,
    rankingsList: true,
  })

  function togglePanel(panelKey) {
    setPanelOpen((prev) => ({ ...prev, [panelKey]: !prev[panelKey] }))
  }

  const projectStatusCounts = useMemo(() => {
    const rows = projects || []
    return {
      all: rows.length,
      published: rows.filter((p) => String(p.project_status || '').toLowerCase() === 'published').length,
      draft: rows.filter((p) => String(p.project_status || '').toLowerCase() === 'draft').length,
      archived: rows.filter((p) => String(p.project_status || '').toLowerCase() === 'archived').length,
    }
  }, [projects])

  const filteredProjects = useMemo(() => {
    const query = projectQuery.trim().toLowerCase()
    const rows = (projects || []).filter((row) => {
      const status = String(row.project_status || 'draft').toLowerCase()
      if (projectStatusFilter !== 'all' && status !== projectStatusFilter) return false
      if (!query) return true
      const text = `${row.project_title || ''} ${row.organization || ''}`.toLowerCase()
      return text.includes(query)
    })
    const sorted = [...rows].sort((a, b) =>
      String(a.project_title || a.organization || '').localeCompare(String(b.project_title || b.organization || ''))
    )
    return projectSortDir === 'asc' ? sorted : sorted.reverse()
  }, [projects, projectQuery, projectSortDir, projectStatusFilter])

  const selectedAdminProject = useMemo(() => {
    if (!editingProjectId) return null
    return (projects || []).find((row) => Number(row.project_id) === Number(editingProjectId)) || null
  }, [projects, editingProjectId])

  const selectedProjectCommentStats = useMemo(() => {
    const total = selectedProjectComments.length
    const resolved = selectedProjectComments.filter((row) => Boolean(row?.is_resolved)).length
    const unresolved = Math.max(0, total - resolved)
    return { total, resolved, unresolved }
  }, [selectedProjectComments])

  const filteredCompanies = useMemo(() => {
    const query = companyQuery.trim().toLowerCase()
    const rows = (companies || []).filter((row) => {
      if (!query) return true
      const text = `${row.name || ''} ${row.sector || ''} ${row.industry || ''} ${row.website || ''}`.toLowerCase()
      return text.includes(query)
    })
    const sorted = [...rows].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    return companySortDir === 'asc' ? sorted : sorted.reverse()
  }, [companies, companyQuery, companySortDir])

  const filteredUsers = useMemo(() => {
    const query = userQuery.trim().toLowerCase()
    const rows = (users || []).filter((row) => {
      if (!query) return true
      const text = `${row.display_name || ''} ${row.email || ''} ${row.role || ''}`.toLowerCase()
      return text.includes(query)
    })
    const sorted = [...rows].sort((a, b) =>
      String(a.display_name || a.email || '').localeCompare(String(b.display_name || b.email || ''))
    )
    return userSortDir === 'asc' ? sorted : sorted.reverse()
  }, [users, userQuery, userSortDir])

  const filteredCohorts = useMemo(() => {
    const query = cohortQuery.trim().toLowerCase()
    const rows = (cohorts || []).filter((row) => {
      if (!query) return true
      const text = `${row.name || ''} ${row.program || ''} ${row.year || ''}`.toLowerCase()
      return text.includes(query)
    })
    const sorted = [...rows].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    return cohortSortDir === 'asc' ? sorted : sorted.reverse()
  }, [cohorts, cohortQuery, cohortSortDir])

  const filteredRankings = useMemo(() => {
    const query = rankingQuery.trim().toLowerCase()
    const rows = (rankingSubmissions || []).filter((row) => {
      if (!query) return true
      const text = `${row.display_name || ''} ${row.email || ''}`.toLowerCase()
      return text.includes(query)
    })
    const sorted = [...rows].sort((a, b) => {
      const da = a.submitted_at ? new Date(a.submitted_at).getTime() : 0
      const db = b.submitted_at ? new Date(b.submitted_at).getTime() : 0
      return da - db
    })
    return rankingSortDir === 'asc' ? sorted : sorted.reverse()
  }, [rankingSubmissions, rankingQuery, rankingSortDir])

  const partnerAnalysis = useMemo(() => {
    const rows = partnerPreferences || []
    const emailToUserId = new Map(
      rows
        .filter((row) => row.email)
        .map((row) => [String(row.email).trim().toLowerCase(), row.user_id])
    )
    const userLabelById = new Map(
      rows.map((row) => [row.user_id, row.display_name || row.email || `User ${row.user_id}`])
    )

    const wantsByUser = new Map()
    const avoidsByUser = new Map()
    const wantedCounts = new Map()
    const avoidedCounts = new Map()

    let totalWants = 0
    let totalAvoids = 0
    let totalChoices = 0
    let commentedChoices = 0

    for (const row of rows) {
      const wants = new Set()
      const avoids = new Set()
      for (const choice of row.want || []) {
        totalWants += 1
        totalChoices += 1
        if ((choice?.comment || '').trim()) commentedChoices += 1
        const wantedKey = (choice?.email || '').trim().toLowerCase() || `student-${choice?.student_id || 'unknown'}`
        wantedCounts.set(wantedKey, {
          label: choice?.full_name || choice?.email || `Student ${choice?.student_id || '?'}`,
          count: (wantedCounts.get(wantedKey)?.count || 0) + 1,
        })
        const targetId = choice?.email ? emailToUserId.get(String(choice.email).trim().toLowerCase()) : undefined
        if (targetId) wants.add(targetId)
      }
      for (const choice of row.avoid || []) {
        totalAvoids += 1
        totalChoices += 1
        if ((choice?.comment || '').trim()) commentedChoices += 1
        const avoidedKey = (choice?.email || '').trim().toLowerCase() || `student-${choice?.student_id || 'unknown'}`
        avoidedCounts.set(avoidedKey, {
          label: choice?.full_name || choice?.email || `Student ${choice?.student_id || '?'}`,
          count: (avoidedCounts.get(avoidedKey)?.count || 0) + 1,
        })
        const targetId = choice?.email ? emailToUserId.get(String(choice.email).trim().toLowerCase()) : undefined
        if (targetId) avoids.add(targetId)
      }
      wantsByUser.set(row.user_id, wants)
      avoidsByUser.set(row.user_id, avoids)
    }

    const statusByUserId = new Map()
    const mutualPairKeys = new Set()
    const conflictPairKeys = new Set()
    for (const row of rows) {
      let hasMutualWant = false
      let hasConflict = false
      const wants = wantsByUser.get(row.user_id) || new Set()
      const avoids = avoidsByUser.get(row.user_id) || new Set()

      for (const targetId of wants) {
        if ((wantsByUser.get(targetId) || new Set()).has(row.user_id)) {
          hasMutualWant = true
          const key = [row.user_id, targetId].sort((a, b) => a - b).join('-')
          mutualPairKeys.add(key)
        }
        if ((avoidsByUser.get(targetId) || new Set()).has(row.user_id)) {
          hasConflict = true
          const key = [row.user_id, targetId].sort((a, b) => a - b).join('-')
          conflictPairKeys.add(key)
        }
      }
      for (const targetId of avoids) {
        if ((wantsByUser.get(targetId) || new Set()).has(row.user_id)) {
          hasConflict = true
          const key = [row.user_id, targetId].sort((a, b) => a - b).join('-')
          conflictPairKeys.add(key)
        }
      }

      statusByUserId.set(row.user_id, { hasMutualWant, hasConflict })
    }

    const studentsWithAny = rows.filter((row) => ((row.want_count || 0) + (row.avoid_count || 0)) > 0).length
    const studentsWithoutAny = Math.max(rows.length - studentsWithAny, 0)
    const studentsWithMutual = [...statusByUserId.values()].filter((entry) => entry.hasMutualWant).length
    const studentsWithConflict = [...statusByUserId.values()].filter((entry) => entry.hasConflict).length

    const topWanted = [...wantedCounts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 5)
    const topAvoided = [...avoidedCounts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 5)

    const mutualPairs = [...mutualPairKeys]
      .map((pairKey) => {
        const [leftId, rightId] = pairKey.split('-').map(Number)
        return {
          pairKey,
          label: `${userLabelById.get(leftId) || `User ${leftId}`} <-> ${userLabelById.get(rightId) || `User ${rightId}`}`,
        }
      })
      .slice(0, 6)

    return {
      statusByUserId,
      totalStudents: rows.length,
      studentsWithAny,
      studentsWithoutAny,
      totalWants,
      totalAvoids,
      averageWantsPerStudent: rows.length ? Number((totalWants / rows.length).toFixed(2)) : 0,
      averageAvoidsPerStudent: rows.length ? Number((totalAvoids / rows.length).toFixed(2)) : 0,
      studentsWithMutual,
      studentsWithConflict,
      mutualPairCount: mutualPairKeys.size,
      conflictPairCount: conflictPairKeys.size,
      commentRate: totalChoices ? Number(((commentedChoices / totalChoices) * 100).toFixed(1)) : 0,
      topWanted,
      topAvoided,
      mutualPairs,
    }
  }, [partnerPreferences])

  const filteredPartnerPreferences = useMemo(() => {
    const query = partnerQuery.trim().toLowerCase()
    let rows = (partnerPreferences || []).filter((row) => {
      if (!query) return true
      const text = `${row.display_name || ''} ${row.email || ''}`.toLowerCase()
      return text.includes(query)
    })

    if (partnerFilterMode === 'no-preferences') {
      rows = rows.filter((row) => (row.want_count || 0) + (row.avoid_count || 0) === 0)
    }
    if (partnerFilterMode === 'high-avoid') {
      rows = rows.filter((row) => (row.avoid_count || 0) >= 2)
    }
    if (partnerFilterMode === 'mutual-want') {
      rows = rows.filter((row) => partnerAnalysis.statusByUserId.get(row.user_id)?.hasMutualWant)
    }
    if (partnerFilterMode === 'conflict') {
      rows = rows.filter((row) => partnerAnalysis.statusByUserId.get(row.user_id)?.hasConflict)
    }

    return [...rows].sort((a, b) => {
      const nameA = String(a.display_name || a.email || '').toLowerCase()
      const nameB = String(b.display_name || b.email || '').toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [partnerPreferences, partnerQuery, partnerFilterMode, partnerAnalysis])

  const partnerSignalSeries = useMemo(() => {
    const totalSignals = partnerAnalysis.totalWants + partnerAnalysis.totalAvoids
    const safeRate = (value) => (totalSignals > 0 ? Math.round((value / totalSignals) * 100) : 0)
    return {
      totalSignals,
      distribution: [
        {
          key: 'want',
          label: 'Want',
          value: partnerAnalysis.totalWants,
          pct: safeRate(partnerAnalysis.totalWants),
          barClass: 'bg-emerald-500',
        },
        {
          key: 'avoid',
          label: 'Avoid',
          value: partnerAnalysis.totalAvoids,
          pct: safeRate(partnerAnalysis.totalAvoids),
          barClass: 'bg-rose-500',
        },
      ],
    }
  }, [partnerAnalysis])

  const partnerConnectionGraph = useMemo(() => {
    const rows = partnerPreferences || []
    const emailToUserId = new Map(
      rows
        .filter((row) => row.email)
        .map((row) => [String(row.email).trim().toLowerCase(), row.user_id])
    )

    const nodeMeta = new Map()
    for (const row of rows) {
      nodeMeta.set(row.user_id, {
        id: row.user_id,
        label: row.display_name || row.email || `User ${row.user_id}`,
        displayName: row.display_name || row.email || `User ${row.user_id}`,
        email: row.email || '',
        profileImageUrl: row.profile_image_url || '',
      })
    }

    const edgeSet = new Set()
    const edges = []
    const degree = new Map()
    const bumpDegree = (id) => degree.set(id, (degree.get(id) || 0) + 1)

    for (const row of rows) {
      for (const choice of row.want || []) {
        const targetId = choice?.email
          ? emailToUserId.get(String(choice.email).trim().toLowerCase())
          : undefined
        if (!targetId || targetId === row.user_id) continue
        const key = `${row.user_id}->${targetId}:want`
        if (edgeSet.has(key)) continue
        edgeSet.add(key)
        edges.push({ source: row.user_id, target: targetId, type: 'want' })
        bumpDegree(row.user_id)
        bumpDegree(targetId)
      }
      for (const choice of row.avoid || []) {
        const targetId = choice?.email
          ? emailToUserId.get(String(choice.email).trim().toLowerCase())
          : undefined
        if (!targetId || targetId === row.user_id) continue
        const key = `${row.user_id}->${targetId}:avoid`
        if (edgeSet.has(key)) continue
        edgeSet.add(key)
        edges.push({ source: row.user_id, target: targetId, type: 'avoid' })
        bumpDegree(row.user_id)
        bumpDegree(targetId)
      }
    }

    const rankedNodeIds = [...nodeMeta.keys()].sort((a, b) => {
      const d = (degree.get(b) || 0) - (degree.get(a) || 0)
      if (d !== 0) return d
      return String(nodeMeta.get(a)?.label || '').localeCompare(String(nodeMeta.get(b)?.label || ''))
    })

    const maxNodes = 18
    const selectedNodeIds = rankedNodeIds.slice(0, maxNodes)
    const selectedSet = new Set(selectedNodeIds)
    const selectedEdges = edges.filter((edge) => selectedSet.has(edge.source) && selectedSet.has(edge.target))

    const nodes = selectedNodeIds.map((id, idx) => {
      const node = nodeMeta.get(id) || {}
      const label = node.label || `User ${id}`
      return {
        id,
        label,
        degree: degree.get(id) || 0,
        rank: idx + 1,
        imageUrl: resolveProfileImageUrl({
          displayName: node.displayName,
          email: node.email,
          profileImageUrl: node.profileImageUrl,
        }),
      }
    })

    const drawableEdges = selectedEdges

    return {
      nodes,
      edges: drawableEdges,
      hiddenNodes: Math.max(nodeMeta.size - nodes.length, 0),
      hiddenEdges: Math.max(edges.length - drawableEdges.length, 0),
    }
  }, [partnerPreferences])

  const selectedGraphProfile = useMemo(() => {
    if (selectedGraphUserId == null) return null

    const rows = partnerPreferences || []
    const selectedRow = rows.find((row) => row.user_id === selectedGraphUserId)
    if (!selectedRow) return null

    const selectedEmail = String(selectedRow.email || '').trim().toLowerCase()
    const rowsByEmail = new Map(
      rows
        .filter((row) => row.email)
        .map((row) => [String(row.email).trim().toLowerCase(), row])
    )

    const displayForRow = (row) => row?.display_name || row?.email || `User ${row?.user_id || '?'}`
    const displayForChoice = (choice) => choice?.full_name || choice?.email || `Student ${choice?.student_id || '?'}`

    const toOutgoingItem = (choice) => {
      const choiceEmail = String(choice?.email || '').trim().toLowerCase()
      const target = choiceEmail ? rowsByEmail.get(choiceEmail) : undefined
      return {
        label: displayForChoice(choice),
        email: choice?.email || '',
        profileImageUrl: choice?.profile_image_url || target?.profile_image_url || '',
        comment: (choice?.comment || '').trim(),
        userId: target?.user_id ?? null,
      }
    }

    const outgoingWants = (selectedRow.want || []).map(toOutgoingItem)
    const outgoingAvoids = (selectedRow.avoid || []).map(toOutgoingItem)

    const incomingWants = []
    const incomingAvoids = []
    if (selectedEmail) {
      for (const row of rows) {
        if (row.user_id === selectedRow.user_id) continue
        for (const choice of row.want || []) {
          const choiceEmail = String(choice?.email || '').trim().toLowerCase()
          if (choiceEmail && choiceEmail === selectedEmail) {
            incomingWants.push({
              label: displayForRow(row),
              email: row.email || '',
              profileImageUrl: row.profile_image_url || '',
              comment: (choice?.comment || '').trim(),
              userId: row.user_id,
            })
          }
        }
        for (const choice of row.avoid || []) {
          const choiceEmail = String(choice?.email || '').trim().toLowerCase()
          if (choiceEmail && choiceEmail === selectedEmail) {
            incomingAvoids.push({
              label: displayForRow(row),
              email: row.email || '',
              profileImageUrl: row.profile_image_url || '',
              comment: (choice?.comment || '').trim(),
              userId: row.user_id,
            })
          }
        }
      }
    }

    const incomingWantIds = new Set(incomingWants.map((item) => item.userId).filter((id) => id != null))
    const incomingAvoidIds = new Set(incomingAvoids.map((item) => item.userId).filter((id) => id != null))
    const outgoingWantIds = new Set(outgoingWants.map((item) => item.userId).filter((id) => id != null))
    const outgoingAvoidIds = new Set(outgoingAvoids.map((item) => item.userId).filter((id) => id != null))

    let mutualWantConnections = 0
    let conflictConnections = 0
    for (const id of outgoingWantIds) {
      if (incomingWantIds.has(id)) mutualWantConnections += 1
      if (incomingAvoidIds.has(id)) conflictConnections += 1
    }
    for (const id of outgoingAvoidIds) {
      if (incomingWantIds.has(id)) conflictConnections += 1
    }

    const status = partnerAnalysis.statusByUserId.get(selectedRow.user_id) || {}

    return {
      userId: selectedRow.user_id,
      displayName: selectedRow.display_name || selectedRow.email || `User ${selectedRow.user_id}`,
      email: selectedRow.email || '',
      profileImageUrl: selectedRow.profile_image_url || '',
      wantCount: selectedRow.want_count || outgoingWants.length,
      avoidCount: selectedRow.avoid_count || outgoingAvoids.length,
      outgoingWants,
      outgoingAvoids,
      incomingWants,
      incomingAvoids,
      hasMutualWant: Boolean(status.hasMutualWant),
      hasConflict: Boolean(status.hasConflict),
      mutualWantConnections,
      conflictConnections,
    }
  }, [selectedGraphUserId, partnerPreferences, partnerAnalysis])

  useEffect(() => {
    if (selectedGraphUserId == null) return
    if (!(partnerPreferences || []).some((row) => row.user_id === selectedGraphUserId)) {
      setSelectedGraphUserId(null)
    }
  }, [partnerPreferences, selectedGraphUserId])

  useEffect(() => {
    if (!selectedGraphProfile) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedGraphUserId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedGraphProfile])

  const filteredAssignmentRules = useMemo(() => {
    return [...(assignmentRules || [])].sort((a, b) => {
      if (a.is_active && !b.is_active) return -1
      if (!a.is_active && b.is_active) return 1
      const da = a.updated_at ? new Date(a.updated_at).getTime() : 0
      const db = b.updated_at ? new Date(b.updated_at).getTime() : 0
      return db - da
    })
  }, [assignmentRules])

  const assignmentScopeCohortId = useMemo(() => {
    const explicit = ruleFormCohortId || rulesCohortId
    if (explicit) return Number(explicit)
    return activeAssignmentRule?.cohort_id ?? null
  }, [ruleFormCohortId, rulesCohortId, activeAssignmentRule])

  const assignmentStudents = useMemo(() => {
    return (users || [])
      .filter((row) => row.role === 'student')
      .filter((row) => {
        if (!assignmentScopeCohortId) return true
        return Number(row.cohort_id || 0) === Number(assignmentScopeCohortId)
      })
      .sort((a, b) => String(a.display_name || a.email || '').localeCompare(String(b.display_name || b.email || '')))
  }, [users, assignmentScopeCohortId])

  const assignmentProjects = useMemo(() => {
    return (projects || [])
      .filter((row) => String(row.project_status || '').toLowerCase() === 'published')
      .filter((row) => {
        if (!assignmentScopeCohortId) return true
        return Number(row.cohort_id || 0) === Number(assignmentScopeCohortId)
      })
      .sort((a, b) => String(a.project_title || a.organization || '').localeCompare(String(b.project_title || b.organization || '')))
  }, [projects, assignmentScopeCohortId])

  useEffect(() => {
    const allowedUsers = new Set(assignmentStudents.map((row) => Number(row.id)))
    const allowedProjects = new Set(assignmentProjects.map((row) => Number(row.project_id)))
    setManualPreassignments((prev) => prev.filter((row) => allowedUsers.has(Number(row.user_id)) && allowedProjects.has(Number(row.project_id))))
  }, [assignmentStudents, assignmentProjects])

  function addManualPreassignment() {
    const userId = Number(manualStudentId)
    const projectId = Number(manualProjectId)
    if (!userId || !projectId) return

    setManualPreassignments((prev) => {
      const withoutUser = prev.filter((row) => Number(row.user_id) !== userId)
      return [...withoutUser, { user_id: userId, project_id: projectId }]
    })
    setManualStudentId('')
    setManualProjectId('')
  }

  function removeManualPreassignment(userId) {
    setManualPreassignments((prev) => prev.filter((row) => Number(row.user_id) !== Number(userId)))
  }

  function movePreviewStudent(userId, targetProjectId) {
    setPreviewResult((prev) => {
      if (!prev || !Array.isArray(prev.project_assignments)) return prev
      const minSize = Number(prev.min_team_size || 3)
      const maxSize = Number(prev.max_team_size || 5)
      const targetSize = Number(prev.team_size || 4)

      const projectCopies = prev.project_assignments.map((project) => ({
        ...project,
        teams: Array.isArray(project.teams)
          ? project.teams.map((team) => (Array.isArray(team) ? [...team] : []))
          : [],
      }))

      let movingMember = null
      for (const project of projectCopies) {
        for (const team of project.teams) {
          const idx = team.findIndex((member) => Number(member.user_id) === Number(userId))
          if (idx >= 0) {
            movingMember = team.splice(idx, 1)[0]
            break
          }
        }
        project.teams = project.teams.filter((team) => team.length > 0)
        project.assigned_count = project.teams.reduce((acc, team) => acc + team.length, 0)
        if (movingMember) break
      }

      if (!movingMember) return prev

      const targetProject = projectCopies.find((project) => Number(project.project_id) === Number(targetProjectId))
      if (!targetProject) return prev

      const flatMembers = targetProject.teams.flat().concat([movingMember])
      const nextTeamSizes = partitionTeamSizes(flatMembers.length, minSize, maxSize, targetSize)
      const rebuiltTeams = []
      let start = 0
      for (const size of nextTeamSizes) {
        rebuiltTeams.push(flatMembers.slice(start, start + size))
        start += size
      }

      targetProject.teams = rebuiltTeams
      targetProject.assigned_count = flatMembers.length

      return {
        ...prev,
        project_assignments: projectCopies,
        unassigned_count: Math.max(0, Number(prev.total_students || 0) - projectCopies.reduce((acc, p) => acc + Number(p.assigned_count || 0), 0)),
      }
    })
  }

  function navigateSection(label) {
    setMenuOpen(false)
    setAccountOpen(false)
    setCommentBellOpen(false)
    if (label === 'Partners') navigate('/partners')
    if (label === 'Projects') navigate('/projects')
    if (label === 'Rankings') { import('../events').then(m => m.emit('toggle_cart_drawer')); return }
    if (label === 'Admin') navigate('/admin')
  }

  function onSignOut() {
    setAccountOpen(false)
    setCommentBellOpen(false)
    clearAuth()
    navigate('/login', { replace: true })
  }

  function slugify(value) {
    return (value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/projects')
      return
    }

    refreshAll({ clearFlash: true })
  }, [user?.id])

  const selectedProjectCompanyName = useMemo(() => {
    const selectedId = projectCompanyId ? Number(projectCompanyId) : null
    const selectedCompany = (companies || []).find((c) => c.id === selectedId)
    return selectedCompany?.name || ''
  }, [projectCompanyId, companies])

  useEffect(() => {
    if (projectSlugTouched) return
    const base = projectTitle || selectedProjectCompanyName
    setProjectSlug(base ? slugify(base) : '')
  }, [projectTitle, selectedProjectCompanyName, projectSlugTouched])

  function resetFlash() {
    setError('')
    setSuccess('')
  }

  function resetUploadState() {
    setUploadFile(null)
    setUploadSummary(null)
    setUploadInputKey((k) => k + 1)
  }

  async function refreshAll({ clearFlash = false } = {}) {
    if (clearFlash) resetFlash()
    try {
      const [c, co, u, p] = await Promise.all([
        adminListCohorts(),
        adminListCompanies(),
        adminListUsers(),
        adminListProjects(),
      ])
      setCohorts(c)
      setCompanies(co)
      setUsers(u)
      setProjects(p)
      await refreshAssignmentRules(undefined, { clearFlash: false })
      const submissions = await adminListRankingSubmissions({ submittedOnly: rankingSubmittedOnly })
      setRankingSubmissions(submissions)
      const prefs = await adminListPartnerPreferences({
        cohortId: partnerCohortId ? Number(partnerCohortId) : undefined,
        includeComments: partnerIncludeComments,
      })
      setPartnerPreferences(prefs)
      await refreshProjectCommentNotifications()
    } catch (err) {
      setError(String(err?.message || 'Failed to load admin data'))
    }
  }

  async function refreshProjectCommentNotifications() {
    try {
      const [countOut, recent] = await Promise.all([
        adminGetUnresolvedProjectCommentCount(),
        adminListProjectComments({ limit: 20 }),
      ])
      setUnresolvedCommentCount(Number(countOut?.unresolved_count || 0))
      setRecentProjectComments(Array.isArray(recent) ? recent : [])
    } catch {
      setUnresolvedCommentCount(0)
      setRecentProjectComments([])
    }
  }

  async function refreshSelectedProjectComments(projectId = editingProjectId) {
    if (!projectId) {
      setSelectedProjectComments([])
      return
    }
    setSelectedProjectCommentsLoading(true)
    try {
      const rows = await adminListProjectComments({ projectId: Number(projectId), limit: 100 })
      setSelectedProjectComments(Array.isArray(rows) ? rows : [])
    } catch {
      setSelectedProjectComments([])
    } finally {
      setSelectedProjectCommentsLoading(false)
    }
  }

  async function handleUpdateProjectComment(commentId, isResolved) {
    if (!commentId) return
    setCommentActionsLoading(true)
    try {
      await adminUpdateProjectCommentStatus(commentId, { isResolved })
      await refreshProjectCommentNotifications()
      await refreshSelectedProjectComments()
      setSuccess(isResolved ? 'Comment marked resolved.' : 'Comment marked unresolved.')
    } catch (err) {
      setError(String(err?.message || 'Failed to update comment status'))
    } finally {
      setCommentActionsLoading(false)
    }
  }

  async function refreshRankingSubmissions(
    nextCohortId = rankingCohortId,
    nextSubmittedOnly = rankingSubmittedOnly
  ) {
    setRankingLoading(true)
    try {
      const rows = await adminListRankingSubmissions({
        submittedOnly: nextSubmittedOnly,
        cohortId: nextCohortId ? Number(nextCohortId) : undefined,
      })
      setRankingSubmissions(rows)
    } catch (err) {
      setError(String(err?.message || 'Failed to load ranking submissions'))
    } finally {
      setRankingLoading(false)
    }
  }

  async function refreshPartnerPreferences(
    nextCohortId = partnerCohortId,
    nextIncludeComments = partnerIncludeComments
  ) {
    setPartnerLoading(true)
    try {
      const rows = await adminListPartnerPreferences({
        cohortId: nextCohortId ? Number(nextCohortId) : undefined,
        includeComments: nextIncludeComments,
      })
      setPartnerPreferences(rows)
    } catch (err) {
      setError(String(err?.message || 'Failed to load partner preferences'))
    } finally {
      setPartnerLoading(false)
    }
  }

  async function refreshAssignmentRules(nextCohortId = rulesCohortId, options = {}) {
    const shouldClear = Boolean(options?.clearFlash)
    if (shouldClear) resetFlash()
    setRulesLoading(true)
    try {
      const cohortParam = nextCohortId ? Number(nextCohortId) : undefined
      const [rows, active] = await Promise.all([
        adminListAssignmentRules({ cohort_id: cohortParam }),
        adminGetActiveAssignmentRule({ cohort_id: cohortParam }).catch(() => null),
      ])
      setAssignmentRules(rows)
      setActiveAssignmentRule(active)
    } catch (err) {
      setError(String(err?.message || 'Failed to load assignment rule configs'))
    } finally {
      setRulesLoading(false)
    }
  }

  async function refreshSavedAssignmentRuns(configId) {
    if (!configId) {
      setSavedAssignmentRuns([])
      return
    }
    try {
      const rows = await adminListSavedAssignmentRuns(configId, { limit: 20 })
      setSavedAssignmentRuns(rows || [])
    } catch {
      setSavedAssignmentRuns([])
    }
  }

  const cohortOptions = useMemo(() => {
    return [{ id: '', name: 'None' }, ...(cohorts || [])]
  }, [cohorts])

  const companyOptions = useMemo(() => {
    return [{ id: '', name: 'None' }, ...(companies || [])]
  }, [companies])

  function fillProjectForm(project) {
    setEditingProjectId(project.project_id || null)
    setProjectTitle(project.project_title || '')
    setProjectSlug(project.slug || '')
    setProjectSlugTouched(Boolean(project.slug))
    setProjectSummary(project.project_summary || '')
    setProjectDescription(project.project_description || '')
    setProjectMinimumDeliverables(project.minimum_deliverables || '')
    setProjectStretchGoals(project.stretch_goals || '')
    setProjectLongTermImpact(project.long_term_impact || '')
    setProjectScopeClarity(project.scope_clarity || '')
    setProjectScopeClarityOther(project.scope_clarity_other || '')
    setProjectPublicationPotential(project.publication_potential || '')
    setProjectDataAccess(project.data_access || '')
    setProjectCoverImageUrl(project.cover_image_url || '')
    setProjectContactName(project.contact_name || '')
    setProjectContactEmail(project.contact_email || '')
    setProjectSkills(Array.isArray(project.required_skills) ? project.required_skills.join(', ') : '')
    setProjectSkillsOther(project.required_skills_other || '')
    setProjectDomains(
      Array.isArray(project.technical_domains) ? project.technical_domains.join(', ') : ''
    )
    setProjectSupplementaryDocuments(
      Array.isArray(project.supplementary_documents) ? project.supplementary_documents.join('\n') : ''
    )
    setProjectVideoLinks(
      Array.isArray(project.video_links) ? project.video_links.join('\n') : ''
    )
    setProjectCohortId(project.cohort_id ? String(project.cohort_id) : '')
    setProjectCompanyId(project.company_id ? String(project.company_id) : '')
    setProjectStatus(String(project.project_status || 'draft').toLowerCase())
    setProjectDetailOpen(true)
    setProjectDetailCommentsOpen(false)
    refreshSelectedProjectComments(project.project_id || null)
  }

  function openCreateProjectDrawer() {
    setEditingProjectId(null)
    setProjectTitle('')
    setProjectSlug('')
    setProjectSlugTouched(false)
    setProjectSummary('')
    setProjectDescription('')
    setProjectMinimumDeliverables('')
    setProjectStretchGoals('')
    setProjectLongTermImpact('')
    setProjectScopeClarity('')
    setProjectScopeClarityOther('')
    setProjectPublicationPotential('')
    setProjectDataAccess('')
    setProjectCoverImageUrl('')
    setProjectContactName('')
    setProjectContactEmail('')
    setProjectSkills('')
    setProjectSkillsOther('')
    setProjectDomains('')
    setProjectSupplementaryDocuments('')
    setProjectVideoLinks('')
    setProjectCohortId('')
    setProjectCompanyId('')
    setProjectStatus('draft')
    setSelectedProjectComments([])
    setProjectDetailCommentsOpen(false)
    setProjectDetailOpen(true)
  }

  function resetProjectForm() {
    setEditingProjectId(null)
    setProjectTitle('')
    setProjectSlug('')
    setProjectSlugTouched(false)
    setProjectSummary('')
    setProjectDescription('')
    setProjectMinimumDeliverables('')
    setProjectStretchGoals('')
    setProjectLongTermImpact('')
    setProjectScopeClarity('')
    setProjectScopeClarityOther('')
    setProjectPublicationPotential('')
    setProjectDataAccess('')
    setProjectCoverImageUrl('')
    setProjectContactName('')
    setProjectContactEmail('')
    setProjectSkills('')
    setProjectSkillsOther('')
    setProjectDomains('')
    setProjectSupplementaryDocuments('')
    setProjectVideoLinks('')
    setProjectCohortId('')
    setProjectCompanyId('')
    setProjectStatus('draft')
    setSelectedProjectComments([])
    setProjectDetailOpen(false)
    setProjectDetailCommentsOpen(false)
  }

  function fillUserForm(item) {
    setEditingUserId(item.id || null)
    setUserEmail(item.email || '')
    setUserPassword('')
    setUserDisplayName(item.display_name || '')
    setUserProfileImageUrl(item.profile_image_url || '')
    setUserRole(item.role || 'student')
    setUserProgramShorthand(item.program_shorthand || '')
    setUserFacultyDepartment(item.faculty_department || '')
    setUserFacultyTitle(item.faculty_title || '')
    setUserCohortId(item.cohort_id ? String(item.cohort_id) : '')
    setUserFormError('')
  }

  function resetUserForm() {
    setEditingUserId(null)
    setUserEmail('')
    setUserPassword('')
    setUserDisplayName('')
    setUserProfileImageUrl('')
    setUserRole('student')
    setUserProgramShorthand('')
    setUserFacultyDepartment('')
    setUserFacultyTitle('')
    setUserCohortId('')
    setUserFormError('')
  }

  function validateUserForm({ requirePassword }) {
    const nextEmail = userEmail.trim()
    const nextPassword = userPassword || ''
    const nextProfileImageUrl = userProfileImageUrl.trim()

    if (!nextEmail || !nextEmail.includes('@')) {
      return 'Enter a valid email address.'
    }

    if (requirePassword && nextPassword.length < 8) {
      return 'Password must be at least 8 characters when creating a user.'
    }

    if (!requirePassword && nextPassword && nextPassword.length < 8) {
      return 'Password must be at least 8 characters.'
    }

    if (nextProfileImageUrl && !/^https?:\/\//i.test(nextProfileImageUrl)) {
      return 'Profile image URL must start with http:// or https://.'
    }

    return ''
  }

  function fillCohortForm(cohort) {
    setEditingCohortId(cohort.id || null)
    setCohortName(cohort.name || '')
    setCohortProgram(cohort.program || '')
    setCohortYear(cohort.year ? String(cohort.year) : '')
    setCohortEditableUntil(toDateTimeLocalValue(cohort.rankings_editable_until))
  }

  async function handleCreateCohort(e) {
    e.preventDefault()
    resetFlash()
    try {
      await adminCreateCohort({
        name: cohortName.trim(),
        program: cohortProgram.trim() || null,
        year: cohortYear ? Number(cohortYear) : null,
        rankings_editable_until: toIsoOrNull(cohortEditableUntil),
      })
      setCohortName('')
      setCohortProgram('')
      setCohortYear('')
      setCohortEditableUntil('')
      setSuccess('Cohort created.')
      refreshAll()
    } catch (err) {
      setError(String(err?.message || 'Failed to create cohort'))
    }
  }

  async function handleUpdateCohort(e) {
    e.preventDefault()
    if (!editingCohortId) return
    resetFlash()
    try {
      await adminUpdateCohort(editingCohortId, {
        name: cohortName.trim(),
        program: cohortProgram.trim() || null,
        year: cohortYear ? Number(cohortYear) : null,
        rankings_editable_until: toIsoOrNull(cohortEditableUntil),
      })
      setSuccess('Cohort updated.')
      setEditingCohortId(null)
      setCohortName('')
      setCohortProgram('')
      setCohortYear('')
      setCohortEditableUntil('')
      refreshAll()
    } catch (err) {
      setError(String(err?.message || 'Failed to update cohort'))
    }
  }

  async function handleCreateUser(e) {
    e.preventDefault()
    resetFlash()
    setUserFormError('')
    const validationError = validateUserForm({ requirePassword: true })
    if (validationError) {
      setUserFormError(validationError)
      return
    }
    setUserSaving(true)
    try {
      await adminCreateUser({
        email: userEmail.trim(),
        password: userPassword,
        display_name: userDisplayName.trim() || null,
        profile_image_url: userProfileImageUrl.trim() || null,
        role: userRole,
        cohort_id: userCohortId ? Number(userCohortId) : null,
        program_shorthand: userProgramShorthand.trim() || null,
        faculty_department: userRole === 'faculty' ? (userFacultyDepartment.trim() || null) : null,
        faculty_title: userRole === 'faculty' ? (userFacultyTitle.trim() || null) : null,
      })
      resetUserForm()
      setSuccess('User created.')
      await refreshAll()
    } catch (err) {
      setError(String(err?.message || 'Failed to create user'))
    } finally {
      setUserSaving(false)
    }
  }

  async function handleUpdateUser(e) {
    e.preventDefault()
    if (!editingUserId) return
    resetFlash()
    setUserFormError('')
    const validationError = validateUserForm({ requirePassword: false })
    if (validationError) {
      setUserFormError(validationError)
      return
    }
    setUserSaving(true)
    try {
      await adminUpdateUser(editingUserId, {
        email: userEmail.trim(),
        password: userPassword || null,
        display_name: userDisplayName.trim() || null,
        profile_image_url: userProfileImageUrl.trim() || null,
        role: userRole,
        cohort_id: userCohortId ? Number(userCohortId) : null,
        program_shorthand: userProgramShorthand.trim() || null,
        faculty_department: userRole === 'faculty' ? (userFacultyDepartment.trim() || null) : null,
        faculty_title: userRole === 'faculty' ? (userFacultyTitle.trim() || null) : null,
      })
      setSuccess('User updated.')
      resetUserForm()
      await refreshAll()
    } catch (err) {
      setError(String(err?.message || 'Failed to update user'))
    } finally {
      setUserSaving(false)
    }
  }

  function projectPayload() {
    return {
      company_id: projectCompanyId ? Number(projectCompanyId) : null,
      slug: projectSlug.trim() || null,
      project_title: projectTitle.trim() || null,
      project_summary: projectSummary.trim() || null,
      project_description: projectDescription.trim() || null,
      minimum_deliverables: projectMinimumDeliverables.trim() || null,
      stretch_goals: projectStretchGoals.trim() || null,
      long_term_impact: projectLongTermImpact.trim() || null,
      scope_clarity: projectScopeClarity.trim() || null,
      scope_clarity_other: projectScopeClarityOther.trim() || null,
      publication_potential: projectPublicationPotential.trim() || null,
      data_access: projectDataAccess.trim() || null,
      cover_image_url: projectCoverImageUrl.trim() || null,
      contact_name: projectContactName.trim() || null,
      contact_email: projectContactEmail.trim() || null,
      required_skills: projectSkills
        ? projectSkills.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      required_skills_other: projectSkillsOther.trim() || null,
      technical_domains: projectDomains
        ? projectDomains.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      supplementary_documents: projectSupplementaryDocuments
        ? projectSupplementaryDocuments.split('\n').map((s) => s.trim()).filter(Boolean)
        : [],
      video_links: projectVideoLinks
        ? projectVideoLinks.split('\n').map((s) => s.trim()).filter(Boolean)
        : [],
      cohort_id: projectCohortId ? Number(projectCohortId) : null,
      project_status: projectStatus || 'draft',
    }
  }

  async function handleCreateProject(e) {
    e.preventDefault()
    resetFlash()
    try {
      await adminCreateProject(projectPayload())
      setSuccess('Project created.')
      await refreshAll()
      resetProjectForm()
    } catch (err) {
      setError(String(err?.message || 'Failed to create project'))
    }
  }

  async function handleUpdateProject(e) {
    e.preventDefault()
    if (!editingProjectId) return
    resetFlash()
    try {
      await adminUpdateProject(editingProjectId, projectPayload())
      setSuccess('Project updated.')
      await refreshAll()
      resetProjectForm()
    } catch (err) {
      setError(String(err?.message || 'Failed to update project'))
    }
  }

  async function handleDeleteUser(targetId, targetEmail) {
    if (!targetId) return
    const check = window.prompt(
      'Type the user email to confirm deletion. This cannot be undone.'
    )
    if (!check || check.trim() !== String(targetEmail || '').trim()) return
    resetFlash()
    try {
      await adminDeleteUser(targetId)
      setSuccess('User deleted.')
      refreshAll()
    } catch (err) {
      setError(String(err?.message || 'Failed to delete user'))
    }
  }

  async function handleDeleteProject(targetId, targetOrgName) {
    if (!targetId) return
    const check = window.prompt(
      'Type the organization name to confirm deletion. This cannot be undone.'
    )
    if (!check || check.trim() !== String(targetOrgName || '').trim()) return
    resetFlash()
    try {
      await adminDeleteProject(targetId)
      setSuccess('Project deleted.')
      if (targetId === editingProjectId) {
        resetProjectForm()
      }
      refreshAll()
    } catch (err) {
      setError(String(err?.message || 'Failed to delete project'))
    }
  }

  async function handleDeleteCohort(targetId, targetName) {
    if (!targetId) return
    const check = window.prompt(
      'Type the cohort name to confirm deletion. This cannot be undone.'
    )
    if (!check || check.trim() !== String(targetName || '').trim()) return
    resetFlash()
    try {
      await adminDeleteCohort(targetId)
      setSuccess('Cohort deleted.')
      refreshAll()
    } catch (err) {
      setError(String(err?.message || 'Failed to delete cohort'))
    }
  }

  function fillCompanyForm(company) {
    setEditingCompanyId(company.id || null)
    setCompanyName(company.name || '')
    setCompanySector(company.sector || '')
    setCompanyIndustry(company.industry || '')
    setCompanyWebsite(company.website || '')
    setCompanyLogoUrl(company.logo_url || '')
  }

  function resetCompanyForm() {
    setEditingCompanyId(null)
    setCompanyName('')
    setCompanySector('')
    setCompanyIndustry('')
    setCompanyWebsite('')
    setCompanyLogoUrl('')
  }

  function resetCohortForm() {
    setEditingCohortId(null)
    setCohortName('')
    setCohortProgram('')
    setCohortYear('')
    setCohortEditableUntil('')
  }

  function fillRuleForm(item) {
    setEditingRuleId(item.id || null)
    setRuleName(item.name || '')
    setRuleFormCohortId(item.cohort_id ? String(item.cohort_id) : '')
    setRuleIsActive(Boolean(item.is_active))
    setRuleTeamSize(String(item.team_size ?? 4))
    setRuleEnforceSameCohort(Boolean(item.enforce_same_cohort))
    setRuleHardAvoid(Boolean(item.hard_avoid))
    setRuleMaxLowPreference(String(item.max_low_preference_per_team ?? 1))
    setRuleWeightProjectPreference(String(item.weight_project_preference ?? 55))
    setRuleWeightProjectRating(String(item.weight_project_rating ?? 15))
    setRuleWeightMutualWant(String(item.weight_mutual_want ?? 25))
    setRulePenaltyAvoid(String(item.penalty_avoid ?? 100))
    setRuleNotes(item.notes || '')
    setRuleFormError('')
    setRuleFlowStep(1)
    setRuleFlowOpen(true)
    refreshSavedAssignmentRuns(item.id)
  }

  function openCreateRuleFlow() {
    resetRuleForm()
    setRuleFlowStep(1)
    setRuleFlowOpen(true)
  }

  function openRuleExplainer(item) {
    setRuleExplainItem(item || null)
    setRuleExplainOpen(true)
  }

  function openRuleExplainerFromForm() {
    if (ruleFlowOpen) {
      setRuleFlowOpen(false)
    }
    openRuleExplainer({
      name: ruleName || 'Draft Assignment Rule',
      cohort_id: ruleFormCohortId ? Number(ruleFormCohortId) : null,
      is_active: Boolean(ruleIsActive),
      team_size: Number(ruleTeamSize || 4),
      enforce_same_cohort: Boolean(ruleEnforceSameCohort),
      hard_avoid: Boolean(ruleHardAvoid),
      max_low_preference_per_team: Number(ruleMaxLowPreference || 1),
      weight_project_preference: Number(ruleWeightProjectPreference || 55),
      weight_project_rating: Number(ruleWeightProjectRating || 15),
      weight_mutual_want: Number(ruleWeightMutualWant || 25),
      penalty_avoid: Number(rulePenaltyAvoid || 100),
      notes: ruleNotes || null,
    })
  }

  function closeRuleExplainer() {
    setRuleExplainOpen(false)
  }

  function ruleExplainerSections(item) {
    if (!item) return []

    const projectWeight = Number(item.weight_project_preference || 0)
    const ratingWeight = Number(item.weight_project_rating || 0)
    const wantWeight = Number(item.weight_mutual_want || 0)
    const totalWeight = projectWeight + ratingWeight + wantWeight
    const sampleRank = 2
    const samplePrefPoints = 11 - sampleRank
    const samplePrefScore = samplePrefPoints * projectWeight
    const sampleRating = 8
    const sampleRatingScore = sampleRating * ratingWeight
    const sampleWantHits = 1
    const sampleWantBonus = sampleWantHits * wantWeight
    const sampleAvoidPenalty = Number(item.penalty_avoid || 0)

    const projectA = {
      label: 'Project A',
      rank: 2,
      prefPoints: 9,
      wantHits: 1,
      avoidHits: 0,
      fillPenalty: 0,
    }
    const projectAPrefScore = projectA.prefPoints * projectWeight
    const projectARatingScore = sampleRating * ratingWeight
    const projectAWantBonus = projectA.wantHits * wantWeight
    const projectAAvoidPenalty = projectA.avoidHits * sampleAvoidPenalty
    const projectATotal = projectAPrefScore + projectARatingScore + projectAWantBonus - projectAAvoidPenalty - projectA.fillPenalty

    const projectB = {
      label: 'Project B',
      rank: 4,
      prefPoints: 7,
      wantHits: 0,
      avoidHits: 1,
      fillPenalty: 0,
    }
    const projectBPrefScore = projectB.prefPoints * projectWeight
    const projectBRatingScore = 6 * ratingWeight
    const projectBWantBonus = projectB.wantHits * wantWeight
    const projectBAvoidPenalty = projectB.avoidHits * sampleAvoidPenalty
    const projectBTotalRaw = projectBPrefScore + projectBRatingScore + projectBWantBonus - projectBAvoidPenalty - projectB.fillPenalty

    const stepByStepExample = [
      'Step 1: The student is considered for two projects with open spots: Project A and Project B.',
      `Step 2: Project A starts stronger because it is ranked higher by the student (rank #${projectA.rank}) than Project B (rank #${projectB.rank}).`,
      `Step 2.5: Project A also gets a rating boost (rating ${sampleRating}/10 x weight ${ratingWeight} = ${projectARatingScore}).`,
      `Step 3: Project A gets an extra boost because one preferred teammate is already on that team (+${projectAWantBonus} points).`,
      'Step 4: Team-fit balancing weights were removed, so only preference, rating, and teammate signals are used.',
      item.hard_avoid
        ? `Step 5: Project B includes someone this student asked to avoid, and hard avoid is enabled, so Project B is skipped.`
        : `Step 5: Project B remains possible, but it loses points for an avoid match (-${projectBAvoidPenalty}).`,
      item.hard_avoid
        ? `Step 6: With Project B removed, the student is assigned to Project A.`
        : `Step 6: The system compares final totals (A: ${projectATotal}, B: ${projectBTotalRaw}) and picks the higher one.`,
      'Step 7: The same process repeats for each next student, and team composition updates after every assignment.',
      'Step 8: If no strong ranked option is available under current constraints, a fallback open spot may be used so the student is still placed when possible.',
    ]

    return [
      {
        title: 'Scope and Team Structure',
        points: [
          `Scope: ${item.cohort_id ? `Cohort ${item.cohort_id}` : 'Global across cohorts'}. Only in-scope students/projects are considered.`,
          `Target team size is ${item.team_size}. Capacity is expanded in multiples of team size until all assignable students can fit.`,
          `${item.enforce_same_cohort ? 'Same-cohort assignment is enforced when this rule has a cohort scope.' : 'Cross-cohort assignment is allowed if needed by scope.'}`,
          `Project selection starts from demand: projects ranked more highly and more often are prioritized first.`,
          'Students with submitted rankings are processed before students without rankings.',
        ],
      },
      {
        title: 'Preference and Teammate Constraints',
        points: [
          `${item.hard_avoid ? 'Avoid preferences are hard constraints (blocked placement).' : 'Avoid preferences are soft constraints (score penalty).'} ` +
            `Penalty value: ${item.penalty_avoid}.`,
          `Mutual/desired teammate signal weight: ${wantWeight}.`,
          `Project rating signal weight: ${ratingWeight}.`,
          `Maximum low-preference placements per team: ${item.max_low_preference_per_team}.`,
          `Example: if a candidate team already has ${sampleWantHits} preferred teammate, bonus = ${sampleWantHits} x ${wantWeight} = ${sampleWantBonus}.`,
          item.hard_avoid
            ? 'Example: if an avoid teammate is present, that project option is skipped entirely for the student.'
            : `Example: if 1 avoid hit occurs, score reduction = 1 x ${sampleAvoidPenalty} = ${sampleAvoidPenalty}.`,
        ],
      },
      {
        title: 'Scoring Mix',
        points: [
          `Project preference weight: ${projectWeight}`,
          `Project rating weight: ${ratingWeight}`,
          `Mutual want weight: ${wantWeight}`,
          `Total configured weight: ${totalWeight}`,
          `Project preference uses rank points (11 - rank). Example with rank #${sampleRank}: points=${samplePrefPoints}, contribution=${samplePrefPoints} x ${projectWeight} = ${samplePrefScore}.`,
          `Project rating adds rating x weight. Example with rating ${sampleRating}/10: contribution=${sampleRating} x ${ratingWeight} = ${sampleRatingScore}.`,
          'Higher final score wins for each student among currently valid project slots.',
        ],
      },
      {
        title: 'Step-by-Step Worked Example',
        points: stepByStepExample,
      },
      {
        title: 'What To Expect In Results',
        points: [
          item.notes ? `Notes: ${item.notes}` : 'No notes were added for this config.',
          'Teams can include members with no rank shown when no ranked option is available under current constraints.',
          'If constraints are too strict (especially hard avoids), unassigned students may increase.',
          'Fairness and skill-balance weights were removed from this rule set.',
          item.is_active
            ? 'This config is currently active in its scope.'
            : 'This config is not currently active in its scope.',
          'Best practice: compare 2-3 runs and choose the one with stronger top-3/top-5 rates and fewer unassigned students.',
        ],
      },
    ]
  }

  function resetRuleForm() {
    setEditingRuleId(null)
    setRuleName('')
    setRuleFormCohortId('')
    setRuleIsActive(true)
    setRuleTeamSize('4')
    setRuleEnforceSameCohort(true)
    setRuleHardAvoid(true)
    setRuleMaxLowPreference('1')
    setRuleWeightProjectPreference('55')
    setRuleWeightProjectRating('15')
    setRuleWeightMutualWant('25')
    setRulePenaltyAvoid('100')
    setRuleNotes('')
    setRuleFormError('')
    setRuleFlowStep(1)
  }

  function parseRuleForm() {
    const payload = {
      name: ruleName.trim(),
      cohort_id: ruleFormCohortId ? Number(ruleFormCohortId) : null,
      is_active: Boolean(ruleIsActive),
      team_size: Number(ruleTeamSize),
      enforce_same_cohort: Boolean(ruleEnforceSameCohort),
      hard_avoid: Boolean(ruleHardAvoid),
      max_low_preference_per_team: Number(ruleMaxLowPreference),
      weight_project_preference: Number(ruleWeightProjectPreference),
      weight_project_rating: Number(ruleWeightProjectRating),
      weight_mutual_want: Number(ruleWeightMutualWant),
      penalty_avoid: Number(rulePenaltyAvoid),
      notes: ruleNotes.trim() || null,
    }

    if (!payload.name) return { error: 'Rule config name is required.' }
    if (Number.isNaN(payload.team_size) || payload.team_size < 3 || payload.team_size > 5) {
      return { error: 'Team size must be between 3 and 5.' }
    }
    if (
      Number.isNaN(payload.max_low_preference_per_team) ||
      payload.max_low_preference_per_team < 0 ||
      payload.max_low_preference_per_team > 8
    ) {
      return { error: 'Max low-preference per team must be between 0 and 8.' }
    }

    const weightKeys = [
      'weight_project_preference',
      'weight_project_rating',
      'weight_mutual_want',
    ]
    for (const key of weightKeys) {
      const value = payload[key]
      if (Number.isNaN(value) || value < 0 || value > 100) {
        return { error: 'All weights must be between 0 and 100.' }
      }
    }

    if (Number.isNaN(payload.penalty_avoid) || payload.penalty_avoid < 0 || payload.penalty_avoid > 1000) {
      return { error: 'Avoid penalty must be between 0 and 1000.' }
    }

    return { payload }
  }

  async function handleCreateRule(e) {
    e.preventDefault()
    resetFlash()
    setRuleFormError('')
    const { payload, error: parseError } = parseRuleForm()
    if (parseError) {
      setRuleFormError(parseError)
      return
    }
    try {
      await adminCreateAssignmentRule(payload)
      setSuccess('Assignment rule config created.')
      resetRuleForm()
      setRuleFlowOpen(false)
      await refreshAssignmentRules(payload.cohort_id ? String(payload.cohort_id) : '')
    } catch (err) {
      setError(String(err?.message || 'Failed to create assignment rule config'))
    }
  }

  async function handleUpdateRule(e) {
    e.preventDefault()
    if (!editingRuleId) return
    resetFlash()
    setRuleFormError('')
    const { payload, error: parseError } = parseRuleForm()
    if (parseError) {
      setRuleFormError(parseError)
      return
    }
    try {
      await adminUpdateAssignmentRule(editingRuleId, payload)
      setSuccess('Assignment rule config updated.')
      setRuleFlowOpen(false)
      await refreshAssignmentRules(payload.cohort_id ? String(payload.cohort_id) : '')
    } catch (err) {
      setError(String(err?.message || 'Failed to update assignment rule config'))
    }
  }

  async function handleActivateRule(configId) {
    if (!configId) return
    resetFlash()
    try {
      await adminActivateAssignmentRule(configId)
      setSuccess('Assignment rule config activated.')
      await refreshAssignmentRules()
    } catch (err) {
      setError(String(err?.message || 'Failed to activate assignment rule config'))
    }
  }

  async function handlePreviewRule(configId) {
    if (!configId) return
    resetFlash()
    setPreviewLoading(true)
    try {
      const preview = await adminPreviewAssignmentRule(configId, {
        preassigned: manualPreassignments.map((row) => ({
          user_id: Number(row.user_id),
          project_id: Number(row.project_id),
        })),
      })
      setPreviewResult(preview)
      await refreshSavedAssignmentRuns(configId)
      setSuccess('Assignment preview generated.')
    } catch (err) {
      setError(String(err?.message || 'Failed to generate assignment preview'))
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleSaveAssignmentSnapshot() {
    if (!previewResult?.rule_config_id) return
    resetFlash()
    setSavingAssignmentRun(true)
    try {
      await adminSaveAssignmentRun(previewResult.rule_config_id, {
        preview: previewResult,
      })
      await refreshSavedAssignmentRuns(previewResult.rule_config_id)
      setSuccess('Assignment snapshot saved with timestamp.')
    } catch (err) {
      setError(String(err?.message || 'Failed to save assignment snapshot'))
    } finally {
      setSavingAssignmentRun(false)
    }
  }

  async function handleLoadSavedAssignmentRun(run) {
    if (!run?.id || !run?.rule_config_id) return
    resetFlash()
    setPreviewLoading(true)
    try {
      const loaded = await adminGetSavedAssignmentRun(run.rule_config_id, run.id)
      setPreviewResult(loaded)
      setSuccess('Loaded saved snapshot into preview output.')
    } catch (err) {
      setError(String(err?.message || 'Failed to load saved snapshot'))
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleCreateCompany(e) {
    e.preventDefault()
    resetFlash()
    try {
      await adminCreateCompany({
        name: companyName.trim(),
        sector: companySector.trim() || null,
        industry: companyIndustry.trim() || null,
        website: companyWebsite.trim() || null,
        logo_url: companyLogoUrl.trim() || null,
      })
      resetCompanyForm()
      setSuccess('Company created.')
      refreshAll()
    } catch (err) {
      setError(String(err?.message || 'Failed to create company'))
    }
  }

  async function handleUpdateCompany(e) {
    e.preventDefault()
    if (!editingCompanyId) return
    resetFlash()
    try {
      await adminUpdateCompany(editingCompanyId, {
        name: companyName.trim(),
        sector: companySector.trim() || null,
        industry: companyIndustry.trim() || null,
        website: companyWebsite.trim() || null,
        logo_url: companyLogoUrl.trim() || null,
      })
      setSuccess('Company updated.')
      resetCompanyForm()
      refreshAll()
    } catch (err) {
      setError(String(err?.message || 'Failed to update company'))
    }
  }

  async function handleDeleteCompany(targetId, targetName) {
    if (!targetId) return
    const check = window.prompt(
      'Type the company name to confirm deletion. This cannot be undone.'
    )
    if (!check || check.trim() !== String(targetName || '').trim()) return

    resetFlash()
    try {
      await adminDeleteCompany(targetId)
      setSuccess('Company deleted.')
      if (editingCompanyId === targetId) {
        resetCompanyForm()
      }
      refreshAll()
    } catch (err) {
      setError(String(err?.message || 'Failed to delete company'))
    }
  }

  async function handleUploadStudentsCsv(e) {
    e.preventDefault()
    resetFlash()
    setUploadSummary(null)

    if (!uploadCohortId) {
      setError('Choose a cohort before uploading CSV.')
      return
    }
    if (!uploadFile) {
      setError('Select a CSV file to upload.')
      return
    }

    setUploadingCsv(true)
    try {
      const summary = await adminUploadCohortStudentsCsv({
        cohortId: Number(uploadCohortId),
        file: uploadFile,
      })
      setUploadSummary(summary)
      setSuccess('Student CSV processed successfully.')
      resetUploadState()
      await refreshAll()
    } catch (err) {
      setError(String(err?.message || 'Failed to upload student CSV'))
    } finally {
      setUploadingCsv(false)
    }
  }

  async function handleExportSubmissionsCsv() {
    resetFlash()
    try {
      const csvText = await adminExportRankingSubmissionsCsv({
        submittedOnly: rankingSubmittedOnly,
        cohortId: rankingCohortId ? Number(rankingCohortId) : undefined,
      })
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'ranking_submissions.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(String(err?.message || 'Failed to export submissions CSV'))
    }
  }

  function handleExportTeamsCsv() {
    resetFlash()
    if (!previewResult || !Array.isArray(previewResult.project_assignments)) {
      setError('Generate a preview before exporting teams.')
      return
    }

    const normalizeCellText = (value) => {
      if (value == null) return ''
      return String(value)
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim()
    }

    // Always quote cells so Excel/Sheets parsing stays stable across locales and embedded punctuation.
    const escapeCsv = (value) => `"${normalizeCellText(value).replace(/"/g, '""')}"`

    const rows = [
      [
        'project_title',
        'organization',
        'member_name',
        'member_email',
        'assigned_score',
        'assigned_rank',
      ],
    ]

    for (const project of previewResult.project_assignments || []) {
      const teams = Array.isArray(project.teams) ? project.teams : []
      teams.forEach((team) => {
        ;(team || []).forEach((member) => {
          rows.push([
            project.project_title || '',
            project.organization || '',
            member.display_name || '',
            member.email || '',
            member.assigned_score ?? 0,
            member.assigned_rank ?? '',
          ])
        })
      })
    }

    // Add UTF-8 BOM so Excel opens Unicode names/emails correctly on Windows.
    const csvText = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')
    const blob = new Blob(['\ufeff', csvText], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'assignment_teams.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  async function handleExportPartnerPreferencesCsv() {
    resetFlash()
    try {
      const csvText = await adminExportPartnerPreferencesCsv({
        cohortId: partnerCohortId ? Number(partnerCohortId) : undefined,
        includeComments: partnerIncludeComments,
      })
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'partner_preferences.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(String(err?.message || 'Failed to export partner preferences CSV'))
    }
  }

  useEffect(() => {
    if (activeTab !== 'team-preferences') return
    if (partnerPreferences.length > 0) return
    refreshPartnerPreferences()
  }, [activeTab])

  return (
    <div className="admin-compact min-h-screen bg-slate-50 pb-20">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
        <AppHeader />

        {error ? (
          <div className="card p-4 text-sm text-red-700 border-red-200 bg-red-50">{error}</div>
        ) : null}
        {success ? (
          <div className="card p-4 text-sm text-emerald-800 border-emerald-200 bg-emerald-50">
            {success}
          </div>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-[270px_1fr] gap-6 items-start">
          <aside className="card p-3 sm:p-4 xl:sticky xl:top-6 space-y-3 sm:space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] sm:text-[11px] uppercase tracking-[0.12em] font-semibold text-slate-400">Admin Workspace</div>
                <div className="text-lg sm:text-xl font-heading text-duke-900 mt-1">{activeTabMeta.label}</div>
                <div className="hidden sm:block text-sm text-slate-500 mt-1">{activeTabMeta.hint}</div>
              </div>
              <div className="relative">
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                  aria-label="Project comment notifications"
                  title="Project comment notifications"
                  onClick={() => setCommentBellOpen((v) => !v)}
                >
                  <svg
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                  >
                    <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
                    <path d="M9 17a3 3 0 0 0 6 0" />
                  </svg>
                  {unresolvedCommentCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white shadow-sm ring-2 ring-white">
                      {unresolvedCommentCount > 99 ? '99+' : unresolvedCommentCount}
                    </span>
                  ) : null}
                </button>
                {commentBellOpen ? (
                  <div className="absolute left-0 lg:left-auto lg:-right-4 top-full mt-2 w-[calc(100vw-2rem)] lg:w-96 rounded-card border border-slate-200 bg-white shadow-xl p-3 z-30 transform max-lg:-translate-x-[calc(100%-2.25rem)]">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">Student Project Comments</div>
                        <div className="text-xs text-slate-500">
                          {unresolvedCommentCount > 0
                            ? `${unresolvedCommentCount} unresolved`
                            : 'No unresolved comments'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => refreshProjectCommentNotifications()}
                        disabled={commentActionsLoading}
                      >
                        Refresh
                      </button>
                    </div>
                    <div className="mt-3 max-h-80 overflow-auto space-y-2">
                      {recentProjectComments.length ? (
                        recentProjectComments.map((item) => {
                          const commentId = item?.id
                          const isResolved = Boolean(item?.is_resolved)
                          const created = item?.created_at ? new Date(item.created_at) : null
                          const createdText = created && !Number.isNaN(created.getTime())
                            ? created.toLocaleString()
                            : 'Unknown time'
                          return (
                            <div key={commentId} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-xs text-slate-500">
                                  <span className="font-semibold text-slate-700">
                                    {item?.student_display_name || item?.student_email || 'Student'}
                                  </span>
                                  {' on '}
                                  <span className="font-semibold text-slate-700">
                                    {item?.project_title || `Project #${item?.project_id || ''}`}
                                  </span>
                                </div>
                                <span
                                  className={
                                    isResolved
                                      ? 'rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700'
                                      : 'rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700'
                                  }
                                >
                                  {isResolved ? 'Resolved' : 'Unresolved'}
                                </span>
                              </div>
                              <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{item?.comment || ''}</div>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <div className="text-[11px] text-slate-500">{createdText}</div>
                                <button
                                  type="button"
                                  className="btn-secondary text-xs"
                                  disabled={commentActionsLoading}
                                  onClick={() => handleUpdateProjectComment(commentId, !isResolved)}
                                >
                                  {isResolved ? 'Mark unresolved' : 'Mark resolved'}
                                </button>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <div className="text-sm text-slate-500">No project comments yet.</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 sm:px-3 py-1.5 sm:py-2">
                <div className="text-[11px] text-slate-500">Projects</div>
                <div className="text-base sm:text-lg font-semibold text-slate-800">{projects.length}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 sm:px-3 py-1.5 sm:py-2">
                <div className="text-[11px] text-slate-500">Companies</div>
                <div className="text-base sm:text-lg font-semibold text-slate-800">{companies.length}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 sm:px-3 py-1.5 sm:py-2">
                <div className="text-[11px] text-slate-500">Users</div>
                <div className="text-base sm:text-lg font-semibold text-slate-800">{users.length}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 sm:px-3 py-1.5 sm:py-2">
                <div className="text-[11px] text-slate-500">Cohorts</div>
                <div className="text-base sm:text-lg font-semibold text-slate-800">{cohorts.length}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-1 gap-2 xl:gap-3" role="tablist" aria-label="Admin sections">
              {Object.entries(groupedAdminTabs).map(([groupKey, tabs]) => (
                <div key={groupKey} className="space-y-1.5 xl:space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2 xl:p-3">
                  <div className="text-[10px] xl:text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 px-0.5">
                    {tabGroupMeta[groupKey] || groupKey}
                  </div>
                  {tabs.map((tab) => {
                    const isActive = tab.key === activeTab
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        id={`admin-tab-${tab.key}`}
                        aria-controls={`admin-panel-${tab.key}`}
                        aria-selected={isActive}
                        className={
                          isActive
                            ? 'w-full text-left px-2 py-1.5 xl:px-3 xl:py-2 rounded-md bg-duke-900 text-white shadow-sm'
                            : 'w-full text-left px-2 py-1.5 xl:px-3 xl:py-2 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }
                        onClick={() => setActiveTab(tab.key)}
                      >
                        <div className="font-semibold text-[11px] sm:text-xs xl:text-sm leading-tight">{tab.label}</div>
                        <div className={`hidden sm:block xl:text-xs ${isActive ? 'text-[11px] text-white/80' : 'text-[11px] text-slate-500'}`}>{tab.hint}</div>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </aside>

          <section className="space-y-6">
        {activeTab === 'projects' ? (
          <div
            className="grid grid-cols-1 gap-6"
            role="tabpanel"
            id="admin-panel-projects"
            aria-labelledby="admin-tab-projects"
          >
            <div className="card p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-heading text-duke-900">Projects</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={openCreateProjectDrawer}
                  >
                    New project
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => togglePanel('projectsList')}>
                    {panelOpen.projectsList ? 'Collapse' : 'Expand'}
                  </button>
                </div>
              </div>
              {panelOpen.projectsList ? (
              <>
              <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] text-slate-500">Total Projects</div>
                  <div className="text-base font-semibold text-slate-800">{projectStatusCounts.all}</div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] text-slate-500">Published</div>
                  <div className="text-base font-semibold text-slate-800">{projectStatusCounts.published}</div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] text-slate-500">Draft</div>
                  <div className="text-base font-semibold text-slate-800">{projectStatusCounts.draft}</div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] text-slate-500">Archived</div>
                  <div className="text-base font-semibold text-slate-800">{projectStatusCounts.archived}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className="input-base"
                  placeholder="Search projects"
                  value={projectQuery}
                  onChange={(e) => setProjectQuery(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setProjectSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                >
                  Sort {projectSortDir === 'asc' ? 'A-Z' : 'Z-A'}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {[
                  { key: 'all', label: 'All', count: projectStatusCounts.all },
                  { key: 'published', label: 'Published', count: projectStatusCounts.published },
                  { key: 'draft', label: 'Draft', count: projectStatusCounts.draft },
                  { key: 'archived', label: 'Archived', count: projectStatusCounts.archived },
                ].map((status) => (
                  <button
                    key={status.key}
                    type="button"
                    className={
                      projectStatusFilter === status.key
                        ? 'rounded-full border border-duke-700 bg-duke-50 px-3 py-1 text-xs font-semibold text-duke-800'
                        : 'rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50'
                    }
                    onClick={() => setProjectStatusFilter(status.key)}
                  >
                    {status.label} ({status.count})
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <div className="space-y-2">
                  {filteredProjects.map((project) => {
                    const isSelected = Number(editingProjectId) === Number(project.project_id)
                    return (
                      <div
                        key={project.project_id}
                        className={
                          isSelected
                            ? 'rounded-card border border-duke-700 bg-duke-50/40 px-3 py-2.5'
                            : 'rounded-card border border-slate-200 bg-white px-3 py-2.5 hover:border-duke-700/30 transition-colors'
                        }
                      >
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
                          <button
                            type="button"
                            className="text-left min-w-0"
                            onClick={() => fillProjectForm(project)}
                          >
                            <div className="text-xs sm:text-sm font-semibold text-slate-800 truncate">
                              {project.project_title || project.organization}
                            </div>
                            <div className="text-[11px] sm:text-xs text-slate-500 truncate">
                              {project.organization}
                              {project.cohort_name || project.cohort ? (
                                <span className="ml-2 text-slate-400">{project.cohort_name || project.cohort}</span>
                              ) : null}
                            </div>
                          </button>
                          <div className="flex items-center justify-start sm:justify-end gap-1.5 sm:gap-2">
                            <span className={
                              String(project.project_status || '').toLowerCase() === 'published'
                                ? 'rounded-full border border-emerald-300 bg-emerald-100 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold uppercase text-emerald-700'
                                : String(project.project_status || '').toLowerCase() === 'archived'
                                  ? 'rounded-full border border-slate-300 bg-slate-200 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold uppercase text-slate-700'
                                  : 'rounded-full border border-amber-300 bg-amber-100 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold uppercase text-amber-700'
                            }>
                              {String(project.project_status || 'draft')}
                            </span>
                            {Number(project.total_comment_count || 0) > 0 ? (
                              <span
                                className={
                                  Number(project.unresolved_comment_count || 0) > 0
                                    ? 'rounded-full border border-amber-300 bg-amber-100 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-amber-700'
                                    : 'rounded-full border border-sky-200 bg-sky-50 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-sky-700'
                                }
                                title={`${Number(project.unresolved_comment_count || 0)} unresolved`}
                              >
                                Comments {Number(project.total_comment_count || 0)}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-duke-800"
                              onClick={() => fillProjectForm(project)}
                              aria-label={`Edit ${project.project_title || project.organization || 'project'}`}
                              title="Edit project"
                            >
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-md border border-rose-300 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => handleDeleteProject(project.project_id, project.organization)}
                              aria-label={`Delete ${project.project_title || project.organization || 'project'}`}
                              title="Delete project"
                            >
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {filteredProjects.length === 0 ? (
                  <div className="text-sm text-slate-400">{projectQuery ? 'No matching projects.' : 'No projects yet.'}</div>
                ) : null}
              </div>
              </>
              ) : null}
            </div>

            {projectDetailOpen ? (
              <div className="fixed inset-0 z-40" aria-live="polite">
                <button
                  type="button"
                  className="absolute inset-0 bg-slate-900/30"
                  aria-label="Close project details"
                  onClick={() => setProjectDetailOpen(false)}
                />
                <aside className="absolute right-0 top-0 h-full w-full max-w-xl border-l border-slate-200 bg-white shadow-2xl p-5 overflow-auto">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">Project Editor</div>
                      <div className="text-lg font-heading text-duke-900">
                        {editingProjectId
                          ? (selectedAdminProject?.project_title || selectedAdminProject?.organization || 'Project')
                          : 'Create Project'}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                        <span>{editingProjectId ? (selectedAdminProject?.organization || 'No company') : 'New draft'}</span>
                        {editingProjectId ? (
                          <span
                            className={
                              String(selectedAdminProject?.project_status || '').toLowerCase() === 'published'
                                ? 'rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700'
                                : String(selectedAdminProject?.project_status || '').toLowerCase() === 'archived'
                                  ? 'rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-700'
                                  : 'rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700'
                            }
                          >
                            {String(selectedAdminProject?.project_status || 'draft')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {editingProjectId && Number(selectedAdminProject?.total_comment_count || 0) > 0 ? (
                        <button
                          type="button"
                          className="btn-secondary inline-flex items-center gap-2"
                          onClick={async () => {
                            await refreshSelectedProjectComments()
                            setProjectDetailCommentsOpen(true)
                          }}
                          title="View project comments"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                          </svg>
                          <span>Comments</span>
                          <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                            {selectedProjectCommentStats.unresolved}/{selectedProjectCommentStats.total}
                          </span>
                        </button>
                      ) : null}
                      <button type="button" className="btn-secondary" onClick={() => setProjectDetailOpen(false)}>
                        Close
                      </button>
                    </div>
                  </div>

                  <form className="mt-4 space-y-3" onSubmit={editingProjectId ? handleUpdateProject : handleCreateProject}>
                    <div>
                      <div className="label">Company</div>
                      <select className="select-base" value={projectCompanyId} onChange={(e) => setProjectCompanyId(e.target.value)} required>
                        {companyOptions.map((company) => (
                          <option key={company.id || 'none'} value={company.id}>
                            {company.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="label">Project title</div>
                      <input className="input-base" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} />
                    </div>
                    <div>
                      <div className="label flex items-center justify-between">
                        <span>Slug</span>
                        <button
                          type="button"
                          className="text-xs text-slate-500 hover:text-slate-700"
                          onClick={() => {
                            setProjectSlugTouched(false)
                            const base = projectTitle || selectedProjectCompanyName
                            setProjectSlug(base ? slugify(base) : '')
                          }}
                        >
                          Use project title
                        </button>
                      </div>
                      <input
                        className="input-base"
                        value={projectSlug}
                        onChange={(e) => {
                          setProjectSlugTouched(true)
                          setProjectSlug(e.target.value)
                        }}
                        placeholder="auto-generated from project title"
                      />
                    </div>
                    <div>
                      <div className="label">Project summary</div>
                      <input className="input-base" value={projectSummary} onChange={(e) => setProjectSummary(e.target.value)} />
                    </div>
                    <div>
                      <div className="label">Project description</div>
                      <textarea className="input-base h-24" value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} />
                    </div>
                    <div>
                      <div className="label">Minimum deliverables</div>
                      <textarea className="input-base h-20" value={projectMinimumDeliverables} onChange={(e) => setProjectMinimumDeliverables(e.target.value)} />
                    </div>
                    <div>
                      <div className="label">Stretch goals</div>
                      <textarea className="input-base h-20" value={projectStretchGoals} onChange={(e) => setProjectStretchGoals(e.target.value)} />
                    </div>
                    <div>
                      <div className="label">Long-term impact</div>
                      <textarea className="input-base h-20" value={projectLongTermImpact} onChange={(e) => setProjectLongTermImpact(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="label">Scope clarity</div>
                        <input className="input-base" value={projectScopeClarity} onChange={(e) => setProjectScopeClarity(e.target.value)} />
                      </div>
                      <div>
                        <div className="label">Scope clarity (other)</div>
                        <input className="input-base" value={projectScopeClarityOther} onChange={(e) => setProjectScopeClarityOther(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="label">Publication potential</div>
                        <input className="input-base" value={projectPublicationPotential} onChange={(e) => setProjectPublicationPotential(e.target.value)} />
                      </div>
                      <div>
                        <div className="label">Data access</div>
                        <input className="input-base" value={projectDataAccess} onChange={(e) => setProjectDataAccess(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <div className="label">Cover image URL</div>
                      <input
                        className="input-base"
                        type="url"
                        placeholder="https://example.com/project-cover.jpg"
                        value={projectCoverImageUrl}
                        onChange={(e) => setProjectCoverImageUrl(e.target.value)}
                      />
                    </div>
                    <div>
                      <div className="label">Cohort</div>
                      <select className="select-base" value={projectCohortId} onChange={(e) => setProjectCohortId(e.target.value)}>
                        {cohortOptions.map((cohort) => (
                          <option key={cohort.id || 'none'} value={cohort.id}>
                            {cohort.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="label">Lifecycle status</div>
                      <select className="select-base" value={projectStatus} onChange={(e) => setProjectStatus(e.target.value)}>
                        <option value="draft">Draft (hidden from students)</option>
                        <option value="published">Published (visible and rankable)</option>
                        <option value="archived">Archived (visible, not rankable)</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="label">Contact name</div>
                        <input className="input-base" value={projectContactName} onChange={(e) => setProjectContactName(e.target.value)} />
                      </div>
                      <div>
                        <div className="label">Contact email</div>
                        <input className="input-base" value={projectContactEmail} onChange={(e) => setProjectContactEmail(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <div className="label">Required skills (comma-separated)</div>
                      <input className="input-base" value={projectSkills} onChange={(e) => setProjectSkills(e.target.value)} />
                    </div>
                    <div>
                      <div className="label">Other required skills</div>
                      <input className="input-base" value={projectSkillsOther} onChange={(e) => setProjectSkillsOther(e.target.value)} />
                    </div>
                    <div>
                      <div className="label">Technical domains (comma-separated)</div>
                      <input className="input-base" value={projectDomains} onChange={(e) => setProjectDomains(e.target.value)} />
                    </div>
                    <div>
                      <div className="label">Supplementary documents (one URL per line)</div>
                      <textarea className="input-base h-24" value={projectSupplementaryDocuments} onChange={(e) => setProjectSupplementaryDocuments(e.target.value)} />
                    </div>
                    <div>
                      <div className="label">Video links (one URL per line)</div>
                      <textarea className="input-base h-24" value={projectVideoLinks} onChange={(e) => setProjectVideoLinks(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button type="submit" className="btn-primary flex-1">
                        {editingProjectId ? 'Update project' : 'Create project'}
                      </button>
                      <button type="button" className="btn-secondary" onClick={resetProjectForm}>
                        Clear
                      </button>
                    </div>
                  </form>

                  {projectDetailCommentsOpen ? (
                    <div className="fixed inset-0 z-50" aria-live="polite">
                      <button
                        type="button"
                        className="absolute inset-0 bg-slate-900/30"
                        aria-label="Close project comments"
                        onClick={() => setProjectDetailCommentsOpen(false)}
                      />
                      <aside className="absolute right-0 top-0 h-full w-full max-w-lg border-l border-slate-200 bg-white shadow-2xl p-5 overflow-auto">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-500">Project Comments</div>
                            <div className="text-lg font-heading text-duke-900">Comment Review</div>
                          </div>
                          <button type="button" className="btn-secondary" onClick={() => setProjectDetailCommentsOpen(false)}>
                            Close
                          </button>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="text-[11px] text-slate-500">Total</div>
                            <div className="text-base font-semibold text-slate-800">{selectedProjectCommentStats.total}</div>
                          </div>
                          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="text-[11px] text-slate-500">Unresolved</div>
                            <div className="text-base font-semibold text-amber-700">{selectedProjectCommentStats.unresolved}</div>
                          </div>
                          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="text-[11px] text-slate-500">Resolved</div>
                            <div className="text-base font-semibold text-emerald-700">{selectedProjectCommentStats.resolved}</div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-end">
                          <button
                            type="button"
                            className="btn-secondary text-xs"
                            onClick={() => refreshSelectedProjectComments()}
                            disabled={commentActionsLoading || selectedProjectCommentsLoading}
                          >
                            Refresh
                          </button>
                        </div>

                        <div className="mt-3 space-y-2">
                          {selectedProjectCommentsLoading ? (
                            <div className="text-sm text-slate-500">Loading comments...</div>
                          ) : selectedProjectComments.length ? (
                            selectedProjectComments.map((item) => {
                              const commentId = item?.id
                              const isResolved = Boolean(item?.is_resolved)
                              const created = item?.created_at ? new Date(item.created_at) : null
                              const createdText = created && !Number.isNaN(created.getTime())
                                ? created.toLocaleString()
                                : 'Unknown time'
                              return (
                                <div key={commentId} className="rounded border border-slate-200 bg-white p-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="text-xs text-slate-500">
                                      <span className="font-semibold text-slate-700">
                                        {item?.student_display_name || item?.student_email || 'Student'}
                                      </span>
                                      <span>{' · '}{createdText}</span>
                                    </div>
                                    <span
                                      className={
                                        isResolved
                                          ? 'rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700'
                                          : 'rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700'
                                      }
                                    >
                                      {isResolved ? 'Resolved' : 'Unresolved'}
                                    </span>
                                  </div>
                                  <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{item?.comment || ''}</div>
                                  <div className="mt-2 flex justify-end">
                                    <button
                                      type="button"
                                      className="btn-secondary text-xs"
                                      disabled={commentActionsLoading}
                                      onClick={() => handleUpdateProjectComment(commentId, !isResolved)}
                                    >
                                      {isResolved ? 'Mark unresolved' : 'Mark resolved'}
                                    </button>
                                  </div>
                                </div>
                              )
                            })
                          ) : (
                            <div className="text-sm text-slate-500">No comments for this project yet.</div>
                          )}
                        </div>
                      </aside>
                    </div>
                  ) : null}


                </aside>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'assignment-rules' ? (
          <div
            className="space-y-6"
            role="tabpanel"
            id="admin-panel-assignment-rules"
            aria-labelledby="admin-tab-assignment-rules"
          >
            {ruleExplainOpen ? (
              <div className="fixed inset-0 z-40" aria-live="polite">
                <button
                  type="button"
                  className="absolute inset-0 bg-slate-900/30"
                  aria-label="Close rule explainer"
                  onClick={closeRuleExplainer}
                />
                <aside className="absolute right-0 top-0 h-full w-full max-w-md border-l border-slate-200 bg-white shadow-2xl p-5 overflow-auto">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">Rule Explainer</div>
                      <div className="text-lg font-heading text-duke-900">
                        {ruleExplainItem?.name || 'Assignment Rule'}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {ruleExplainItem?.cohort_id ? `Cohort ${ruleExplainItem.cohort_id}` : 'Global scope'}
                        {ruleExplainItem?.is_active ? ' · Active' : ' · Inactive'}
                      </div>
                    </div>
                    <button type="button" className="btn-secondary" onClick={closeRuleExplainer}>
                      Close
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {ruleExplainerSections(ruleExplainItem).map((section) => (
                      <div key={section.title} className="rounded-card border border-slate-200 bg-slate-50 p-3">
                        <div className="text-sm font-semibold text-slate-800">{section.title}</div>
                        <ul className="mt-2 space-y-1 text-xs text-slate-600 list-disc pl-4">
                          {section.points.map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </aside>
              </div>
            ) : null}

            <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-6">
            <div className="card p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-heading text-duke-900">Assignment Rule Configs</div>
                <button type="button" className="btn-secondary" onClick={() => togglePanel('rulesList')}>
                  {panelOpen.rulesList ? 'Collapse' : 'Expand'}
                </button>
              </div>

              {panelOpen.rulesList ? (
                <>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      className="select-base"
                      value={rulesCohortId}
                      onChange={async (e) => {
                        const next = e.target.value
                        setRulesCohortId(next)
                        setPreviewResult(null)
                        await refreshAssignmentRules(next)
                      }}
                    >
                      <option value="">Global configs</option>
                      {cohorts.map((cohort) => (
                        <option key={cohort.id} value={cohort.id}>
                          {cohort.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn-secondary" onClick={() => refreshAssignmentRules()}>
                      Refresh
                    </button>
                  </div>

                  <div className="mt-3 rounded-card border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    <div className="font-semibold text-slate-700">Active config</div>
                    {activeAssignmentRule ? (
                      <div className="mt-1">
                        <span className="font-medium">{activeAssignmentRule.name}</span>
                        <span className="text-slate-500"> · Team size {activeAssignmentRule.team_size}</span>
                      </div>
                    ) : (
                      <div className="mt-1 text-slate-500">No active config in this scope.</div>
                    )}
                  </div>

                  <div className="mt-4 space-y-2 max-h-[520px] overflow-auto">
                    {rulesLoading ? <div className="text-sm text-slate-500">Loading…</div> : null}
                    {!rulesLoading && filteredAssignmentRules.map((rule) => (
                      <div key={rule.id} className="rounded-card border border-slate-200 bg-white px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <button type="button" className="text-left" onClick={() => fillRuleForm(rule)}>
                            <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                              {rule.name}
                              {rule.is_active ? (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px]">
                                  Active
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-slate-500">
                              Scope: {rule.cohort_id ? `Cohort ${rule.cohort_id}` : 'Global'}
                            </div>
                            <div className="text-xs text-slate-400">
                              Team {rule.team_size} · Weights {rule.weight_project_preference}/{rule.weight_project_rating}/{rule.weight_mutual_want}
                            </div>
                          </button>
                          <div className="flex items-center gap-2">
                            <button type="button" className="btn-secondary" onClick={() => fillRuleForm(rule)}>
                              Edit
                            </button>
                            <button type="button" className="btn-secondary" onClick={() => handlePreviewRule(rule.id)}>
                              Preview
                            </button>
                            {!rule.is_active ? (
                              <button type="button" className="btn-secondary" onClick={() => handleActivateRule(rule.id)}>
                                Activate
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                    {!rulesLoading && filteredAssignmentRules.length === 0 ? (
                      <div className="text-sm text-slate-400">No configs found for this scope.</div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>

            <div className="card p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-heading text-duke-900">Rule Builder</div>
                  <div className="text-sm text-slate-500">Use a guided slide-over flow instead of editing everything inline.</div>
                </div>
              </div>

              <div className="mt-4 rounded-card border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="text-sm text-slate-600">
                  Configure basics, constraints, scoring, and review in separate steps.
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="btn-primary" onClick={openCreateRuleFlow}>
                    New rule flow
                  </button>
                </div>
              </div>
            </div>
            </div>

            {ruleFlowOpen ? (
              <div className="fixed inset-0 z-40" aria-live="polite">
                <button
                  type="button"
                  className="absolute inset-0 bg-slate-900/30"
                  aria-label="Close rule builder"
                  onClick={() => setRuleFlowOpen(false)}
                />
                <aside className="absolute right-0 top-0 h-full w-full max-w-xl border-l border-slate-200 bg-white shadow-2xl p-5 overflow-auto">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">Rule Builder</div>
                      <div className="text-lg font-heading text-duke-900">
                        {editingRuleId ? 'Edit assignment rule' : 'Create assignment rule'}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Step {ruleFlowStep} of 4</div>
                    </div>
                    <button type="button" className="btn-secondary" onClick={() => setRuleFlowOpen(false)}>
                      Close
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {[1, 2, 3, 4].map((step) => (
                      <button
                        key={step}
                        type="button"
                        className={
                          step === ruleFlowStep
                            ? 'rounded border border-duke-700 bg-duke-50 px-2 py-2 text-xs font-semibold text-duke-800'
                            : 'rounded border border-slate-200 bg-white px-2 py-2 text-xs text-slate-600 hover:bg-slate-50'
                        }
                        onClick={() => setRuleFlowStep(step)}
                      >
                        {step === 1 ? 'Basics' : step === 2 ? 'Constraints' : step === 3 ? 'Scoring' : 'Review'}
                      </button>
                    ))}
                  </div>

                  <form className="mt-4 space-y-3" onSubmit={editingRuleId ? handleUpdateRule : handleCreateRule}>
                    {ruleFlowStep === 1 ? (
                      <>
                        <div>
                          <div className="label">Config name</div>
                          <input className="input-base" value={ruleName} onChange={(e) => setRuleName(e.target.value)} required />
                        </div>

                        <div>
                          <div className="label">Scope cohort</div>
                          <select className="select-base" value={ruleFormCohortId} onChange={(e) => setRuleFormCohortId(e.target.value)}>
                            <option value="">Global (all cohorts)</option>
                            {cohorts.map((cohort) => (
                              <option key={cohort.id} value={cohort.id}>
                                {cohort.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <div className="label">Team size</div>
                            <input className="input-base" type="number" min="3" max="5" value={ruleTeamSize} onChange={(e) => setRuleTeamSize(e.target.value)} />
                          </div>
                          <div>
                            <div className="label">Max low preference/team</div>
                            <input className="input-base" type="number" min="0" max="8" value={ruleMaxLowPreference} onChange={(e) => setRuleMaxLowPreference(e.target.value)} />
                          </div>
                        </div>
                      </>
                    ) : null}

                    {ruleFlowStep === 2 ? (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <label className="rounded-card border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 flex items-center justify-between">
                            <span>Enforce same cohort</span>
                            <input type="checkbox" checked={ruleEnforceSameCohort} onChange={(e) => setRuleEnforceSameCohort(e.target.checked)} />
                          </label>
                          <label className="rounded-card border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 flex items-center justify-between">
                            <span>Hard avoid teammates</span>
                            <input type="checkbox" checked={ruleHardAvoid} onChange={(e) => setRuleHardAvoid(e.target.checked)} />
                          </label>
                        </div>

                        <div>
                          <div className="label">Avoid penalty</div>
                          <input className="input-base" type="number" min="0" max="1000" value={rulePenaltyAvoid} onChange={(e) => setRulePenaltyAvoid(e.target.value)} />
                        </div>

                        <div>
                          <div className="label">Notes</div>
                          <textarea className="input-base h-20" value={ruleNotes} onChange={(e) => setRuleNotes(e.target.value)} />
                        </div>
                      </>
                    ) : null}

                    {ruleFlowStep === 3 ? (
                      <>
                        <div className="rounded-card border border-slate-200 bg-slate-50 p-3 space-y-3">
                          <div className="text-sm font-medium text-slate-800">Weights</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <div className="label">Project preference</div>
                              <input className="input-base" type="number" min="0" max="100" value={ruleWeightProjectPreference} onChange={(e) => setRuleWeightProjectPreference(e.target.value)} />
                            </div>
                            <div>
                              <div className="label">Project rating</div>
                              <input className="input-base" type="number" min="0" max="100" value={ruleWeightProjectRating} onChange={(e) => setRuleWeightProjectRating(e.target.value)} />
                            </div>
                            <div>
                              <div className="label">Mutual want</div>
                              <input className="input-base" type="number" min="0" max="100" value={ruleWeightMutualWant} onChange={(e) => setRuleWeightMutualWant(e.target.value)} />
                            </div>
                          </div>
                        </div>

                        <label className="rounded-card border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 flex items-center justify-between">
                          <span>Set active after save</span>
                          <input type="checkbox" checked={ruleIsActive} onChange={(e) => setRuleIsActive(e.target.checked)} />
                        </label>
                      </>
                    ) : null}

                    {ruleFlowStep === 4 ? (
                      <div className="space-y-3">
                        <div className="rounded-card border border-slate-200 bg-slate-50 p-3">
                          <div className="text-sm font-semibold text-slate-800">Review</div>
                          <div className="mt-2 text-sm text-slate-600 space-y-1">
                            <div><span className="font-medium">Name:</span> {ruleName || '—'}</div>
                            <div><span className="font-medium">Scope:</span> {ruleFormCohortId ? `Cohort ${ruleFormCohortId}` : 'Global'}</div>
                            <div><span className="font-medium">Team size:</span> {ruleTeamSize}</div>
                            <div><span className="font-medium">Weights:</span> {ruleWeightProjectPreference}/{ruleWeightProjectRating}/{ruleWeightMutualWant}</div>
                            <div><span className="font-medium">Active:</span> {ruleIsActive ? 'Yes' : 'No'}</div>
                          </div>
                        </div>
                        <button type="button" className="btn-secondary w-full" onClick={openRuleExplainerFromForm}>
                          Open rule explainer for this config
                        </button>
                      </div>
                    ) : null}

                    {ruleFormError ? (
                      <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-card p-2.5">
                        {ruleFormError}
                      </div>
                    ) : null}

                    <div className="sticky bottom-0 bg-white pt-3 border-t border-slate-100 flex items-center gap-2">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={ruleFlowStep <= 1}
                        onClick={() => setRuleFlowStep((s) => Math.max(1, s - 1))}
                      >
                        Back
                      </button>
                      {ruleFlowStep < 4 ? (
                        <button type="button" className="btn-primary flex-1" onClick={() => setRuleFlowStep((s) => Math.min(4, s + 1))}>
                          Continue
                        </button>
                      ) : (
                        <button type="submit" className="btn-primary flex-1">
                          {editingRuleId ? 'Update assignment rule' : 'Create assignment rule'}
                        </button>
                      )}
                    </div>
                  </form>
                </aside>
              </div>
            ) : null}

            <div className="card p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-lg font-heading text-duke-900">Preview Output</div>
                  <div className="text-sm text-slate-500">Large-screen workspace for reviewing draft project teams.</div>
                </div>
                <div className="flex w-full md:w-auto flex-wrap md:flex-nowrap items-stretch md:items-center justify-end gap-2">
                  {previewResult ? (
                    <button type="button" className="btn-secondary w-full sm:w-auto whitespace-nowrap" onClick={handleExportTeamsCsv}>
                      Export teams CSV
                    </button>
                  ) : null}
                  {previewResult ? (
                    <button
                      type="button"
                      className="btn-secondary w-full sm:w-auto whitespace-nowrap"
                      onClick={handleSaveAssignmentSnapshot}
                      disabled={savingAssignmentRun}
                    >
                      {savingAssignmentRun ? 'Saving snapshot…' : 'Save snapshot'}
                    </button>
                  ) : null}
                  {editingRuleId ? (
                    <button
                      type="button"
                      className="btn-primary w-full sm:w-auto whitespace-nowrap"
                      onClick={() => handlePreviewRule(editingRuleId)}
                      disabled={previewLoading}
                    >
                      {previewLoading ? 'Running preview…' : 'Preview selected rule'}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 rounded-card border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Preassign Students To Projects</div>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                  <select className="select-base" value={manualStudentId} onChange={(e) => setManualStudentId(e.target.value)}>
                    <option value="">Select student</option>
                    {assignmentStudents.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.display_name || row.email || `User ${row.id}`}
                      </option>
                    ))}
                  </select>
                  <select className="select-base" value={manualProjectId} onChange={(e) => setManualProjectId(e.target.value)}>
                    <option value="">Select project</option>
                    {assignmentProjects.map((row) => (
                      <option key={row.project_id} value={row.project_id}>
                        {row.project_title || row.organization || `Project ${row.project_id}`}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn-secondary" onClick={addManualPreassignment}>
                    Add preassignment
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {manualPreassignments.map((row) => {
                    const student = assignmentStudents.find((s) => Number(s.id) === Number(row.user_id))
                    const project = assignmentProjects.find((p) => Number(p.project_id) === Number(row.project_id))
                    return (
                      <button
                        key={`${row.user_id}-${row.project_id}`}
                        type="button"
                        className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs text-amber-800"
                        onClick={() => removeManualPreassignment(row.user_id)}
                        title="Click to remove"
                      >
                        {(student?.display_name || student?.email || `User ${row.user_id}`)} {' -> '} {(project?.project_title || project?.organization || `Project ${row.project_id}`)}
                      </button>
                    )
                  })}
                  {manualPreassignments.length === 0 ? (
                    <div className="text-xs text-slate-500">No manual preassignments yet.</div>
                  ) : null}
                </div>
              </div>

              {!previewResult ? (
                <div className="mt-3 text-sm text-slate-400">No preview generated yet.</div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-card border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                    <div>Total students: {previewResult.total_students}</div>
                    <div>Target team size: {previewResult.team_size}</div>
                    <div>Projects considered: {previewResult.projects_considered}</div>
                    <div>Projects selected: {previewResult.projects_selected}</div>
                    <div>Unassigned: {previewResult.unassigned_count}</div>
                    <div>Team range: {previewResult.min_team_size || 3}-{previewResult.max_team_size || 5}</div>
                  </div>

                  {Array.isArray(previewResult.warnings) && previewResult.warnings.length > 0 ? (
                    <div className="rounded-card border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      {previewResult.warnings.join(' | ')}
                    </div>
                  ) : null}

                  {Array.isArray(previewResult.unassigned_students) && previewResult.unassigned_students.length > 0 ? (
                    <div className="rounded-card border border-red-200 bg-red-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-red-700">Unassigned Students</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {previewResult.unassigned_students.map((member) => (
                          <span key={`unassigned-${member.user_id}`} className="rounded-full border border-red-300 bg-white px-2 py-1 text-xs text-red-700">
                            {member.display_name || member.email || `User ${member.user_id}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="rounded-card border border-slate-200 bg-white p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quality Metrics</div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-700">
                        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">Top 1: {previewResult.quality?.top1_rate ?? 0}%</div>
                        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">Top 3: {previewResult.quality?.top3_rate ?? 0}%</div>
                        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">Top 5: {previewResult.quality?.top5_rate ?? 0}%</div>
                        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">Top 10: {previewResult.quality?.top10_rate ?? 0}%</div>
                        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">Ranked coverage: {previewResult.quality?.ranked_assignment_rate ?? 0}%</div>
                        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">Avg score: {previewResult.quality?.average_assigned_score ?? 'n/a'}</div>
                      </div>
                    </div>

                    <div className="rounded-card border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Integrity Checks</div>
                        <span
                          className={
                            previewResult.integrity?.ready
                              ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700'
                              : 'rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700'
                          }
                        >
                          {previewResult.integrity?.ready ? 'Ready' : 'Needs attention'}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-700 space-y-1">
                        <div>Submitted rankings: {previewResult.integrity?.submitted_rankings ?? 0}/{previewResult.integrity?.total_students ?? 0}</div>
                        <div>Complete top-10 rankings: {previewResult.integrity?.complete_rankings ?? 0}</div>
                        <div>Projects needed/available: {previewResult.integrity?.projects_needed ?? 0}/{previewResult.integrity?.projects_considered ?? 0}</div>
                      </div>
                      {Array.isArray(previewResult.integrity?.blocking_issues) && previewResult.integrity.blocking_issues.length > 0 ? (
                        <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                          {previewResult.integrity.blocking_issues.join(' | ')}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs text-slate-700">
                    <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                      Preassigned: {(previewResult.project_assignments || []).reduce((acc, proj) => acc + (proj.teams || []).flat().filter((m) => m.is_preassigned).length, 0)}
                    </div>
                    <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                      Avg students / project: {(previewResult.projects_selected || 0) > 0 ? ((previewResult.total_students || 0) / previewResult.projects_selected).toFixed(1) : '0.0'}
                    </div>
                    <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                      Students with rank: {previewResult.quality?.assigned_with_rank ?? 0}
                    </div>
                    <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                      Move mode: drag any student bubble to another project/team
                    </div>
                  </div>

                  {savedAssignmentRuns.length > 0 ? (
                    <div className="rounded-card border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Saved Snapshots</div>
                      <div className="mt-2 space-y-1.5 text-xs text-slate-700 max-h-32 overflow-auto">
                        {savedAssignmentRuns.map((run) => (
                          <div key={run.id} className="rounded border border-slate-200 bg-white px-2 py-1.5 flex items-center justify-between gap-2">
                            <span>#{run.id} · {run.source_preview_run_id ? `Preview ${run.source_preview_run_id}` : 'Manual'} · {run.created_at ? new Date(run.created_at).toLocaleString() : 'Unknown time'}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500">Rule {run.rule_config_id}</span>
                              <button
                                type="button"
                                className="btn-secondary text-xs"
                                onClick={() => handleLoadSavedAssignmentRun(run)}
                                disabled={previewLoading}
                              >
                                Load
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="max-h-[65vh] overflow-auto pr-1">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                      {(previewResult.project_assignments || []).map((proj) => {
                        const flattenedMembers = (proj.teams || []).flat()
                        const preassignedCount = flattenedMembers.filter((m) => m.is_preassigned).length
                        const rankedCount = flattenedMembers.filter((m) => Number(m.assigned_rank || 0) > 0).length
                        const averageRank = rankedCount > 0
                          ? (flattenedMembers
                            .filter((m) => Number(m.assigned_rank || 0) > 0)
                            .reduce((acc, m) => acc + Number(m.assigned_rank), 0) / rankedCount).toFixed(2)
                          : 'n/a'

                        return (
                          <div
                            key={proj.project_id}
                            className="rounded-card border border-slate-200 bg-white p-3"
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault()
                              const userId = Number(event.dataTransfer.getData('text/plain') || dragStudentUserId)
                              if (userId) movePreviewStudent(userId, proj.project_id)
                              setDragStudentUserId(null)
                            }}
                          >
                            <div className="text-sm font-semibold text-slate-800">{proj.project_title}</div>
                            <div className="text-xs text-slate-500">{proj.organization || 'Unknown org'} · Assigned {proj.assigned_count}</div>

                            <div className="mt-2 grid grid-cols-3 gap-1 text-[11px]">
                              <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">Preassigned {preassignedCount}</div>
                              <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">Ranked {rankedCount}</div>
                              <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">Avg rank {averageRank}</div>
                            </div>

                            <div className="mt-2 space-y-2">
                              {(proj.teams || []).map((team, teamIdx) => (
                                <div
                                  key={`${proj.project_id}-${teamIdx}`}
                                  className="rounded border border-slate-200 bg-slate-50 px-2 py-2"
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={(event) => {
                                    event.preventDefault()
                                    const userId = Number(event.dataTransfer.getData('text/plain') || dragStudentUserId)
                                    if (userId) movePreviewStudent(userId, proj.project_id)
                                    setDragStudentUserId(null)
                                  }}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs font-medium text-slate-700">Team {teamIdx + 1}</div>
                                    <div className="text-[11px] text-slate-500">{team.length} members</div>
                                  </div>
                                  <div className="mt-1 space-y-1">
                                    {(team || []).map((member) => (
                                      <div
                                        key={`${proj.project_id}-${teamIdx}-${member.user_id}`}
                                        className={
                                          member.is_preassigned
                                            ? 'text-xs rounded-full border border-amber-300 bg-amber-100 text-amber-900 px-2 py-1 cursor-grab'
                                            : 'text-xs rounded-full border border-blue-200 bg-blue-50 text-blue-900 px-2 py-1 cursor-grab'
                                        }
                                        draggable
                                        onDragStart={(event) => {
                                          setDragStudentUserId(member.user_id)
                                          event.dataTransfer.setData('text/plain', String(member.user_id))
                                        }}
                                        onDragEnd={() => setDragStudentUserId(null)}
                                      >
                                        {(member.display_name || member.email || `User ${member.user_id}`)}
                                        <span className="text-slate-500"> · score {member.assigned_score}</span>
                                        {member.assigned_rank ? (
                                          <span className="text-slate-500"> · rank #{member.assigned_rank}</span>
                                        ) : null}
                                        {member.is_preassigned ? (
                                          <span className="text-amber-700"> · preassigned</span>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {activeTab === 'team-preferences' ? (
          <div
            className="card p-6"
            role="tabpanel"
            id="admin-panel-team-preferences"
            aria-labelledby="admin-tab-team-preferences"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-lg font-heading text-duke-900">Team / Partner Preferences</div>
                <div className="text-sm text-slate-500">Review student want and avoid selections by cohort.</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="select-base"
                  value={partnerCohortId}
                  onChange={async (e) => {
                    const next = e.target.value
                    setPartnerCohortId(next)
                    await refreshPartnerPreferences(next)
                  }}
                >
                  <option value="">All cohorts</option>
                  {cohorts.map((cohort) => (
                    <option key={cohort.id} value={cohort.id}>
                      {cohort.name}
                    </option>
                  ))}
                </select>
                <label className="inline-flex items-center gap-2 text-sm text-slate-600 rounded-card border border-slate-200 bg-slate-50 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={partnerIncludeComments}
                    onChange={async (e) => {
                      const checked = e.target.checked
                      setPartnerIncludeComments(checked)
                      await refreshPartnerPreferences(partnerCohortId, checked)
                    }}
                  />
                  Include comments
                </label>
                <button type="button" className="btn-secondary" onClick={() => refreshPartnerPreferences()}>
                  Refresh
                </button>
                <button type="button" className="btn-primary" onClick={handleExportPartnerPreferencesCsv}>
                  Export CSV
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-card border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-800">Insights</div>
                <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <div className="rounded border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[11px] text-slate-500">Students</div>
                    <div className="text-base font-semibold text-slate-800">{partnerAnalysis.totalStudents}</div>
                    <div className="text-[11px] text-slate-500">{partnerAnalysis.studentsWithAny} with preferences</div>
                  </div>
                  <div className="rounded border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[11px] text-slate-500">Preferences</div>
                    <div className="text-base font-semibold text-slate-800">{partnerAnalysis.totalWants + partnerAnalysis.totalAvoids}</div>
                    <div className="text-[11px] text-slate-500">Want {partnerAnalysis.totalWants} · Avoid {partnerAnalysis.totalAvoids}</div>
                  </div>
                  <div className="rounded border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[11px] text-slate-500">Mutual Signals</div>
                    <div className="text-base font-semibold text-slate-800">{partnerAnalysis.studentsWithMutual}</div>
                    <div className="text-[11px] text-slate-500">{partnerAnalysis.mutualPairCount} mutual pairs</div>
                  </div>
                  <div className="rounded border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[11px] text-slate-500">Potential Conflicts</div>
                    <div className="text-base font-semibold text-slate-800">{partnerAnalysis.studentsWithConflict}</div>
                    <div className="text-[11px] text-slate-500">{partnerAnalysis.conflictPairCount} conflict pairs</div>
                  </div>
                </div>

                <div className="mt-3 rounded border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Connection Graph (Want/Avoid)</div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />Want</span>
                      <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-rose-500" />Avoid</span>
                      <button
                        type="button"
                        className="btn-secondary h-8 px-3 text-xs"
                        onClick={() => setPartnerGraphExpanded(true)}
                      >
                        Expand
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 overflow-x-auto">
                    <PartnerNetwork3D graph={partnerConnectionGraph} onNodeSelect={setSelectedGraphUserId} />
                  </div>
                  {(partnerConnectionGraph.hiddenNodes > 0 || partnerConnectionGraph.hiddenEdges > 0) ? (
                    <div className="mt-2 text-[11px] text-slate-500">
                      Showing top {partnerConnectionGraph.nodes.length} connected students.
                      {partnerConnectionGraph.hiddenNodes > 0 ? ` Hidden nodes: ${partnerConnectionGraph.hiddenNodes}.` : ''}
                      {partnerConnectionGraph.hiddenEdges > 0 ? ` Hidden edges: ${partnerConnectionGraph.hiddenEdges}.` : ''}
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="rounded border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Signal Mix</div>
                    <div className="mt-2 space-y-2">
                      {partnerSignalSeries.distribution.map((item) => (
                        <div key={item.key}>
                          <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                            <span>{item.label}</span>
                            <span className="font-semibold text-slate-800">{item.value} ({item.pct}%)</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-2 rounded-full ${item.barClass}`} style={{ width: `${item.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Engagement</div>
                    <div className="mt-2 space-y-2 text-xs text-slate-600">
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span>Students with any preference</span>
                          <span className="font-semibold text-slate-800">
                            {partnerAnalysis.totalStudents > 0
                              ? Math.round((partnerAnalysis.studentsWithAny / partnerAnalysis.totalStudents) * 100)
                              : 0}%
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-blue-500"
                            style={{
                              width: `${partnerAnalysis.totalStudents > 0
                                ? Math.round((partnerAnalysis.studentsWithAny / partnerAnalysis.totalStudents) * 100)
                                : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span>Students with mutual matches</span>
                          <span className="font-semibold text-slate-800">
                            {partnerAnalysis.totalStudents > 0
                              ? Math.round((partnerAnalysis.studentsWithMutual / partnerAnalysis.totalStudents) * 100)
                              : 0}%
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-indigo-500"
                            style={{
                              width: `${partnerAnalysis.totalStudents > 0
                                ? Math.round((partnerAnalysis.studentsWithMutual / partnerAnalysis.totalStudents) * 100)
                                : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <div className="rounded border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Top Wanted</div>
                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      {partnerAnalysis.topWanted.map((item) => (
                        <div key={`wanted-${item.label}`} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate" title={item.label}>{item.label}</span>
                            <span className="font-semibold text-slate-800">{item.count}</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-1.5 rounded-full bg-emerald-500"
                              style={{ width: `${Math.max(8, Math.round((item.count / Math.max(1, partnerAnalysis.topWanted[0]?.count || 1)) * 100))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                      {partnerAnalysis.topWanted.length === 0 ? <div className="text-slate-400">No wanted selections yet.</div> : null}
                    </div>
                  </div>

                  <div className="rounded border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Top Avoided</div>
                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      {partnerAnalysis.topAvoided.map((item) => (
                        <div key={`avoided-${item.label}`} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate" title={item.label}>{item.label}</span>
                            <span className="font-semibold text-slate-800">{item.count}</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-1.5 rounded-full bg-rose-500"
                              style={{ width: `${Math.max(8, Math.round((item.count / Math.max(1, partnerAnalysis.topAvoided[0]?.count || 1)) * 100))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                      {partnerAnalysis.topAvoided.length === 0 ? <div className="text-slate-400">No avoid selections yet.</div> : null}
                    </div>
                  </div>

                  <div className="rounded border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Quality Snapshot</div>
                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      <div>Students without preferences: <span className="font-semibold text-slate-800">{partnerAnalysis.studentsWithoutAny}</span></div>
                      <div>Avg want per student: <span className="font-semibold text-slate-800">{partnerAnalysis.averageWantsPerStudent}</span></div>
                      <div>Avg avoid per student: <span className="font-semibold text-slate-800">{partnerAnalysis.averageAvoidsPerStudent}</span></div>
                      <div>Comment coverage: <span className="font-semibold text-slate-800">{partnerAnalysis.commentRate}%</span></div>
                    </div>
                  </div>
                </div>

                {partnerAnalysis.mutualPairs.length > 0 ? (
                  <div className="mt-3 rounded border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Sample Mutual Pairs</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {partnerAnalysis.mutualPairs.map((pair) => (
                        <span key={pair.pairKey} className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700">
                          {pair.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className="input-base"
                  placeholder="Search by student name or email"
                  value={partnerQuery}
                  onChange={(e) => setPartnerQuery(e.target.value)}
                />
                <select
                  className="select-base"
                  value={partnerFilterMode}
                  onChange={(e) => setPartnerFilterMode(e.target.value)}
                >
                  <option value="all">All students</option>
                  <option value="no-preferences">No preferences</option>
                  <option value="high-avoid">High avoid count</option>
                  <option value="mutual-want">Has mutual wants</option>
                  <option value="conflict">Has conflicts</option>
                </select>
                <button type="button" className="btn-secondary" onClick={() => togglePanel('teamPreferencesList')}>
                  {panelOpen.teamPreferencesList ? 'Collapse list' : 'Expand list'}
                </button>
              </div>

              {panelOpen.teamPreferencesList ? (
                <>
                  {partnerLoading ? <div className="text-sm text-slate-500">Loading…</div> : null}
                  {!partnerLoading && filteredPartnerPreferences.length === 0 ? (
                    <div className="text-sm text-slate-400">
                      {partnerQuery ? 'No matching students.' : 'No partner preferences found.'}
                    </div>
                  ) : null}

                  {filteredPartnerPreferences.map((row) => (
                    <div key={row.user_id} className="rounded-card border border-slate-200 bg-white p-4">
                      {(() => {
                        const status = partnerAnalysis.statusByUserId.get(row.user_id) || {}
                        return (
                          <>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={resolveProfileImageUrl({
                              displayName: row.display_name,
                              email: row.email,
                              profileImageUrl: row.profile_image_url,
                            })}
                            alt={row.display_name || row.email || `User ${row.user_id}`}
                            className="h-9 w-9 rounded-full border border-slate-200 bg-white object-cover"
                            loading="lazy"
                            onError={(event) => {
                              event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                              event.currentTarget.onerror = null
                            }}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-800 truncate">
                              {row.display_name || row.email || `User ${row.user_id}`}
                            </div>
                            <div className="text-xs text-slate-500 truncate">{row.email}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1">Want: {row.want_count || 0}</span>
                          <span className="rounded border border-rose-200 bg-rose-50 px-2 py-1">Avoid: {row.avoid_count || 0}</span>
                          {status.hasMutualWant ? <span className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">Mutual wants</span> : null}
                          {status.hasConflict ? <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">Conflict</span> : null}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded border border-emerald-200 bg-emerald-50/40 p-3">
                          <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Want</div>
                          <div className="mt-2 space-y-2">
                            {(row.want || []).map((choice) => (
                              <div key={`${row.user_id}-want-${choice.student_id}`} className="rounded border border-emerald-200 bg-white px-2 py-2 text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <img
                                    src={resolveProfileImageUrl({
                                      displayName: choice.full_name,
                                      email: choice.email,
                                      profileImageUrl: choice.profile_image_url,
                                    })}
                                    alt={choice.full_name || choice.email || `Student ${choice.student_id}`}
                                    className="h-7 w-7 rounded-full border border-slate-200 bg-white object-cover"
                                    loading="lazy"
                                    onError={(event) => {
                                      event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                                      event.currentTarget.onerror = null
                                    }}
                                  />
                                  <div className="min-w-0">
                                    <div className="font-medium text-slate-700 truncate">{choice.full_name || choice.email || `Student ${choice.student_id}`}</div>
                                    {choice.email ? <div className="text-slate-500 truncate">{choice.email}</div> : null}
                                  </div>
                                </div>
                                {partnerIncludeComments && choice.comment ? <div className="mt-1 text-slate-600">Comment: {choice.comment}</div> : null}
                              </div>
                            ))}
                            {(row.want || []).length === 0 ? <div className="text-xs text-slate-500">No preferred teammates selected.</div> : null}
                          </div>
                        </div>

                        <div className="rounded border border-rose-200 bg-rose-50/40 p-3">
                          <div className="text-xs font-semibold text-rose-700 uppercase tracking-wide">Avoid</div>
                          <div className="mt-2 space-y-2">
                            {(row.avoid || []).map((choice) => (
                              <div key={`${row.user_id}-avoid-${choice.student_id}`} className="rounded border border-rose-200 bg-white px-2 py-2 text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <img
                                    src={resolveProfileImageUrl({
                                      displayName: choice.full_name,
                                      email: choice.email,
                                      profileImageUrl: choice.profile_image_url,
                                    })}
                                    alt={choice.full_name || choice.email || `Student ${choice.student_id}`}
                                    className="h-7 w-7 rounded-full border border-slate-200 bg-white object-cover"
                                    loading="lazy"
                                    onError={(event) => {
                                      event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                                      event.currentTarget.onerror = null
                                    }}
                                  />
                                  <div className="min-w-0">
                                    <div className="font-medium text-slate-700 truncate">{choice.full_name || choice.email || `Student ${choice.student_id}`}</div>
                                    {choice.email ? <div className="text-slate-500 truncate">{choice.email}</div> : null}
                                  </div>
                                </div>
                                {partnerIncludeComments && choice.comment ? <div className="mt-1 text-slate-600">Comment: {choice.comment}</div> : null}
                              </div>
                            ))}
                            {(row.avoid || []).length === 0 ? <div className="text-xs text-slate-500">No avoid preferences selected.</div> : null}
                          </div>
                        </div>
                      </div>
                          </>
                        )
                      })()}
                    </div>
                  ))}
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === 'companies' ? (
          <div
            className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6"
            role="tabpanel"
            id="admin-panel-companies"
            aria-labelledby="admin-tab-companies"
          >
            <div className="card p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-heading text-duke-900">Companies</div>
                <button type="button" className="btn-secondary" onClick={() => togglePanel('companiesList')}>
                  {panelOpen.companiesList ? 'Collapse' : 'Expand'}
                </button>
              </div>
              {panelOpen.companiesList ? (
              <>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input className="input-base" placeholder="Search companies" value={companyQuery} onChange={(e) => setCompanyQuery(e.target.value)} />
                <button type="button" className="btn-secondary" onClick={() => setCompanySortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
                  Sort {companySortDir === 'asc' ? 'A-Z' : 'Z-A'}
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {filteredCompanies.map((company) => (
                  <div key={company.id} className="rounded-card border border-slate-200 bg-white px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="text-left"
                        onClick={() => fillCompanyForm(company)}
                      >
                        <div className="text-sm font-semibold text-slate-800">{company.name}</div>
                        <div className="text-xs text-slate-500">{company.sector || 'No sector'}</div>
                        <div className="text-xs text-slate-500">{company.industry || 'No industry'}</div>
                        <div className="text-xs text-slate-400">{company.website || 'No website'}</div>
                        {company.logo_url ? <div className="text-xs text-slate-400">Logo set</div> : null}
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-duke-800"
                          onClick={() => fillCompanyForm(company)}
                          aria-label={`Edit ${company.name || 'company'}`}
                          title="Edit company"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-300 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => handleDeleteCompany(company.id, company.name)}
                          aria-label={`Delete ${company.name || 'company'}`}
                          title="Delete company"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredCompanies.length === 0 ? <div className="text-sm text-slate-400">{companyQuery ? 'No matching companies.' : 'No companies yet.'}</div> : null}
              </div>
              </>
              ) : null}
            </div>

            <div className="card p-6">
              <div className="flex items-center justify-between">
                <div className="text-lg font-heading text-duke-900">{editingCompanyId ? 'Edit company' : 'Create company'}</div>
                <button type="button" className="btn-secondary" onClick={() => togglePanel('companiesForm')}>
                  {panelOpen.companiesForm ? 'Collapse' : 'Expand'}
                </button>
              </div>
              {panelOpen.companiesForm ? (
              <>
              <div className="mt-3">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={resetCompanyForm}
                >
                  New company
                </button>
              </div>
              <form className="mt-4 space-y-3" onSubmit={editingCompanyId ? handleUpdateCompany : handleCreateCompany}>
                <div>
                  <div className="label">Name</div>
                  <input className="input-base" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
                </div>
                <div>
                  <div className="label">Sector</div>
                  <input className="input-base" value={companySector} onChange={(e) => setCompanySector(e.target.value)} />
                </div>
                <div>
                  <div className="label">Industry</div>
                  <input className="input-base" value={companyIndustry} onChange={(e) => setCompanyIndustry(e.target.value)} />
                </div>
                <div>
                  <div className="label">Website</div>
                  <input className="input-base" value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)} />
                </div>
                <div>
                  <div className="label">Logo URL</div>
                  <input
                    className="input-base"
                    value={companyLogoUrl}
                    onChange={(e) => setCompanyLogoUrl(e.target.value)}
                    placeholder="https://.../logo.png"
                  />
                </div>
                {companyLogoUrl ? (
                  <div className="rounded-card border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500 mb-2">Logo preview</div>
                    <img
                      src={companyLogoUrl}
                      alt="Company logo preview"
                      className="h-10 w-auto object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  </div>
                ) : null}
                <div className="sticky bottom-0 bg-white pt-3 border-t border-slate-100">
                  <button type="submit" className="btn-primary w-full">{editingCompanyId ? 'Update company' : 'Create company'}</button>
                </div>
              </form>
              </>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === 'users' ? (
          <div
            className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6"
            role="tabpanel"
            id="admin-panel-users"
            aria-labelledby="admin-tab-users"
          >
            <div className="card p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-heading text-duke-900">Users</div>
                <button type="button" className="btn-secondary" onClick={() => togglePanel('usersList')}>
                  {panelOpen.usersList ? 'Collapse' : 'Expand'}
                </button>
              </div>
              {panelOpen.usersList ? (
              <>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input className="input-base" placeholder="Search users" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
                <button type="button" className="btn-secondary" onClick={() => setUserSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
                  Sort {userSortDir === 'asc' ? 'A-Z' : 'Z-A'}
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {filteredUsers.map((item) => (
                  <div key={item.id} className="rounded-card border border-slate-200 bg-white px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="text-left flex items-start gap-2"
                        onClick={() => fillUserForm(item)}
                      >
                        <img
                          src={resolveProfileImageUrl({ displayName: item.display_name, email: item.email })}
                          alt={item.display_name || item.email || 'User'}
                          className="h-9 w-9 rounded-full border border-slate-200 bg-white object-cover flex-shrink-0"
                          onError={(event) => {
                            event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                            event.currentTarget.onerror = null
                          }}
                        />
                        <div>
                          <div className="text-sm font-semibold text-slate-800">
                            {item.display_name || item.email}
                          </div>
                          <div className="text-xs text-slate-500">{item.email}</div>
                          <div className="text-xs text-slate-400">Role: {item.role || 'student'}</div>
                          {item.program_shorthand ? (
                            <div className="text-xs text-slate-400">Program shorthand: {item.program_shorthand}</div>
                          ) : null}
                          {item.role === 'faculty' && (item.faculty_title || item.faculty_department) ? (
                            <div className="text-xs text-slate-400">
                              Faculty: {[item.faculty_title, item.faculty_department].filter(Boolean).join(' · ')}
                            </div>
                          ) : null}
                        </div>
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-duke-800"
                          onClick={() => fillUserForm(item)}
                          aria-label={`Edit ${item.display_name || item.email || 'user'}`}
                          title="Edit user"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                        {item.id === user?.id ? (
                          <span className="text-xs text-slate-400">You</span>
                        ) : (
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-300 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => handleDeleteUser(item.id, item.email)}
                            aria-label={`Delete ${item.display_name || item.email || 'user'}`}
                            title="Delete user"
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {filteredUsers.length === 0 ? <div className="text-sm text-slate-400">{userQuery ? 'No matching users.' : 'No users yet.'}</div> : null}
              </div>
              </>
              ) : null}
            </div>

            <div className="card p-6">
              <div className="flex items-center justify-between">
                <div className="text-lg font-heading text-duke-900">{editingUserId ? 'Edit user' : 'Create user'}</div>
                <button type="button" className="btn-secondary" onClick={() => togglePanel('usersForm')}>
                  {panelOpen.usersForm ? 'Collapse' : 'Expand'}
                </button>
              </div>
              {panelOpen.usersForm ? (
              <>
              <div className="mt-3">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={resetUserForm}
                >
                  New user
                </button>
              </div>
              <form className="mt-4 space-y-3" onSubmit={editingUserId ? handleUpdateUser : handleCreateUser}>
                <div className="rounded-card border border-slate-200 bg-slate-50 p-3 flex items-center gap-3">
                  <img
                    src={resolveProfileImageUrl({
                      displayName: userDisplayName,
                      email: userEmail,
                      profileImageUrl: userProfileImageUrl,
                    })}
                    alt={userDisplayName || userEmail || 'User preview'}
                    className="h-12 w-12 rounded-full border border-slate-200 bg-white object-cover"
                    onError={(event) => {
                      event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                      event.currentTarget.onerror = null
                    }}
                  />
                  <div className="text-sm text-slate-600">
                    <div className="font-medium text-slate-800">Avatar preview</div>
                    <div>{userDisplayName || userEmail || 'Name preview appears here'}</div>
                  </div>
                </div>
                <div>
                  <div className="label">Email</div>
                  <input className="input-base" type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} required />
                </div>
                <div>
                  <div className="label">Password {editingUserId ? '(leave blank to keep unchanged)' : ''}</div>
                  <input className="input-base" type="password" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} required={!editingUserId} />
                </div>
                <div>
                  <div className="label">Display name</div>
                  <input className="input-base" value={userDisplayName} onChange={(e) => setUserDisplayName(e.target.value)} />
                </div>
                <div>
                  <div className="label">Profile image URL</div>
                  <input
                    className="input-base"
                    type="url"
                    value={userProfileImageUrl}
                    onChange={(e) => setUserProfileImageUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                {userFormError ? (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-card p-2.5">
                    {userFormError}
                  </div>
                ) : null}
                <div>
                  <div className="label">Role</div>
                  <select className="select-base" value={userRole} onChange={(e) => setUserRole(e.target.value)}>
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="label">Program shorthand</div>
                  <input
                    className="input-base"
                    value={userProgramShorthand}
                    onChange={(e) => setUserProgramShorthand(e.target.value)}
                    placeholder="MIDS, STAT, ECON, etc."
                  />
                </div>
                {userRole === 'faculty' ? (
                  <>
                    <div>
                      <div className="label">Faculty title</div>
                      <input
                        className="input-base"
                        value={userFacultyTitle}
                        onChange={(e) => setUserFacultyTitle(e.target.value)}
                        placeholder="Professor, Lecturer, etc."
                      />
                    </div>
                    <div>
                      <div className="label">Faculty department</div>
                      <input
                        className="input-base"
                        value={userFacultyDepartment}
                        onChange={(e) => setUserFacultyDepartment(e.target.value)}
                        placeholder="Statistics, Computer Science, etc."
                      />
                    </div>
                  </>
                ) : null}
                <div>
                  <div className="label">Cohort</div>
                  <select className="select-base" value={userCohortId} onChange={(e) => setUserCohortId(e.target.value)}>
                    {cohortOptions.map((cohort) => (
                      <option key={cohort.id || 'none'} value={cohort.id}>
                        {cohort.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sticky bottom-0 bg-white pt-3 border-t border-slate-100">
                  <button type="submit" className="btn-primary w-full" disabled={userSaving}>
                    {userSaving
                      ? editingUserId
                        ? 'Updating user...'
                        : 'Creating user...'
                      : editingUserId
                        ? 'Update user'
                        : 'Create user'}
                  </button>
                </div>
              </form>
              </>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === 'cohorts' ? (
          <div
            className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6"
            role="tabpanel"
            id="admin-panel-cohorts"
            aria-labelledby="admin-tab-cohorts"
          >
            <div className="card p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-heading text-duke-900">Cohorts</div>
                <button type="button" className="btn-secondary" onClick={() => togglePanel('cohortsList')}>
                  {panelOpen.cohortsList ? 'Collapse' : 'Expand'}
                </button>
              </div>
              {panelOpen.cohortsList ? (
              <>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input className="input-base" placeholder="Search cohorts" value={cohortQuery} onChange={(e) => setCohortQuery(e.target.value)} />
                <button type="button" className="btn-secondary" onClick={() => setCohortSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
                  Sort {cohortSortDir === 'asc' ? 'A-Z' : 'Z-A'}
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {filteredCohorts.map((cohort) => (
                  <div key={cohort.id} className="rounded-card border border-slate-200 bg-white px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="text-left"
                        onClick={() => fillCohortForm(cohort)}
                      >
                        <div className="text-sm font-semibold text-slate-800">{cohort.name}</div>
                        <div className="text-xs text-slate-500">
                          {cohort.program || 'Program n/a'} {cohort.year ? `· ${cohort.year}` : ''}
                        </div>
                        <div className="text-xs text-slate-400">
                          Rankings editable until: {cohort.rankings_editable_until ? new Date(cohort.rankings_editable_until).toLocaleString() : 'No deadline'}
                        </div>
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-duke-800"
                          onClick={() => fillCohortForm(cohort)}
                          aria-label={`Edit ${cohort.name || 'cohort'}`}
                          title="Edit cohort"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-300 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => handleDeleteCohort(cohort.id, cohort.name)}
                          aria-label={`Delete ${cohort.name || 'cohort'}`}
                          title="Delete cohort"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredCohorts.length === 0 ? <div className="text-sm text-slate-400">{cohortQuery ? 'No matching cohorts.' : 'No cohorts yet.'}</div> : null}
              </div>
              </>
              ) : null}
            </div>

            <div className="card p-6">
              <div className="flex items-center justify-between">
                <div className="text-lg font-heading text-duke-900">{editingCohortId ? 'Edit cohort' : 'Create cohort'}</div>
                <button type="button" className="btn-secondary" onClick={() => togglePanel('cohortsForm')}>
                  {panelOpen.cohortsForm ? 'Collapse' : 'Expand'}
                </button>
              </div>
              {panelOpen.cohortsForm ? (
              <>
              <div className="mt-3">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={resetCohortForm}
                >
                  New cohort
                </button>
              </div>
              <form className="mt-4 space-y-3" onSubmit={editingCohortId ? handleUpdateCohort : handleCreateCohort}>
                <div>
                  <div className="label">Name</div>
                  <input
                    className="input-base"
                    value={cohortName}
                    onChange={(e) => setCohortName(e.target.value)}
                    placeholder="CAP2027"
                    required
                  />
                </div>
                <div>
                  <div className="label">Program (optional)</div>
                  <input
                    className="input-base"
                    value={cohortProgram}
                    onChange={(e) => setCohortProgram(e.target.value)}
                    placeholder="Cross-program or school label (optional)"
                  />
                </div>
                <div>
                  <div className="label">Year</div>
                  <input className="input-base" type="number" value={cohortYear} onChange={(e) => setCohortYear(e.target.value)} />
                </div>
                <div>
                  <div className="label">Rankings editable until</div>
                  <input
                    className="input-base"
                    type="datetime-local"
                    value={cohortEditableUntil}
                    onChange={(e) => setCohortEditableUntil(e.target.value)}
                  />
                </div>
                <div className="sticky bottom-0 bg-white pt-3 border-t border-slate-100">
                  <button type="submit" className="btn-primary w-full">{editingCohortId ? 'Update cohort' : 'Create cohort'}</button>
                </div>
              </form>

              <div className="mt-6 pt-6 border-t border-slate-200">
                <div className="text-lg font-heading text-duke-900">Upload students CSV</div>
                <p className="muted mt-1 text-sm">
                  Upload cohort roster with headers: <code>full_name,email,program</code> (or <code>program_shorthand</code>).
                </p>

                <form className="mt-4 space-y-3" onSubmit={handleUploadStudentsCsv}>
                  <div>
                    <div className="label">Target cohort</div>
                    <select
                      className="select-base"
                      value={uploadCohortId}
                      onChange={(e) => setUploadCohortId(e.target.value)}
                      required
                    >
                      <option value="">Select cohort</option>
                      {cohorts.map((cohort) => (
                        <option key={cohort.id} value={cohort.id}>
                          {cohort.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="label">CSV file</div>
                    <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50/70 p-2">
                      <input
                        key={uploadInputKey}
                        id={`upload-file-${uploadInputKey}`}
                        className="sr-only"
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        required
                      />
                      <div className="flex items-center gap-3">
                        <label
                          htmlFor={`upload-file-${uploadInputKey}`}
                          className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-duke-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-duke-800"
                        >
                          Choose CSV
                        </label>
                        <div className="min-w-0 truncate text-sm text-slate-600">
                          {uploadFile ? uploadFile.name : 'No file selected'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button type="submit" className="btn-primary" disabled={uploadingCsv}>
                      {uploadingCsv ? 'Uploading…' : 'Upload CSV'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={resetUploadState}>
                      Clear
                    </button>
                  </div>
                </form>

                {uploadSummary ? (
                  <div className="mt-4 rounded-card border border-slate-200 bg-slate-50 p-3 text-sm space-y-1">
                    <div className="font-semibold text-slate-700">Last upload summary</div>
                    <div>Rows processed: {uploadSummary.rows_processed}</div>
                    <div>Students created: {uploadSummary.students_created}</div>
                    <div>Students updated: {uploadSummary.students_updated}</div>
                    <div>Users created: {uploadSummary.users_created}</div>
                    <div>Users updated: {uploadSummary.users_updated}</div>
                    <div>Skipped rows: {uploadSummary.skipped_rows}</div>
                    {Array.isArray(uploadSummary.errors) && uploadSummary.errors.length > 0 ? (
                      <div className="pt-2">
                        <div className="font-semibold text-red-700">Row errors</div>
                        <div className="mt-1 max-h-32 overflow-auto rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                          {uploadSummary.errors.join('\n')}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              </>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === 'rankings' ? (
          <div
            className="card p-6"
            role="tabpanel"
            id="admin-panel-rankings"
            aria-labelledby="admin-tab-rankings"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-lg font-heading text-duke-900">Ranking selections</div>
                <div className="text-sm text-slate-500">Review student ranking state and top-10 choices by cohort.</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="select-base"
                  value={rankingCohortId}
                  onChange={async (e) => {
                    const next = e.target.value
                    setRankingCohortId(next)
                    await refreshRankingSubmissions(next)
                  }}
                >
                  <option value="">All cohorts</option>
                  {cohorts.map((cohort) => (
                    <option key={cohort.id} value={cohort.id}>
                      {cohort.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-secondary" onClick={() => refreshRankingSubmissions()}>
                  Refresh
                </button>
                <label className="inline-flex items-center gap-2 text-sm text-slate-600 rounded-card border border-slate-200 bg-slate-50 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={rankingSubmittedOnly}
                    onChange={async (e) => {
                      const checked = e.target.checked
                      setRankingSubmittedOnly(checked)
                      await refreshRankingSubmissions(rankingCohortId, checked)
                    }}
                  />
                  Submitted only
                </label>
                <button type="button" className="btn-primary" onClick={handleExportSubmissionsCsv}>
                  Export CSV
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input className="input-base" placeholder="Search submissions by name or email" value={rankingQuery} onChange={(e) => setRankingQuery(e.target.value)} />
                <button type="button" className="btn-secondary" onClick={() => setRankingSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
                  Sort by date {rankingSortDir === 'asc' ? 'oldest' : 'newest'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => togglePanel('rankingsList')}>
                  {panelOpen.rankingsList ? 'Collapse list' : 'Expand list'}
                </button>
              </div>
              {panelOpen.rankingsList ? (
              <>
              {rankingLoading ? <div className="text-sm text-slate-500">Loading…</div> : null}
              {!rankingLoading && filteredRankings.length === 0 ? (
                <div className="text-sm text-slate-400">
                  {rankingQuery
                    ? 'No matching ranking selections.'
                    : rankingSubmittedOnly
                      ? 'No submitted rankings found.'
                      : 'No ranking selections found.'}
                </div>
              ) : null}

              {filteredRankings.map((row) => (
                <div key={row.user_id} className="rounded-card border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-2">
                      <img
                        src={resolveProfileImageUrl({ displayName: row.display_name, email: row.email })}
                        alt={row.display_name || row.email || `User ${row.user_id}`}
                        className="h-9 w-9 rounded-full border border-slate-200 bg-white object-cover flex-shrink-0"
                        onError={(event) => {
                          event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                          event.currentTarget.onerror = null
                        }}
                      />
                      <div>
                        <div className="text-sm font-semibold text-slate-800">
                          {row.display_name || row.email || `User ${row.user_id}`}
                        </div>
                        <div className="text-xs text-slate-500">{row.email}</div>
                        <div className="text-xs text-slate-400">
                          Submitted: {row.submitted_at ? new Date(row.submitted_at).toLocaleString() : 'n/a'}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-400">Read-only</div>
                  </div>

                  <div className="mt-3 text-xs text-slate-500">Top {row.ranked_count}</div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(row.top_ten || []).map((item) => (
                      <div key={`${row.user_id}-${item.rank}-${item.project_id}`} className="rounded border border-slate-200 px-2 py-2 text-xs">
                        <div className="font-semibold text-slate-700">#{item.rank} {item.title}</div>
                        <div className="text-slate-500">{item.organization || 'Unknown org'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              </>
              ) : null}
            </div>
          </div>
        ) : null}
          </section>
        </div>
      </div>

      {selectedGraphProfile ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          onClick={() => setSelectedGraphUserId(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Partner preference details"
        >
          <div
            className="w-full max-w-5xl max-h-[88vh] overflow-hidden rounded-card border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="flex items-start gap-3 min-w-0">
                <img
                  src={resolveProfileImageUrl({
                    displayName: selectedGraphProfile.displayName,
                    email: selectedGraphProfile.email,
                    profileImageUrl: selectedGraphProfile.profileImageUrl,
                  })}
                  alt={selectedGraphProfile.displayName}
                  className="h-11 w-11 rounded-full border border-slate-200 bg-white object-cover flex-shrink-0"
                  onError={(event) => {
                    event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                    event.currentTarget.onerror = null
                  }}
                />
                <div className="min-w-0">
                  <div className="text-lg font-heading text-duke-900 truncate">{selectedGraphProfile.displayName}</div>
                  <div className="text-sm text-slate-500 truncate">{selectedGraphProfile.email || `User ID ${selectedGraphProfile.userId}`}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1">Outgoing want: {selectedGraphProfile.outgoingWants.length}</span>
                  <span className="rounded border border-rose-200 bg-rose-50 px-2 py-1">Outgoing avoid: {selectedGraphProfile.outgoingAvoids.length}</span>
                  <span className="rounded border border-sky-200 bg-sky-50 px-2 py-1">Incoming want: {selectedGraphProfile.incomingWants.length}</span>
                  <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1">Incoming avoid: {selectedGraphProfile.incomingAvoids.length}</span>
                  {selectedGraphProfile.hasMutualWant ? <span className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">Has mutual wants</span> : null}
                  {selectedGraphProfile.hasConflict ? <span className="rounded border border-orange-200 bg-orange-50 px-2 py-1 text-orange-700">Has conflicts</span> : null}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Direct mutual connections: {selectedGraphProfile.mutualWantConnections} · Conflict connections: {selectedGraphProfile.conflictConnections}
                </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedGraphUserId(null)}
              >
                Close
              </button>
            </div>

            <div className="max-h-[calc(88vh-88px)] overflow-auto p-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded border border-emerald-200 bg-emerald-50/30 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Outgoing Wants</div>
                  <div className="mt-2 space-y-2">
                    {selectedGraphProfile.outgoingWants.map((item, idx) => (
                      <div key={`out-want-${selectedGraphProfile.userId}-${idx}`} className="rounded border border-emerald-200 bg-white p-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={resolveProfileImageUrl({ displayName: item.label, email: item.email, profileImageUrl: item.profileImageUrl })}
                            alt={item.label}
                            className="h-7 w-7 rounded-full border border-slate-200 bg-white object-cover flex-shrink-0"
                            onError={(event) => {
                              event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                              event.currentTarget.onerror = null
                            }}
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-700 truncate">{item.label}</div>
                            {item.email ? <div className="text-slate-500 truncate">{item.email}</div> : null}
                          </div>
                        </div>
                        {partnerIncludeComments && item.comment ? <div className="mt-1 text-slate-600">Comment: {item.comment}</div> : null}
                      </div>
                    ))}
                    {selectedGraphProfile.outgoingWants.length === 0 ? <div className="text-xs text-slate-500">No outgoing wants selected.</div> : null}
                  </div>
                </div>

                <div className="rounded border border-rose-200 bg-rose-50/30 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">Outgoing Avoids</div>
                  <div className="mt-2 space-y-2">
                    {selectedGraphProfile.outgoingAvoids.map((item, idx) => (
                      <div key={`out-avoid-${selectedGraphProfile.userId}-${idx}`} className="rounded border border-rose-200 bg-white p-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={resolveProfileImageUrl({ displayName: item.label, email: item.email, profileImageUrl: item.profileImageUrl })}
                            alt={item.label}
                            className="h-7 w-7 rounded-full border border-slate-200 bg-white object-cover flex-shrink-0"
                            onError={(event) => {
                              event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                              event.currentTarget.onerror = null
                            }}
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-700 truncate">{item.label}</div>
                            {item.email ? <div className="text-slate-500 truncate">{item.email}</div> : null}
                          </div>
                        </div>
                        {partnerIncludeComments && item.comment ? <div className="mt-1 text-slate-600">Comment: {item.comment}</div> : null}
                      </div>
                    ))}
                    {selectedGraphProfile.outgoingAvoids.length === 0 ? <div className="text-xs text-slate-500">No outgoing avoids selected.</div> : null}
                  </div>
                </div>

                <div className="rounded border border-sky-200 bg-sky-50/30 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">Incoming Wants</div>
                  <div className="mt-2 space-y-2">
                    {selectedGraphProfile.incomingWants.map((item, idx) => (
                      <div key={`in-want-${selectedGraphProfile.userId}-${idx}`} className="rounded border border-sky-200 bg-white p-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={resolveProfileImageUrl({ displayName: item.label, email: item.email, profileImageUrl: item.profileImageUrl })}
                            alt={item.label}
                            className="h-7 w-7 rounded-full border border-slate-200 bg-white object-cover flex-shrink-0"
                            onError={(event) => {
                              event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                              event.currentTarget.onerror = null
                            }}
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-700 truncate">{item.label}</div>
                            {item.email ? <div className="text-slate-500 truncate">{item.email}</div> : null}
                          </div>
                        </div>
                        {partnerIncludeComments && item.comment ? <div className="mt-1 text-slate-600">Comment: {item.comment}</div> : null}
                      </div>
                    ))}
                    {selectedGraphProfile.incomingWants.length === 0 ? <div className="text-xs text-slate-500">No incoming wants found.</div> : null}
                  </div>
                </div>

                <div className="rounded border border-amber-200 bg-amber-50/30 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Incoming Avoids</div>
                  <div className="mt-2 space-y-2">
                    {selectedGraphProfile.incomingAvoids.map((item, idx) => (
                      <div key={`in-avoid-${selectedGraphProfile.userId}-${idx}`} className="rounded border border-amber-200 bg-white p-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={resolveProfileImageUrl({ displayName: item.label, email: item.email, profileImageUrl: item.profileImageUrl })}
                            alt={item.label}
                            className="h-7 w-7 rounded-full border border-slate-200 bg-white object-cover flex-shrink-0"
                            onError={(event) => {
                              event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                              event.currentTarget.onerror = null
                            }}
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-700 truncate">{item.label}</div>
                            {item.email ? <div className="text-slate-500 truncate">{item.email}</div> : null}
                          </div>
                        </div>
                        {partnerIncludeComments && item.comment ? <div className="mt-1 text-slate-600">Comment: {item.comment}</div> : null}
                      </div>
                    ))}
                    {selectedGraphProfile.incomingAvoids.length === 0 ? <div className="text-xs text-slate-500">No incoming avoids found.</div> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {partnerGraphExpanded ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          onClick={() => setPartnerGraphExpanded(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Expanded partner connection graph"
        >
          <div
            className="w-full max-w-7xl rounded-card border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-lg font-heading text-duke-900">Connection Graph (Expanded)</div>
                <div className="text-xs text-slate-500">Drag to rotate, scroll to zoom, click a node for details.</div>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPartnerGraphExpanded(false)}
              >
                Close
              </button>
            </div>
            <div className="px-5 py-4">
              <PartnerNetwork3D
                graph={partnerConnectionGraph}
                onNodeSelect={setSelectedGraphUserId}
                canvasClassName="h-[78vh] w-full rounded border border-slate-100 bg-slate-50"
              />
              {(partnerConnectionGraph.hiddenNodes > 0 || partnerConnectionGraph.hiddenEdges > 0) ? (
                <div className="mt-2 text-xs text-slate-500">
                  Showing top {partnerConnectionGraph.nodes.length} connected students.
                  {partnerConnectionGraph.hiddenNodes > 0 ? ` Hidden nodes: ${partnerConnectionGraph.hiddenNodes}.` : ''}
                  {partnerConnectionGraph.hiddenEdges > 0 ? ` Hidden edges: ${partnerConnectionGraph.hiddenEdges}.` : ''}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
