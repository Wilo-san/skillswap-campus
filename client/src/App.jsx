import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import { Spinner } from './components/ui.jsx'
import { useAuth } from './lib/auth.jsx'
import AuthPage from './pages/Auth.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Marche from './pages/Marche.jsx'
import OffreDetail from './pages/OffreDetail.jsx'
import MesOffres from './pages/MesOffres.jsx'
import Reservations from './pages/Reservations.jsx'
import Credits from './pages/Credits.jsx'
import Profil from './pages/Profil.jsx'
import Admin from './pages/Admin.jsx'
import Planning from './pages/Planning.jsx'
import Etudiant from './pages/Etudiant.jsx'

function Protected({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Ouverture de SkillSwap Campus..." />
      </div>
    )
  }
  if (!user) return <Navigate to="/connexion" state={{ from: location.pathname }} replace />
  return <Layout>{children}</Layout>
}

function AdminOnly({ children }) {
  const { user } = useAuth()
  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  const { user, loading } = useAuth()

  return (
    <Routes>
      <Route
        path="/connexion"
        element={loading ? null : user ? <Navigate to="/dashboard" replace /> : <AuthPage />}
      />
      <Route
        path="/"
        element={<Navigate to={user ? '/dashboard' : '/connexion'} replace />}
      />
      <Route
        path="/dashboard"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/marche"
        element={
          <Protected>
            <Marche />
          </Protected>
        }
      />
      <Route
        path="/offres/:id"
        element={
          <Protected>
            <OffreDetail />
          </Protected>
        }
      />
      <Route
        path="/mes-offres"
        element={
          <Protected>
            <MesOffres />
          </Protected>
        }
      />
      <Route
        path="/reservations"
        element={
          <Protected>
            <Reservations />
          </Protected>
        }
      />
      <Route
        path="/planning"
        element={
          <Protected>
            <Planning />
          </Protected>
        }
      />
      <Route
        path="/etudiants/:id"
        element={
          <Protected>
            <Etudiant />
          </Protected>
        }
      />
      <Route
        path="/credits"
        element={
          <Protected>
            <Credits />
          </Protected>
        }
      />
      <Route
        path="/profil"
        element={
          <Protected>
            <Profil />
          </Protected>
        }
      />
      <Route
        path="/admin"
        element={
          <Protected>
            <AdminOnly>
              <Admin />
            </AdminOnly>
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/connexion'} replace />} />
    </Routes>
  )
}
