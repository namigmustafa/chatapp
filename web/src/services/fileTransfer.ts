import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'

const FT = 'fileTransfers'

export interface FileTransferMeta {
  id: string
  conversationId: string
  messageId: string
  fromUserId: string
  toUserId: string
  fileName: string
  fileSize: number
  fileType: string
  offer: RTCSessionDescriptionInit
  answer?: RTCSessionDescriptionInit
  status: 'pending' | 'connecting' | 'done' | 'failed'
}

export const createTransferOffer = async (
  meta: Omit<FileTransferMeta, 'id' | 'status' | 'answer'>
): Promise<string> => {
  const ref = doc(collection(db, FT))
  await setDoc(ref, { ...meta, status: 'pending', createdAt: serverTimestamp() })
  return ref.id
}

export const subscribeTransfer = (
  transferId: string,
  cb: (meta: FileTransferMeta | null) => void
): Unsubscribe =>
  onSnapshot(doc(db, FT, transferId), (snap) =>
    cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as FileTransferMeta) : null)
  )

export const subscribeIncomingTransfers = (
  toUserId: string,
  cb: (meta: FileTransferMeta) => void
): Unsubscribe => {
  // Single-field query only — no composite index needed
  const q = query(collection(db, FT), where('toUserId', '==', toUserId))
  return onSnapshot(q, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const meta = { id: change.doc.id, ...change.doc.data() } as FileTransferMeta
        if (meta.status === 'pending') cb(meta)
      }
    })
  })
}

export const setTransferAnswer = (transferId: string, answer: RTCSessionDescriptionInit): Promise<void> =>
  updateDoc(doc(db, FT, transferId), { answer, status: 'connecting' })

export const sendTransferIce = async (
  transferId: string,
  role: 'sender' | 'receiver',
  ice: RTCIceCandidateInit
): Promise<void> => {
  await setDoc(doc(collection(db, FT, transferId, `${role}Ice`)), ice)
}

export const subscribeTransferIce = (
  transferId: string,
  role: 'sender' | 'receiver',
  cb: (ice: RTCIceCandidateInit) => void
): Unsubscribe =>
  onSnapshot(collection(db, FT, transferId, `${role}Ice`), (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === 'added') cb(change.doc.data() as RTCIceCandidateInit)
    })
  })

export const cleanupTransfer = (transferId: string): void => {
  deleteDoc(doc(db, FT, transferId)).catch(() => {})
}
