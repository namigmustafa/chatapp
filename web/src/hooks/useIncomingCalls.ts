import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { useAuthStore } from '@/store/authStore'
import { useCallStore } from '@/store/callStore'
import { subscribeIncomingCalls } from '@/services/webrtc'

async function registerPushToken(userId: string) {
  if (!Capacitor.isNativePlatform()) {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    return
  }

  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')

  // Request permission
  const { receive } = await FirebaseMessaging.requestPermissions()
  if (receive !== 'granted') return

  // Get FCM token directly (not APNs token)
  const { token } = await FirebaseMessaging.getToken()
  if (!token) return

  const { doc, setDoc } = await import('firebase/firestore')
  const { db } = await import('@/services/firebase')
  await setDoc(doc(db, 'fcmTokens', userId), { native: token }, { merge: true })
}

async function showCallNotification(callerName: string, callType: string) {
  if (Capacitor.isNativePlatform()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      await LocalNotifications.schedule({
        notifications: [{
          id: 1,
          title: `Incoming ${callType === 'video' ? 'video' : 'voice'} call`,
          body: callerName.toUpperCase(),
          sound: 'default',
          smallIcon: 'ic_launcher',
        }]
      })
    } catch {}
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`Incoming ${callType === 'video' ? 'video' : 'voice'} call`, {
      body: callerName.toUpperCase(),
      icon: '/favicon.ico',
      requireInteraction: true,
      silent: false,
    })
  }
}

export const useIncomingCalls = () => {
  const { user } = useAuthStore()
  const { setIncomingCall, activeCall } = useCallStore()

  useEffect(() => {
    if (!user?.uid) return
    registerPushToken(user.uid)
  }, [user?.uid])

  useEffect(() => {
    if (!user) return
    const unsub = subscribeIncomingCalls(user.uid, (call) => {
      if (!activeCall) {
        setIncomingCall(call)
        const callerName = call.callerAliasId || call.callerUserId
        showCallNotification(callerName, call.type)
      }
    })
    return unsub
  }, [user, activeCall, setIncomingCall])
}
