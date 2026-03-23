export const DEFAULT_PROFILE_IMAGE_URL = 'https://yt3.googleusercontent.com/ihHsUHbGBK5djSjn2aBG5DHe84yWL6ZiCOypLn-KGElQWiul7pkCVMp7AstRHiYWVxwaBLzKwg=s900-c-k-c0x00ffffff-no-rj'
const MIDS_IMAGE_BASE = 'https://datascience.duke.edu/wp-content/uploads/2025/09'

function safeToken(value) {
  return String(value || '').replace(/[^a-zA-Z]/g, '').trim().toLowerCase()
}

export function initialsForPerson({ displayName, email } = {}) {
  const base = String(displayName || email || '').trim()
  if (!base) return 'U'
  const parts = base.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function buildMidsProfileImageUrl({ displayName, email } = {}) {
  const rawParts = String(displayName || '').trim().split(/\s+/).filter(Boolean)
  const parts = rawParts.map((p) => safeToken(p)).filter(Boolean)

  let first = parts[0] || ''
  let last = parts.length >= 2 ? parts[parts.length - 1] : ''

  if (!first || !last) {
    const local = String(email || '').split('@', 1)[0]
    const emailParts = local.split(/[._-]+/).map((p) => safeToken(p)).filter(Boolean)
    if (!first && emailParts.length >= 1) first = emailParts[0]
    if (!last && emailParts.length >= 2) last = emailParts[emailParts.length - 1]
  }

  if (!first || !last) return DEFAULT_PROFILE_IMAGE_URL
  return `${MIDS_IMAGE_BASE}/${last}_${first}-400x400.jpg`
}

export function resolveProfileImageUrl({ displayName, email, profileImageUrl } = {}) {
  const custom = String(profileImageUrl || '').trim()
  if (custom) return custom
  return buildMidsProfileImageUrl({ displayName, email })
}
