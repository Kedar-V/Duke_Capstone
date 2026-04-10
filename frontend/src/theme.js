const THEME_STORAGE_KEY = 'duke-theme'

function normalizeTheme(value) {
  return value === 'dark' ? 'dark' : 'light'
}

export function getStoredTheme() {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (!value) return null
    return normalizeTheme(value)
  } catch {
    return null
  }
}

export function resolveInitialTheme() {
  const stored = getStoredTheme()
  if (stored) return stored
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function getCurrentTheme() {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function applyTheme(theme) {
  const next = normalizeTheme(theme)
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', next === 'dark')
    document.documentElement.setAttribute('data-theme', next)
  }
  return next
}

export function persistTheme(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, normalizeTheme(theme))
  } catch {
    // Ignore storage exceptions in private browsing or locked environments.
  }
}

export function initTheme() {
  return applyTheme(resolveInitialTheme())
}

export function toggleTheme() {
  const current = getCurrentTheme()
  const next = current === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  persistTheme(next)
  return next
}

export { THEME_STORAGE_KEY }
