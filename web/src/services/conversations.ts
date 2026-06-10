import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'
import type { Conversation, LastMessage } from '@/types'

const CONVERSATIONS = 'conversations'

export const getOrCreateConversation = async (
  userId1: string,
  aliasId1: string,
  userId2: string,
  aliasId2: string
): Promise<string> => {
  if (userId1 === userId2) throw new Error('You cannot start a conversation with yourself')
  if (aliasId1 === aliasId2) throw new Error('You cannot start a conversation with the same alias')

  // Conversation ID is alias-based so each alias pair has its own conversation
  const sortedAliases = [aliasId1, aliasId2].sort()
  const convId = sortedAliases.join('__')

  const snap = await getDoc(doc(db, CONVERSATIONS, convId))
  if (!snap.exists()) {
    const participants = sortedAliases.map((aid) =>
      aid === aliasId1 ? userId1 : userId2
    )
    await setDoc(doc(db, CONVERSATIONS, convId), {
      participants,
      participantAliases: sortedAliases,
      lastMessage: null,
      updatedAt: serverTimestamp(),
    })
  }
  return convId
}

export const updateLastMessage = async (
  convId: string,
  lastMessage: LastMessage
) => {
  const { updateDoc } = await import('firebase/firestore')
  await updateDoc(doc(db, CONVERSATIONS, convId), {
    lastMessage,
    updatedAt: serverTimestamp(),
  })
}

export const markConversationRead = (convId: string, userId: string): Promise<void> =>
  updateDoc(doc(db, CONVERSATIONS, convId), {
    [`lastReadAt.${userId}`]: Date.now(),
  })

export const setTyping = (
  convId: string,
  userId: string,
  isTyping: boolean
): Promise<void> =>
  updateDoc(doc(db, CONVERSATIONS, convId), {
    [`typing.${userId}`]: isTyping,
  })

export const subscribeConversationTyping = (
  convId: string,
  cb: (typing: Record<string, boolean>) => void
): Unsubscribe =>
  onSnapshot(doc(db, CONVERSATIONS, convId), (snap) => {
    cb(snap.exists() ? (snap.data().typing ?? {}) : {})
  })

export const subscribeConversations = (
  userId: string,
  cb: (convs: Conversation[]) => void
): Unsubscribe => {
  const q = query(
    collection(db, CONVERSATIONS),
    where('participants', 'array-contains', userId)
  )
  const toMs = (val: unknown): number => {
    if (!val) return 0
    if (typeof val === 'number') return val
    if (typeof val === 'object' && 'toMillis' in (val as object))
      return (val as { toMillis: () => number }).toMillis()
    return 0
  }

  return onSnapshot(q, (snap) => {
    const convs = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Conversation))
      .sort((a, b) => toMs(b.updatedAt) - toMs(a.updatedAt))
    cb(convs)
  })
}
