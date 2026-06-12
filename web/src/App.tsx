import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { onAuthChange, handleGoogleRedirect } from '@/services/auth'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { useFileTransferReceiver } from '@/hooks/useFileTransferReceiver'
import { registerFcmToken } from '@/services/fcm'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import HomePage from '@/pages/HomePage'
import SettingsPage from '@/pages/SettingsPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  if (loading) return <div className="flex-1 flex items-center justify-center text-zinc-400">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  if (loading) return <div className="flex-1 flex items-center justify-center text-zinc-400">Loading...</div>
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

function AppInner() {
  useFileTransferReceiver()

  // Register notification tap listener as early as possible — before auth resolves.
  // ProtectedRoute shows "Loading..." until auth is ready, so placing this inside
  // HomePage (behind the auth gate) means the listener registers too late and the
  // cold-start buffered event is never consumed.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let remove: (() => void) | null = null
    ;(async () => {
      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')
      const listener = await FirebaseMessaging.addListener(
        'notificationActionPerformed',
        async (event) => {
          const data = (event.notification.data ?? {}) as Record<string, string>

          // Clear badge + delivered notifications when user taps any notification
          try {
            await FirebaseMessaging.removeAllDeliveredNotifications()
          } catch {}

          if (data.type === 'new_message' && data.conversationId) {
            useUIStore.getState().setPendingNavConvId(data.conversationId)
          } else if (data.type === 'incoming_call') {
            useUIStore.getState().setCallFromBackground(true)
          }
        }
      )
      remove = () => listener.remove()
    })()
    return () => { remove?.() }
  }, [])

  return null
}

export default function App() {
  const { setUser } = useAuthStore()

  useEffect(() => {
    // getRedirectResult hangs in Capacitor WebView — skip on native
    if (!Capacitor.isNativePlatform()) {
      handleGoogleRedirect().catch(() => {})
    }

    // Fallback: if Firebase auth doesn't respond in 10s, stop loading
    const timeout = setTimeout(() => {
      useAuthStore.getState().setLoading(false)
    }, 10000)

    const unsub = onAuthChange((user) => {
      clearTimeout(timeout)
      setUser(user)
      // Register web FCM token after sign-in (non-native only)
      if (user && !Capacitor.isNativePlatform()) {
        registerFcmToken(user.uid).catch(() => {})
      }
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
