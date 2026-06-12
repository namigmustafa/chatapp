import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { useAuthStore } from '@/store/authStore'
import { useCallStore } from '@/store/callStore'
import { useUIStore } from '@/store/uiStore'
import { subscribeIncomingCalls } from '@/services/webrtc'
import { playMessageSound } from '@/utils/notificationSound'

async function registerPushToken(userId: string) {
  if (!Capacitor.isNativePlatform()) {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    return
  }

  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')
  const { receive } = await FirebaseMessaging.requestPermissions()
  if (receive !== 'granted') return

  const { token } = await FirebaseMessaging.getToken()
  if (!token) return

  const { doc, setDoc } = await import('firebase/firestore')
  const { db } = await import('@/services/firebase')
  await setDoc(doc(db, 'fcmTokens', userId), { native: token }, { merge: true })
}

async function cancelCallNotification() {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.cancel({ notifications: [{ id: 1 }] })
    await LocalNotifications.removeAllDeliveredNotifications()
  } catch {}
}

async function clearDeliveredNotifications() {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')
    await FirebaseMessaging.removeAllDeliveredNotifications()
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.removeAllDeliveredNotifications()
  } catch {}
}

async function storeVoIPToken(userId: string, token: string) {
  try {
    const { doc, setDoc } = await import('firebase/firestore')
    const { db } = await import('@/services/firebase')
    await setDoc(doc(db, 'voipTokens', userId), { ios: token }, { merge: true })
  } catch {}
}

async function dismissCallKit() {
  if (Capacitor.getPlatform() !== 'ios') return
  try {
    const { VoIPPlugin } = await import('@/plugins/VoIPPlugin')
    await VoIPPlugin.endCall()
  } catch {}
}

async function showCallNotification(callerName: string, callType: string) {
  // On iOS, CallKit already shows the incoming call UI — skip local notification
  if (Capacitor.getPlatform() === 'ios') return

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
  const { setIncomingCall, activeCall, incomingCall } = useCallStore()
  const { setPendingNavConvId, setCallFromBackground, setToast, setPendingCallKitAction } = useUIStore()
  const prevActiveCallRef = useRef(activeCall)
  const activeCallRef = useRef(activeCall)
  activeCallRef.current = activeCall

  // Register push tokens (FCM for all platforms, VoIP for iOS)
  useEffect(() => {
    if (!user?.uid) return
    registerPushToken(user.uid)

    if (Capacitor.getPlatform() === 'ios') {
      ;(async () => {
        try {
          const { VoIPPlugin } = await import('@/plugins/VoIPPlugin')
          const result = await VoIPPlugin.register()

          if (result.token) await storeVoIPToken(user.uid!, result.token)

          // User answered a call from the CallKit UI before JS was ready
          if (result.pendingAnswer) {
            setPendingCallKitAction('answer')
          }

          // Call arrived while app was killed — Firestore subscription will surface it.
          // pendingAnswer above handles the case where user already swiped to answer.
        } catch {}
      })()
    }
  }, [user?.uid])

  // iOS VoIP: listen for CallKit events (answer / end from lock screen)
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'ios') return
    if (!user?.uid) return

    const removers: Array<() => void> = []

    ;(async () => {
      try {
        const { VoIPPlugin } = await import('@/plugins/VoIPPlugin')

        // VoIP token refresh
        const regListener = await VoIPPlugin.addListener('registration', async ({ token }) => {
          if (user?.uid) await storeVoIPToken(user.uid, token)
        })
        removers.push(() => regListener.remove())

        // User answered from CallKit lock-screen UI
        const answerListener = await VoIPPlugin.addListener('callAnswered', () => {
          setPendingCallKitAction('answer')
        })
        removers.push(() => answerListener.remove())

        // User declined/ended from CallKit UI — guard: don't set stale decline
        // when dismissCallKit fires CXEndCallAction after an already-completed call.
        const endListener = await VoIPPlugin.addListener('callEnded', () => {
          if (useCallStore.getState().incomingCall) {
            setPendingCallKitAction('decline')
          }
        })
        removers.push(() => endListener.remove())
      } catch {}
    })()

    return () => removers.forEach((fn) => fn())
  }, [user?.uid])

  // Cancel local call notification when call is declined/missed (not when accepted)
  // dismissCallKit only when no active call — acceptCall clears incomingCall while activeCall
  // is still live, so we must not end CallKit in that path.
  useEffect(() => {
    if (!incomingCall && !activeCallRef.current) {
      cancelCallNotification()
      dismissCallKit()
    }
  }, [incomingCall])

  // Dismiss CallKit when an active call ends from the in-app UI
  useEffect(() => {
    const was = prevActiveCallRef.current
    prevActiveCallRef.current = activeCall
    if (was && !activeCall) {
      dismissCallKit()
    }
  }, [activeCall])

  // FCM listeners: notification tap + foreground message handler
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    if (!user?.uid) return

    const removeListeners: Array<() => void> = []

    ;(async () => {
      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')

      // Notification tap: app was background, user tapped notification
      // (Capacitor queues this event, so cold-start taps are also delivered here)
      const tapListener = await FirebaseMessaging.addListener(
        'notificationActionPerformed',
        async (event) => {
          const data = (event.notification.data ?? {}) as Record<string, string>

          await clearDeliveredNotifications()
          await cancelCallNotification()

          if (data.type === 'incoming_call') {
            setCallFromBackground(true)
          } else if (data.type === 'new_message' && data.conversationId) {
            setPendingNavConvId(data.conversationId)
          }
        }
      )
      removeListeners.push(() => tapListener.remove())

      // Foreground message: app is open, FCM delivers silently (no system banner/sound
      // because presentationOptions excludes 'alert' and 'sound').
      const fgListener = await FirebaseMessaging.addListener(
        'notificationReceived',
        (event) => {
          const data = (event.notification.data ?? {}) as Record<string, string>
          if (data.type !== 'new_message') return

          const convId = data.conversationId
          if (!convId) return

          // Active conversation → suppress entirely
          const { activeConvId } = useUIStore.getState()
          if (convId === activeConvId) return

          // Different conversation → play sound + show in-app toast
          playMessageSound()
          const title = event.notification.title ?? 'New message'
          const body = event.notification.body ?? ''
          setToast({ id: `${convId}-${Date.now()}`, title, body, convId })
        }
      )
      removeListeners.push(() => fgListener.remove())

      // Clear badge when app comes to foreground
      const { App } = await import('@capacitor/app')
      const appListener = await App.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) await clearDeliveredNotifications()
      })
      removeListeners.push(() => appListener.remove())
    })()

    return () => {
      removeListeners.forEach((fn) => fn())
    }
  }, [user?.uid])

  // Firestore incoming call subscription
  useEffect(() => {
    if (!user) return
    const unsub = subscribeIncomingCalls(user.uid, (call) => {
      if (activeCall) return

      // Check if this call arrived after user tapped a background notification
      const isFromBackground = useUIStore.getState().callFromBackground
      useUIStore.getState().setCallFromBackground(false)

      // foreground=true → compact banner, foreground=false → full-screen overlay
      setIncomingCall(call, !isFromBackground)

      const callerName = call.callerAliasId || call.callerUserId
      showCallNotification(callerName, call.type)
    })
    return unsub
  }, [user, activeCall, setIncomingCall])
}
