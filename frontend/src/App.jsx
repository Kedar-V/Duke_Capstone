import { Navigate, Route, Routes } from 'react-router-dom'

import CatalogPage from './pages/Catalog'
import LoginPage from './pages/Login'
import PartnersPage from './pages/Partners'
import ProjectDisplayPage from './pages/ProjectDisplay'
import RankingsPage from './pages/Rankings'
import { getToken } from './auth'

export default function App() {
  const isAuthed = Boolean(getToken())

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/projects"
        element={isAuthed ? <CatalogPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/projects/:projectId"
        element={isAuthed ? <ProjectDisplayPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/partners"
        element={isAuthed ? <PartnersPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/rankings"
        element={isAuthed ? <RankingsPage /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
