import {
  ref,
  set,
  onValue,
  onDisconnect,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/database'
import { rtdb } from './firebase'

const presenceRef = (userId: string) => ref(rtdb, `presence/${userId}`)
const connectedRef = ref(rtdb, '.info/connected')

export const setOnline = async (userId: string): Promise<void> => {
  const r = presenceRef(userId)
  await onDisconnect(r).set({ online: false, lastSeen: serverTimestamp() })
  await set(r, { online: true, lastSeen: serverTimestamp() })
    .catch((e) => console.error('[presence] setOnline failed:', e))
}

// Watches /.info/connected — handles true network disconnects (e.g. browser crash, mobile kill)
export const startPresence = (userId: string): Unsubscribe => {
  const r = presenceRef(userId)
  return onValue(connectedRef, async (snap) => {
    if (snap.val() !== true) return
    await onDisconnect(r).set({ online: false, lastSeen: serverTimestamp() })
    await set(r, { online: true, lastSeen: serverTimestamp() })
      .catch((e) => console.error('[presence] setOnline failed:', e))
  })
}

export const setOffline = async (userId: string): Promise<void> => {
  const r = presenceRef(userId)
  await set(r, { online: false, lastSeen: serverTimestamp() })
    .catch((e) => console.error('[presence] setOffline failed:', e))
}

export const subscribePresence = (
  userId: string,
  cb: (online: boolean) => void
): Unsubscribe => {
  const r = presenceRef(userId)
  return onValue(r, (snap) => {
    cb(snap.exists() ? (snap.val().online ?? false) : false)
  })
}
