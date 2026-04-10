import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import CatalogPage from './pages/Catalog'
import LoginPage from './pages/Login'
import PartnersPage from './pages/Partners'
import ProfilePage from './pages/Profile'
import ProjectDisplayPage from './pages/ProjectDisplay'
import AdminPage from './pages/Admin'
import CartDrawer from './components/CartDrawer'
import CartWidget from './components/CartWidget'
import { getToken, getUser, onAuthChanged } from './auth'
import { THEME_STORAGE_KEY, applyTheme, initTheme, resolveInitialTheme } from './theme'

export default function App() {
  const [, setAuthVersion] = useState(0)

  useEffect(() => {
    return onAuthChanged(() => {
      setAuthVersion((v) => v + 1)
    })
  }, [])

  useEffect(() => {
    initTheme()

    function onStorage(event) {
      if (event.key !== THEME_STORAGE_KEY) return
      const next = event.newValue === 'dark' || event.newValue === 'light'
        ? event.newValue
        : resolveInitialTheme()
      applyTheme(next)
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const isAuthed = Boolean(getToken())
  const isAdmin = getUser()?.role === 'admin'

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/projects"
          element={<CatalogPage />}
        />
        <Route
          path="/projects/:projectSlug"
          element={<ProjectDisplayPage />}
        />
        <Route
          path="/partners"
          element={isAuthed ? <PartnersPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/profile"
          element={isAuthed ? <ProfilePage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/admin"
          element={isAdmin ? <AdminPage /> : <Navigate to="/projects" replace />}
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <CartWidget />
      <CartDrawer />
    </>
  )
}
