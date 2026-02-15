import { getToken } from './auth'

async function request(path, options) {
  const token = getToken()
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
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

export function getStudents() {
  return request('/api/students')
}

export function getUserSummary() {
  return request('/api/user-summary')
}

export function getMe() {
  return request('/api/auth/me')
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

export function saveTeammateChoices({ wantIds, avoidIds }) {
  return request('/api/teammate-choices', {
    method: 'POST',
    body: JSON.stringify({ want_ids: wantIds, avoid_ids: avoidIds }),
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
