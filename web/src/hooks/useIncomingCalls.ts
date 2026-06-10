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

  const { PushNotifications } = await import('@capacitor/push-notifications')

  // Clear previous listeners to avoid duplicates on re-render
  await PushNotifications.removeAllListeners()

  await PushNotifications.addListener('registration', async (token) => {
    try {
      const { doc, setDoc } = await import('firebase/firestore')
      const { db } = await import('@/services/firebase')
      await setDoc(doc(db, 'fcmTokens', userId), { native: token.value }, { merge: true })
    } catch (e) {
      console.error('[FCM] token save failed:', e)
    }
  })

  await PushNotifications.addListener('registrationError', (err: any) => {
    console.error('[FCM] registration error:', JSON.stringify(err))
  })

  // Check current permission — request only if not yet determined
  const current = await PushNotifications.checkPermissions()
  if (current.receive === 'prompt') {
    const { receive } = await PushNotifications.requestPermissions()
    if (receive !== 'granted') return
  } else if (current.receive !== 'granted') {
    return
  }

  await PushNotifications.register()
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
