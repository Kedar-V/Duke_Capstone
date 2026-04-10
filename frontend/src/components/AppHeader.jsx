import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getUser, clearAuth } from '../auth'
import CartNavIcon from './CartNavIcon'
import midsLogo from '../assets/mids-logo-white-bg.svg'
import { DEFAULT_PROFILE_IMAGE_URL, initialsForPerson, resolveProfileImageUrl } from '../profileImage'
import { getCurrentTheme, toggleTheme } from '../theme'

export default function AppHeader({ onSearch, searchText, setSearchText, showSearch = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = getUser()

  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountAvatarFailed, setAccountAvatarFailed] = useState(false)
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    setTheme(getCurrentTheme())
  }, [])

  const menuItems = user?.role === 'admin'
    ? ['Projects', 'Partners', 'Admin']
    : user
      ? ['Projects', 'Partners']
      : ['Projects']

  function navigateSection(label) {
    setMenuOpen(false)
    setAccountOpen(false)
    if (label === 'Partners') navigate('/partners')
    if (label === 'Projects') navigate('/projects')
    if (label === 'Admin') navigate('/admin')
  }

  function onSignOut() {
    setAccountOpen(false)
    clearAuth()
    navigate('/login', { replace: true })
  }

  function onOpenProfile() {
    setAccountOpen(false)
    navigate('/profile')
  }

  const AvatarControls = ({ showThemeToggle = true, showCart = true } = {}) => (
    <>
      {showThemeToggle ? (
        <button
          type="button"
          className="h-10 w-10 rounded-full border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:bg-slate-50 transition-colors"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => setTheme(toggleTheme())}
        >
          {theme === 'dark' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2"/>
              <path d="M12 20v2"/>
              <path d="m4.93 4.93 1.41 1.41"/>
              <path d="m17.66 17.66 1.41 1.41"/>
              <path d="M2 12h2"/>
              <path d="M20 12h2"/>
              <path d="m6.34 17.66-1.41 1.41"/>
              <path d="m19.07 4.93-1.41 1.41"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9"/>
            </svg>
          )}
        </button>
      ) : null}
      {user && showCart ? <CartNavIcon /> : null}
      <div className="relative">
        <button
          type="button"
          className="h-10 w-10 rounded-full bg-duke-900 text-white flex items-center justify-center font-semibold border-2 border-transparent hover:border-blue-200 transition-colors"
          aria-label={user ? 'Account menu' : 'Sign in'}
          title={user ? 'Account menu' : 'Sign in'}
          onClick={() => setAccountOpen((v) => !v)}
        >
          {user && !accountAvatarFailed ? (
            <img
              src={resolveProfileImageUrl({
                displayName: user?.display_name,
                email: user?.email,
                profileImageUrl: user?.profile_image_url,
              })}
              alt="Profile"
              className="h-full w-full rounded-full object-cover"
              onError={(event) => {
                if (event.currentTarget.src !== DEFAULT_PROFILE_IMAGE_URL) {
                  event.currentTarget.src = DEFAULT_PROFILE_IMAGE_URL
                  return
                }
                setAccountAvatarFailed(true)
              }}
            />
          ) : (
            initialsForPerson({ displayName: user?.display_name, email: user?.email })
          )}
        </button>
        {accountOpen ? (
          <div className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-card border border-slate-200 bg-white shadow-lg p-2 z-50">
            {user ? (
              <>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 rounded-card text-sm text-slate-700 hover:bg-slate-100"
                  onClick={onOpenProfile}
                >
                  Profile
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 rounded-card text-sm text-red-700 hover:bg-red-50"
                  onClick={onSignOut}
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                type="button"
                className="w-full text-left px-3 py-2 rounded-card text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  setAccountOpen(false)
                  navigate('/login')
                }}
              >
                Sign in
              </button>
            )}
            <div className="my-1 border-t border-slate-200" />
            <div className="px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              Made with ❤️ by{' '}
              <a
                href="https://diwaspuri.com"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-slate-600 hover:text-slate-800 hover:underline"
              >
                Diwas
              </a>{' '}
              and Kedar MIDS'27
            </div>
          </div>
        ) : null}
      </div>
    </>
  )

  return (
    <div className="card p-4 md:p-6 mb-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-between w-full md:w-auto">
          <div className="flex items-center gap-3">
            <div className="relative md:hidden">
              <button
                type="button"
                className="h-10 w-10 rounded-full border border-slate-200 bg-white text-slate-600 flex items-center justify-center text-lg hover:bg-slate-50 transition-colors"
                aria-label="Open menu"
                onClick={() => setMenuOpen((v) => !v)}
              >
                ☰
              </button>
              {menuOpen ? (
                <div className="absolute left-0 top-full mt-2 w-56 rounded-card border border-slate-200 bg-white shadow-lg p-2 z-50">
                  <div className="text-xs uppercase tracking-wide text-slate-400 px-2 py-1">
                    Sections
                  </div>
                  <div className="flex flex-col gap-1">
                    {menuItems.map((label) => (
                      <button
                        key={label}
                        type="button"
                        className="w-full text-left px-3 py-2 rounded-card text-sm text-slate-700 hover:bg-slate-100"
                        onClick={() => navigateSection(label)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="inline-flex mids-logo-surface hover:opacity-80 transition-opacity"
              aria-label="Go to projects"
              onClick={() => navigate('/projects')}
            >
              <img src={midsLogo} alt="MIDS" className="h-9 sm:h-10 md:h-12 w-auto" />
            </button>
            <div className="hidden md:flex items-center gap-2 md:ml-3 md:pl-3 md:border-l md:border-slate-200">
              {menuItems.map((label) => {
                const isActive = 
                  (label === 'Projects' && location.pathname.startsWith('/projects')) ||
                  (label === 'Partners' && location.pathname.startsWith('/partners')) ||
                  (label === 'Admin' && location.pathname.startsWith('/admin')) ||
                  (label === 'Profile' && location.pathname.startsWith('/profile'))

                return (
                  <button
                    key={label}
                    type="button"
                    className={
                      isActive
                        ? 'px-3 py-2 rounded-card text-sm bg-duke-900 text-white shadow-sm'
                        : 'px-3 py-2 rounded-card text-sm text-slate-700 hover:bg-slate-100 transition-colors'
                    }
                    onClick={() => navigateSection(label)}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <AvatarControls showThemeToggle showCart={false} />
          </div>
        </div>

        {showSearch ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto">
            <div className="relative w-full md:w-[420px]">
              <input
                className="input-base pl-10 w-full bg-slate-50 border-slate-200 focus:bg-white transition-colors shadow-sm"
                placeholder="Try: ‘Finance’ or ‘Machine Learning’"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && onSearch) {
                    onSearch(searchText)
                  }
                }}
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.2-3.2" />
                </svg>
              </span>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <AvatarControls showThemeToggle />
            </div>
          </div>
        ) : (
          <div className="hidden md:flex items-center gap-3">
            <AvatarControls showThemeToggle />
          </div>
        )}
      </div>
    </div>
  )
}
