import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import CatalogPage from './pages/Catalog'
import LoginPage from './pages/Login'
import PartnersPage from './pages/Partners'
import ProfilePage from './pages/Profile'
import ProjectDisplayPage from './pages/ProjectDisplay'
import RankingsPage from './pages/Rankings'
import AdminPage from './pages/Admin'
import CartWidget from './components/CartWidget'
import { getToken, getUser, onAuthChanged } from './auth'

export default function App() {
  const [, setAuthVersion] = useState(0)

  useEffect(() => {
    return onAuthChanged(() => {
      setAuthVersion((v) => v + 1)
    })
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
        path="/rankings"
        element={isAuthed ? <RankingsPage /> : <Navigate to="/login" replace />}
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
    </>
  )
}
