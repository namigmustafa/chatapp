import * as admin from 'firebase-admin'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'

admin.initializeApp()

const db = admin.firestore()
const messaging = admin.messaging()

// Gelen arama — push notification gönder
export const onCallCreated = onDocumentCreated('calls/{callId}', async (event) => {
  const call = event.data?.data()
  if (!call || call.status !== 'ringing') return

  const tokenDoc = await db.doc(`fcmTokens/${call.calleeUserId}`).get()
  if (!tokenDoc.exists) return

  const tokens: string[] = []
  const data = tokenDoc.data()
  if (data?.web) tokens.push(data.web)
  if (data?.mobile) tokens.push(data.mobile)
  if (tokens.length === 0) return

  const callerAlias = await db
    .collection('aliases')
    .where('userId', '==', call.callerUserId)
    .limit(1)
    .get()

  const callerName = callerAlias.empty
    ? 'Bilinmeyen'
    : `@${callerAlias.docs[0].data().name}`

  await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: call.type === 'video' ? 'Görüntülü Arama' : 'Sesli Arama',
      body: `${callerName} sizi arıyor`,
    },
    data: {
      type: 'incoming_call',
      callId: event.params.callId,
      callType: call.type,
      callerUserId: call.callerUserId,
    },
    webpush: {
      fcmOptions: { link: '/' },
      notification: {
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        requireInteraction: true,
        actions: [
          { action: 'answer', title: 'Cevapla' },
          { action: 'reject', title: 'Reddet' },
        ],
      },
    },
  })
})

// Yeni mesaj — push notification gönder (sadece app kapalıysa)
export const onMessageCreated = onDocumentCreated('messages/{msgId}', async (event) => {
  const message = event.data?.data()
  if (!message || message.type !== 'text') return

  const conv = await db.doc(`conversations/${message.conversationId}`).get()
  if (!conv.exists) return

  const participants: string[] = conv.data()!.participants
  const recipientId = participants.find((p) => p !== message.senderId)
  if (!recipientId) return

  const tokenDoc = await db.doc(`fcmTokens/${recipientId}`).get()
  if (!tokenDoc.exists) return

  const tokens: string[] = []
  const data = tokenDoc.data()
  if (data?.web) tokens.push(data.web)
  if (data?.mobile) tokens.push(data.mobile)
  if (tokens.length === 0) return

  const senderAlias = await db
    .collection('aliases')
    .where('userId', '==', message.senderId)
    .limit(1)
    .get()

  const senderName = senderAlias.empty
    ? 'Bilinmeyen'
    : `@${senderAlias.docs[0].data().name}`

  await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: senderName,
      body: message.content.length > 60
        ? message.content.substring(0, 60) + '...'
        : message.content,
    },
    data: {
      type: 'new_message',
      conversationId: message.conversationId,
      senderId: message.senderId,
    },
    webpush: {
      fcmOptions: { link: '/' },
    },
  })
})
