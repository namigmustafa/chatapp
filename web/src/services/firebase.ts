import { initializeApp } from 'firebase/app'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'
import { Capacitor } from '@capacitor/core'
import { getFirestore } from 'firebase/firestore'
import { getDatabase } from 'firebase/database'
import { getMessaging, isSupported } from 'firebase/messaging'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL ??
    `https://${import.meta.env.VITE_FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`,
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
if (!Capacitor.isNativePlatform()) {
  setPersistence(auth, browserLocalPersistence).catch(() => {})
}
export const db = getFirestore(app)
export const rtdb = getDatabase(app)
export const storage = getStorage(app)

export const getMessagingInstance = async () => {
  const supported = await isSupported()
  if (!supported) return null
  return getMessaging(app)
}
