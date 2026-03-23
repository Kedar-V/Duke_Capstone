const STORAGE_KEY = 'duke_capstone_auth'
const AUTH_CHANGED_EVENT = 'duke-capstone-auth-changed'

function notifyAuthChanged() {
  try {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
  } catch {
    // No-op for non-browser contexts.
  }
}

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
  notifyAuthChanged()
}

export function updateStoredUser(user) {
  const current = getAuth()
  if (!current?.access_token) return
  setAuth({
    ...current,
    user,
  })
}

export function clearAuth() {
  localStorage.removeItem(STORAGE_KEY)
  notifyAuthChanged()
}

export function getToken() {
  return getAuth()?.access_token ?? null
}

export function getUser() {
  return getAuth()?.user ?? null
}

export function onAuthChanged(listener) {
  if (typeof window === 'undefined') {
    return () => {}
  }
  window.addEventListener(AUTH_CHANGED_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(AUTH_CHANGED_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}
