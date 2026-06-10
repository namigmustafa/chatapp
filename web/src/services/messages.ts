import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  limit,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'
import type { Message, MessageType } from '@/types'
import { updateLastMessage } from './conversations'

const MESSAGES = 'messages'

export const sendMessage = async (
  conversationId: string,
  senderId: string,
  content: string,
  type: MessageType = 'text'
): Promise<string> => {
  const ref = await addDoc(collection(db, MESSAGES), {
    conversationId,
    senderId,
    content,
    type,
    status: 'sent',
    createdAt: serverTimestamp(),
    deletedAt: null,
  })

  await updateLastMessage(conversationId, {
    content,
    senderId,
    type,
    timestamp: Date.now(),
  })

  return ref.id
}

export const sendFileMessage = async (
  conversationId: string,
  senderId: string,
  type: 'image' | 'video' | 'document',
  fileName: string,
  fileSize: number,
  transferId: string,
  preGeneratedId?: string,
): Promise<string> => {
  const content = fileName
  const ref = preGeneratedId ? doc(db, MESSAGES, preGeneratedId) : doc(collection(db, MESSAGES))
  await setDoc(ref, {
    conversationId,
    senderId,
    content,
    type,
    fileName,
    fileSize,
    transferId,
    status: 'sent',
    createdAt: serverTimestamp(),
    deletedAt: null,
  })

  await updateLastMessage(conversationId, {
    content: type === 'image' ? '📷 Fotoğraf' : type === 'video' ? '🎥 Video' : `📄 ${fileName}`,
    senderId,
    type,
    timestamp: Date.now(),
  })

  return ref.id
}

export const markMessageRead = async (messageId: string) => {
  await updateDoc(doc(db, MESSAGES, messageId), { status: 'read' })
}

export const markMessagesDelivered = async (messageIds: string[]) => {
  await Promise.all(
    messageIds.map((id) =>
      updateDoc(doc(db, MESSAGES, id), { status: 'delivered' })
    )
  )
}

export const subscribeMessages = (
  conversationId: string,
  cb: (messages: Message[]) => void
): Unsubscribe => {
  const q = query(
    collection(db, MESSAGES),
    where('conversationId', '==', conversationId)
  )
  return onSnapshot(q, (snap) => {
    const toMs = (val: unknown): number => {
      if (!val) return 0
      if (typeof val === 'number') return val
      if (typeof val === 'object' && 'toMillis' in (val as object))
        return (val as { toMillis: () => number }).toMillis()
      return 0
    }
    const msgs = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Message))
      .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt))
    cb(msgs)
  })
}

// Returns lowercased concatenated text content of last N messages in a conversation
export const getConversationText = async (conversationId: string, n = 50): Promise<string> => {
  const snap = await getDocs(
    query(collection(db, MESSAGES), where('conversationId', '==', conversationId), limit(n))
  )
  return snap.docs
    .map((d) => (d.data().content as string | undefined) ?? '')
    .join(' ')
    .toLowerCase()
}
