import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { Loader2 } from "lucide-react"
import { auth } from "../lib/firebase"
import { api } from "../lib/api"

const AuthContext = createContext(null)

// Tracks the Firebase session and the user's profile (incl. role) from the
// API. The role shown here only decides which screens to offer; the backend
// checks it again on every admin request.
export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, profile: null, loading: true, error: null })

  const loadProfile = useCallback(async (user) => {
    if (!user) return setState({ user: null, profile: null, loading: false, error: null })
    try {
      const { user: profile } = await api("/api/me")
      setState({ user, profile, loading: false, error: null })
    } catch (error) {
      setState({ user, profile: null, loading: false, error })
    }
  }, [])

  useEffect(() => onAuthStateChanged(auth, loadProfile), [loadProfile])

  const value = {
    ...state,
    isAdmin: state.profile?.userRole === "admin",
    refreshProfile: () => loadProfile(auth.currentUser),
    logout: () => signOut(auth),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-water" />
    </div>
  )
}

export function RequireAuth({ children }) {
  const { user, profile, loading, error, logout } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-red-500">{error?.message || "Your profile could not be loaded."}</p>
        <button className="underline" onClick={logout}>Sign out</button>
      </div>
    )
  }
  return children
}

export function RequireAdmin({ children }) {
  const { isAdmin, loading, user } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  return <RequireAuth>{isAdmin ? children : <Navigate to="/dashboard" replace />}</RequireAuth>
}

// For /login and /register: signed-in users go straight to their home screen.
export function RedirectIfSignedIn({ children }) {
  const { user, profile, isAdmin, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageSpinner />
  if (user && profile) return <Navigate to={location.state?.from || (isAdmin ? "/admin/dashboard" : "/dashboard")} replace />
  return children
}
