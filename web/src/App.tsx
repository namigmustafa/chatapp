import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()

  // Single source of truth for notification taps on ALL native platforms (iOS + Android).
  // Capacitor core owns the UNUserNotificationCenter delegate; @capacitor-firebase/messaging
  // forwards taps here via `notificationActionPerformed` with retainUntilConsumed:true — so
  // the event is buffered and delivered even on a cold start (app killed / lock-screen tap)
  // once this listener attaches. Do NOT set UNUserNotificationCenter.delegate natively; that
  // hijacks Capacitor's router and silently disables this event.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let remove: (() => void) | null = null
    ;(async () => {
      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')
      const listener = await FirebaseMessaging.addListener(
        'notificationActionPerformed',
        (event) => {
          const data = (event.notification.data ?? {}) as Record<string, string>
          if (data.type === 'incoming_call') {
            useUIStore.getState().setCallFromBackground(true)
          } else if (data.type === 'new_message' && data.conversationId) {
            navigate(`/?conv=${data.conversationId}`, { replace: true })
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
