import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { onAuthChange, handleGoogleRedirect } from '@/services/auth'
import { useAuthStore } from '@/store/authStore'
import { useFileTransferReceiver } from '@/hooks/useFileTransferReceiver'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import HomePage from '@/pages/HomePage'
import SettingsPage from '@/pages/SettingsPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  if (loading) return <div className="flex-1 flex items-center justify-center text-zinc-400">Yükleniyor...</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  if (loading) return <div className="flex-1 flex items-center justify-center text-zinc-400">Yükleniyor...</div>
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

function AppInner() {
  useFileTransferReceiver()
  return null
}

export default function App() {
  const { setUser } = useAuthStore()

  useEffect(() => {
    // getRedirectResult hangs in Capacitor WebView — skip on native
    if (!Capacitor.isNativePlatform()) {
      handleGoogleRedirect().catch(() => {})
    }

    // Fallback: if Firebase auth doesn't respond in 5s, stop loading
    const timeout = setTimeout(() => {
      useAuthStore.getState().setLoading(false)
    }, 5000)

    const unsub = onAuthChange((user) => {
      clearTimeout(timeout)
      setUser(user)
    })

    return () => {
      clearTimeout(timeout)
      unsub()
    }
  }, [setUser])

  return (
    <HashRouter>
      <AppInner />
      <Routes>
        <Route
          path="/login"
          element={<PublicRoute><LoginPage /></PublicRoute>}
        />
        <Route
          path="/register"
          element={<PublicRoute><RegisterPage /></PublicRoute>}
        />
        <Route
          path="/"
          element={<ProtectedRoute><HomePage /></ProtectedRoute>}
        />
        <Route
          path="/settings"
          element={<ProtectedRoute><SettingsPage /></ProtectedRoute>}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
