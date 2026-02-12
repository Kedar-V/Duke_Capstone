const STORAGE_KEY = 'duke_capstone_auth'

export function getAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.access_token || !parsed?.user) return null
    return parsed
  } catch {
    return null
  }
}

export function setAuth(auth) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth))
}

export function clearAuth() {
  localStorage.removeItem(STORAGE_KEY)
}

export function getToken() {
  return getAuth()?.access_token ?? null
}

export function getUser() {
  return getAuth()?.user ?? null
}
