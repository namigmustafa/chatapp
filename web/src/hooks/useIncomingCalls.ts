import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { useAuthStore } from '@/store/authStore'
import { useCallStore } from '@/store/callStore'
import { useUIStore } from '@/store/uiStore'
import { subscribeIncomingCalls, rejectCall } from '@/services/webrtc'

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
  const { setPendingCallKitAction } = useUIStore()
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
            if (result.pendingAnswerCallId) {
              useUIStore.getState().setPendingCallKitCallId(result.pendingAnswerCallId)
            }
            setPendingCallKitAction('answer')
          }

          // User declined from CallKit while JS wasn't running — mark the call
          // 'rejected' now so the caller's device stops ringing.
          if (result.pendingDeclineCallId) {
            rejectCall(result.pendingDeclineCallId).catch(() => {})
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
        const answerListener = await VoIPPlugin.addListener('callAnswered', ({ callId }) => {
          if (callId) useUIStore.getState().setPendingCallKitCallId(callId)
          setPendingCallKitAction('answer')
        })
        removers.push(() => answerListener.remove())

        // User declined/ended from CallKit UI — guard: don't set stale decline
        // when dismissCallKit fires CXEndCallAction after an already-completed call.
        const endListener = await VoIPPlugin.addListener('callEnded', ({ callId, answered }) => {
          // When the call was answered, CallKit fires an "end" as it hands off to the
          // in-app WebRTC call. That is NOT a decline — ignore it, or we'd reject the
          // call the user just accepted.
          if (answered) return
          const s = useCallStore.getState()
          if (s.incomingCall) {
            setPendingCallKitAction('decline')
          } else if (callId && !s.activeCall) {
            // App was woken just to handle the decline and has no in-memory call
            // (Firestore subscription not active). Reject directly via the call id so
            // the caller stops ringing. The !activeCall guard avoids touching a call
            // that was answered and is now being hung up.
            rejectCall(callId).catch(() => {})
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

  // Clear badge whenever app comes to foreground
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    if (!user?.uid) return

    let removeAppListener: (() => void) | null = null
    ;(async () => {
      const { App } = await import('@capacitor/app')
      const appListener = await App.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) await clearDeliveredNotifications()
      })
      removeAppListener = () => appListener.remove()
    })()

    return () => { removeAppListener?.() }
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
