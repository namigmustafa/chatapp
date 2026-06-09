import { getToken, onMessage } from 'firebase/messaging'
import { doc, setDoc } from 'firebase/firestore'
import { db, getMessagingInstance } from './firebase'

export const registerFcmToken = async (userId: string) => {
  const messaging = await getMessagingInstance()
  if (!messaging) return

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return

  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
  })

  if (token) {
    await setDoc(
      doc(db, 'fcmTokens', userId),
      { web: token },
      { merge: true }
    )
  }
}

export const onForegroundMessage = async (
  cb: (payload: { title: string; body: string; data?: Record<string, string> }) => void
) => {
  const messaging = await getMessagingInstance()
  if (!messaging) return () => {}

  return onMessage(messaging, (payload) => {
    cb({
      title: payload.notification?.title ?? '',
      body: payload.notification?.body ?? '',
      data: payload.data as Record<string, string> | undefined,
    })
  })
}
