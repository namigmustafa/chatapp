import * as admin from 'firebase-admin'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { FieldValue } from 'firebase-admin/firestore'

admin.initializeApp()

const db = admin.firestore()
const messaging = admin.messaging()

// Collect valid tokens from fcmTokens doc — fields: web, native
function getTokens(data: FirebaseFirestore.DocumentData): string[] {
  const tokens: string[] = []
  if (data.web && typeof data.web === 'string') tokens.push(data.web)
  if (data.native && typeof data.native === 'string') tokens.push(data.native)
  return tokens
}

// Remove stale tokens from Firestore after FCM rejects them
async function pruneExpiredTokens(
  userId: string,
  tokenData: FirebaseFirestore.DocumentData,
  failedTokens: Set<string>
): Promise<void> {
  const updates: Record<string, FieldValue> = {}
  if (failedTokens.has(tokenData.web)) updates.web = FieldValue.delete()
  if (failedTokens.has(tokenData.native)) updates.native = FieldValue.delete()
  if (Object.keys(updates).length > 0) {
    await db.doc(`fcmTokens/${userId}`).update(updates)
  }
}

// Gelen arama — push notification gönder
export const onCallCreated = onDocumentCreated('calls/{callId}', async (event) => {
  const call = event.data?.data()
  if (!call || call.status !== 'ringing') return

  const tokenDoc = await db.doc(`fcmTokens/${call.calleeUserId}`).get()
  if (!tokenDoc.exists) return
  const tokenData = tokenDoc.data()!
  const tokens = getTokens(tokenData)
  if (tokens.length === 0) return

  // Get caller's alias name from the call doc (callerAliasId field)
  let callerName = 'Someone'
  if (call.callerAliasId) {
    const aliasSnap = await db.doc(`aliases/${call.callerAliasId}`).get()
    if (aliasSnap.exists) callerName = `@${aliasSnap.data()!.name}`
  }

  const title = call.type === 'video' ? 'Incoming Video Call' : 'Incoming Voice Call'
  const body = `${callerName} is calling you`

  const result = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: {
      type: 'incoming_call',
      callId: event.params.callId,
      callType: call.type,
      callerUserId: call.callerUserId,
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1, 'content-available': 1 } },
    },
    android: {
      notification: { sound: 'default', channelId: 'calls', priority: 'high' },
      priority: 'high',
    },
    webpush: {
      fcmOptions: { link: '/' },
      notification: {
        icon: '/favicon.svg',
        requireInteraction: true,
        actions: [
          { action: 'answer', title: 'Answer' },
          { action: 'reject', title: 'Decline' },
        ],
      },
    },
  })

  // Clean up expired tokens
  const failed = new Set<string>()
  result.responses.forEach((r, i) => {
    if (!r.success && (
      r.error?.code === 'messaging/registration-token-not-registered' ||
      r.error?.code === 'messaging/invalid-registration-token'
    )) failed.add(tokens[i])
  })
  if (failed.size > 0) await pruneExpiredTokens(call.calleeUserId, tokenData, failed)
})

// Yeni mesaj — push notification gönder
export const onMessageCreated = onDocumentCreated('messages/{msgId}', async (event) => {
  const message = event.data?.data()
  if (!message) return

  const convSnap = await db.doc(`conversations/${message.conversationId}`).get()
  if (!convSnap.exists) return
  const conv = convSnap.data()!

  const participants: string[] = conv.participants
  const recipientId = participants.find((p: string) => p !== message.senderId)
  if (!recipientId) return

  const tokenDoc = await db.doc(`fcmTokens/${recipientId}`).get()
  if (!tokenDoc.exists) return
  const tokenData = tokenDoc.data()!
  const tokens = getTokens(tokenData)
  if (tokens.length === 0) return

  // Use the sender's alias from participantAliases (same order as participants)
  const senderIndex = participants.indexOf(message.senderId)
  const senderAliasId: string | undefined = conv.participantAliases?.[senderIndex]
  let senderName = 'New message'
  if (senderAliasId) {
    const aliasSnap = await db.doc(`aliases/${senderAliasId}`).get()
    if (aliasSnap.exists) senderName = `@${aliasSnap.data()!.name}`
  }

  // Notification body by message type
  const body = message.type === 'image' ? '📷 Photo'
    : message.type === 'video' ? '🎥 Video'
    : message.type === 'document' ? `📄 ${message.fileName ?? 'Document'}`
    : (message.content ?? '').substring(0, 80)

  const result = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: senderName, body },
    data: {
      type: 'new_message',
      conversationId: message.conversationId,
      senderId: message.senderId,
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
    android: {
      notification: { sound: 'default', channelId: 'messages' },
    },
    webpush: {
      fcmOptions: { link: '/' },
    },
  })

  // Clean up expired tokens
  const failed = new Set<string>()
  result.responses.forEach((r, i) => {
    if (!r.success && (
      r.error?.code === 'messaging/registration-token-not-registered' ||
      r.error?.code === 'messaging/invalid-registration-token'
    )) failed.add(tokens[i])
  })
  if (failed.size > 0) await pruneExpiredTokens(recipientId, tokenData, failed)
})
