import { getToken } from './auth'

async function request(path, options) {
  const token = getToken()
  const isFormData = options?.body instanceof FormData
  const res = await fetch(path, {
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
    ...options,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
  }

  if (res.status === 204) return null
  return res.json()
}

export function getProjects(params = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    qs.set(k, String(v))
  }
  const suffix = qs.toString() ? `?${qs}` : ''
  return request(`/api/projects${suffix}`)
}

export function getProject(projectId) {
  return request(`/api/projects/${encodeURIComponent(projectId)}`)
}

export function getProjectBySlug(slug) {
  return request(`/api/projects/slug/${encodeURIComponent(slug)}`)
}

export function searchProjects(payload = {}) {
  return request('/api/search/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getStats() {
  return request('/api/stats')
}

export function getFilters() {
  return request('/api/filters')
}

export function getCohorts() {
  return request('/api/cohorts')
}

export function getStudents(params = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    qs.set(k, String(v))
  }
  const suffix = qs.toString() ? `?${qs}` : ''
  return request(`/api/students${suffix}`)
}

export function getUserSummary() {
  return request('/api/user-summary')
}

export function getMe() {
  return request('/api/auth/me')
}

export function updateMe(payload) {
  return request('/api/auth/me', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function login({ email, password }) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function register({ email, password, displayName }) {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, display_name: displayName }),
  })
}

export function firstLoginRequestOtp({ email }) {
  return request('/api/auth/first-login/request-otp', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function firstLoginVerifyOtp({ email, otp, newPassword, displayName }) {
  return request('/api/auth/first-login/verify-otp', {
    method: 'POST',
    body: JSON.stringify({
      email,
      otp,
      new_password: newPassword,
      display_name: displayName || null,
    }),
  })
}

export function getCart() {
  return request('/api/cart')
}

export function addCartItem({ projectId }) {
  return request('/api/cart/items', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId }),
  })
}

export function removeCartItem(projectId) {
  return request(`/api/cart/items/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  })
}

export function getTeammateChoices() {
  return request('/api/teammate-choices')
}

export function saveTeammateChoices({ wantIds, avoidIds, comments, avoidReasons }) {
  return request('/api/teammate-choices', {
    method: 'POST',
    body: JSON.stringify({
      want_ids: wantIds,
      avoid_ids: avoidIds,
      comments: comments || {},
      avoid_reasons: avoidReasons || {},
    }),
  })
}

export function getRankings() {
  return request('/api/rankings')
}

export function saveRankings({ topTenIds }) {
  return request('/api/rankings', {
    method: 'POST',
    body: JSON.stringify({ top_ten_ids: topTenIds }),
  })
}

export function submitRankings() {
  return request('/api/rankings/submit', {
    method: 'POST',
  })
}

export function getRatings() {
  return request('/api/ratings')
}

export function saveRating({ projectId, rating }) {
  return request('/api/ratings', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, rating }),
  })
}

export function adminListCohorts() {
  return request('/api/admin/cohorts')
}

export function adminCreateCohort(payload) {
  return request('/api/admin/cohorts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function adminUpdateCohort(cohortId, payload) {
  return request(`/api/admin/cohorts/${encodeURIComponent(cohortId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function adminDeleteCohort(cohortId) {
  return request(`/api/admin/cohorts/${encodeURIComponent(cohortId)}`, {
    method: 'DELETE',
  })
}

export function adminUploadCohortStudentsCsv({ cohortId, file }) {
  const formData = new FormData()
  formData.append('file', file)
  return request(`/api/admin/cohorts/${encodeURIComponent(cohortId)}/students/upload-csv`, {
    method: 'POST',
    body: formData,
  })
}

export function adminListRankingSubmissions({ cohortId, submittedOnly = true, includeNonStudents = true } = {}) {
  const qs = new URLSearchParams()
  if (cohortId) qs.set('cohort_id', String(cohortId))
  qs.set('submitted_only', submittedOnly ? 'true' : 'false')
  qs.set('include_non_students', includeNonStudents ? 'true' : 'false')
  const suffix = qs.toString() ? `?${qs}` : ''
  return request(`/api/admin/rankings/submissions${suffix}`)
}

export function adminReopenRankingSubmission(userId) {
  return request(`/api/admin/rankings/${encodeURIComponent(userId)}/reopen`, {
    method: 'POST',
  })
}

export async function adminExportRankingSubmissionsCsv({ cohortId, submittedOnly = true, includeNonStudents = true } = {}) {
  const token = getToken()
  const qs = new URLSearchParams()
  if (cohortId) qs.set('cohort_id', String(cohortId))
  qs.set('submitted_only', submittedOnly ? 'true' : 'false')
  qs.set('include_non_students', includeNonStudents ? 'true' : 'false')
  const suffix = qs.toString() ? `?${qs}` : ''

  const res = await fetch(`/api/admin/rankings/submissions/export${suffix}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
  }
  return res.text()
}

export function adminListUsers() {
  return request('/api/admin/users')
}

export function adminCreateUser(payload) {
  return request('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function adminUpdateUser(userId, payload) {
  return request(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function adminDeleteUser(userId) {
  return request(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })
}

export function adminListProjects(params = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    qs.set(k, String(v))
  }
  const suffix = qs.toString() ? `?${qs}` : ''
  return request(`/api/admin/projects${suffix}`)
}

export function adminCreateProject(payload) {
  return request('/api/admin/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function adminUpdateProject(projectId, payload) {
  return request(`/api/admin/projects/${encodeURIComponent(projectId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function adminDeleteProject(projectId) {
  return request(`/api/admin/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  })
}

export function adminListCompanies() {
  return request('/api/admin/companies')
}

export function adminCreateCompany(payload) {
  return request('/api/admin/companies', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function adminUpdateCompany(companyId, payload) {
  return request(`/api/admin/companies/${encodeURIComponent(companyId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function adminDeleteCompany(companyId) {
  return request(`/api/admin/companies/${encodeURIComponent(companyId)}`, {
    method: 'DELETE',
  })
}

export function adminListAssignmentRules(params = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    qs.set(k, String(v))
  }
  const suffix = qs.toString() ? `?${qs}` : ''
  return request(`/api/admin/assignment-rules${suffix}`)
}

export function adminGetActiveAssignmentRule(params = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    qs.set(k, String(v))
  }
  const suffix = qs.toString() ? `?${qs}` : ''
  return request(`/api/admin/assignment-rules/active${suffix}`)
}

export function adminCreateAssignmentRule(payload) {
  return request('/api/admin/assignment-rules', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function adminUpdateAssignmentRule(configId, payload) {
  return request(`/api/admin/assignment-rules/${encodeURIComponent(configId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function adminActivateAssignmentRule(configId) {
  return request(`/api/admin/assignment-rules/${encodeURIComponent(configId)}/activate`, {
    method: 'POST',
  })
}

export function adminPreviewAssignmentRule(configId) {
  return request(`/api/admin/assignment-rules/${encodeURIComponent(configId)}/preview`, {
    method: 'POST',
  })
}

export function adminListPartnerPreferences({ cohortId, includeComments = true } = {}) {
  const qs = new URLSearchParams()
  if (cohortId) qs.set('cohort_id', String(cohortId))
  qs.set('include_comments', includeComments ? 'true' : 'false')
  const suffix = qs.toString() ? `?${qs}` : ''
  return request(`/api/admin/partners/preferences${suffix}`)
}

export async function adminExportPartnerPreferencesCsv({ cohortId, includeComments = true } = {}) {
  const token = getToken()
  const qs = new URLSearchParams()
  if (cohortId) qs.set('cohort_id', String(cohortId))
  qs.set('include_comments', includeComments ? 'true' : 'false')
  const suffix = qs.toString() ? `?${qs}` : ''

  const res = await fetch(`/api/admin/partners/preferences/export${suffix}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
  }
  return res.text()
}
