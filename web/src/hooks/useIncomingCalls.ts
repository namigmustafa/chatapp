import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { useAuthStore } from '@/store/authStore'
import { useCallStore } from '@/store/callStore'
import { useUIStore } from '@/store/uiStore'
import { subscribeIncomingCalls, rejectCall, writeCalleeDebug } from '@/services/webrtc'
import type { User } from 'firebase/auth'

async function ensureAndroidChannels() {
  if (Capacitor.getPlatform() !== 'android') return
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')
    await FirebaseMessaging.createChannel({
      id: 'messages',
      name: 'Messages',
      description: 'New message notifications',
      importance: 4, // HIGH
      sound: 'default',
      vibration: true,
    })
    await FirebaseMessaging.createChannel({
      id: 'calls',
      name: 'Calls',
      description: 'Incoming call notifications',
      importance: 5, // MAX
      sound: 'default',
      vibration: true,
    })
  } catch {}
}

async function registerPushToken(userId: string) {
  if (!Capacitor.isNativePlatform()) {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    return
  }

  await ensureAndroidChannels()

  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')
  const { receive } = await FirebaseMessaging.requestPermissions()
  if (receive !== 'granted') return

  const { token } = await FirebaseMessaging.getToken()
  if (!token) return

  const { doc, setDoc } = await import('firebase/firestore')
  const { db } = await import('@/services/firebase')
  // nativePlatform lets the backend tell an iOS "native" token from an Android
  // one — without it, a fallback push (no VoIP token yet) can't know whether to
  // send a silent Android-style data message or a visible iOS alert.
  await setDoc(
    doc(db, 'fcmTokens', userId),
    { native: token, nativePlatform: Capacitor.getPlatform() },
    { merge: true }
  )
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

// Hands a fresh ID token to the native call engine so it can authenticate its
// own Firestore REST calls when CallKit answers while the WebView is asleep.
// Must be refreshed on every resume — ID tokens expire after ~1h and a call
// could arrive after the app's been backgrounded far longer than that.
async function syncAuthTokenToNative(user: User) {
  const platform = Capacitor.getPlatform()
  if (platform !== 'ios' && platform !== 'android') return
  try {
    const token = await user.getIdToken()
    if (platform === 'ios') {
      const { NativeWebRTCPlugin } = await import('@/plugins/NativeWebRTCPlugin')
      await NativeWebRTCPlugin.setAuthToken({ token })
    } else {
      // Android: CallForegroundService reads this from SharedPreferences to
      // authenticate its native LiveKit/Firestore calls when answering while
      // the WebView is asleep — see VoIPPlugin.java's setAuthToken.
      const { VoIPPlugin } = await import('@/plugins/VoIPPlugin')
      await VoIPPlugin.setAuthToken({ token })
    }
  } catch {}
}

async function storeVoIPToken(userId: string, token: string) {
  try {
    const { doc, setDoc } = await import('firebase/firestore')
    const { db } = await import('@/services/firebase')
    await setDoc(doc(db, 'voipTokens', userId), { ios: token }, { merge: true })
  } catch {}
}

// Checks native UserDefaults (via VoIPPlugin.register()) for an answer/decline
// that happened while the WebView's JS was suspended (locked/backgrounded) and
// never delivered the live 'callAnswered'/'callEnded' NotificationCenter event.
// Must run on EVERY foreground transition, not just app boot — the live listener
// can silently miss the event if the JS realm was suspended when CallKit fired it.
async function checkPendingIOSCallAction(user: User) {
  if (Capacitor.getPlatform() !== 'ios') return
  syncAuthTokenToNative(user)
  try {
    const { VoIPPlugin } = await import('@/plugins/VoIPPlugin')
    const result = await VoIPPlugin.register()

    if (result.token) await storeVoIPToken(user.uid, result.token)

    if (result.pendingAnswer) {
      if (result.pendingAnswerCallId) {
        useUIStore.getState().setPendingCallKitCallId(result.pendingAnswerCallId)
        // Correlates native CallKit timing (when it answered / activated audio, and
        // the app state at each moment) with when JS finally got to run this check.
        const nowSec = Date.now() / 1000
        const parts = [`register:pendingAnswer(resumeCheck) jsNow=${nowSec.toFixed(1)}`]
        if (result.nativeAnswerActionAt) {
          parts.push(`answerActionAt=${result.nativeAnswerActionAt.toFixed(1)}(state=${result.nativeAnswerActionAppState}) +${(nowSec - result.nativeAnswerActionAt).toFixed(1)}s`)
        }
        if (result.nativeAudioActivatedAt) {
          parts.push(`audioActivatedAt=${result.nativeAudioActivatedAt.toFixed(1)}(state=${result.nativeAudioActivatedAppState}) +${(nowSec - result.nativeAudioActivatedAt).toFixed(1)}s`)
        }
        writeCalleeDebug(result.pendingAnswerCallId, parts.join(' | '))
      }
      useUIStore.getState().setPendingCallKitAction('answer')
    }

    if (result.pendingDeclineCallId) {
      rejectCall(result.pendingDeclineCallId).catch(() => {})
    }
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

  // Register push tokens (FCM for all platforms, VoIP for iOS, call actions for Android)
  useEffect(() => {
    if (!user?.uid) return
    registerPushToken(user.uid)

    if (Capacitor.getPlatform() === 'ios') {
      checkPendingIOSCallAction(user)
    }

    if (Capacitor.getPlatform() === 'android') {
      ;(async () => {
        try {
          const { VoIPPlugin } = await import('@/plugins/VoIPPlugin')
          const result = await VoIPPlugin.register()
          // User answered or declined from the lock-screen CallActivity
          if (result.pendingCallAction === 'answer') {
            if (result.pendingCallId) {
              useUIStore.getState().setPendingCallKitCallId(result.pendingCallId)
            }
            setPendingCallKitAction('answer')
          } else if (result.pendingCallAction === 'decline' && result.pendingCallId) {
            rejectCall(result.pendingCallId).catch(() => {})
          }
        } catch {}
      })()

      // Also handle the case where the app was already running when CallActivity fired
      const handler = (e: Event) => {
        const { action, callId } = (e as CustomEvent).detail ?? {}
        if (action === 'answer') {
          if (callId) useUIStore.getState().setPendingCallKitCallId(callId)
          setPendingCallKitAction('answer')
        } else if (action === 'decline' && callId) {
          rejectCall(callId).catch(() => {})
        }
      }
      window.addEventListener('nativeCallAction', handler)
      return () => window.removeEventListener('nativeCallAction', handler)
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
          if (callId) {
            useUIStore.getState().setPendingCallKitCallId(callId)
            writeCalleeDebug(callId, 'listener:callAnswered(warmStart)')
          }
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
        if (!isActive) return
        await clearDeliveredNotifications()
        // Catches an answer/decline that CallKit delivered while the WebView's JS
        // was suspended — the live listener can miss it, so re-check on every resume.
        await checkPendingIOSCallAction(user!)
      })
      removeAppListener = () => appListener.remove()
    })()

    return () => { removeAppListener?.() }
  }, [user?.uid])

  // Firestore incoming call subscription
  useEffect(() => {
    if (!user) return
    const unsub = subscribeIncomingCalls(
      user.uid,
      (call) => {
        if (activeCall) return

        // Check if this call arrived after user tapped a background notification
        const isFromBackground = useUIStore.getState().callFromBackground
        useUIStore.getState().setCallFromBackground(false)

        // foreground=true → compact banner, foreground=false → full-screen overlay
        setIncomingCall(call, !isFromBackground)

        const callerName = call.callerAliasId || call.callerUserId
        showCallNotification(callerName, call.type)
      },
      (callId) => {
        // e.g. iOS CallEngine answered natively while this JS session wasn't
        // running — clear the stale incoming-call screen so it doesn't sit
        // there (and re-answer into a fresh, conflicting connection) once
        // the app resumes.
        if (useCallStore.getState().incomingCall?.id === callId) {
          setIncomingCall(null)
        }
      }
    )
    return unsub
  }, [user, activeCall, setIncomingCall])
}
