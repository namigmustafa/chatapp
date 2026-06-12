import * as admin from 'firebase-admin'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'
import * as apn from '@parse/node-apn'

admin.initializeApp()

// APNs credentials — set via: firebase functions:secrets:set APNS_PRIVATE_KEY
const APNS_PRIVATE_KEY = defineSecret('APNS_PRIVATE_KEY')
const APNS_KEY_ID      = defineSecret('APNS_KEY_ID')
const APNS_TEAM_ID     = defineSecret('APNS_TEAM_ID')

const BUNDLE_ID = 'app.chatapp.p2p'

async function sendVoIPPush(
  voipToken: string,
  payload: Record<string, string>,
  privateKey: string,
  keyId: string,
  teamId: string
): Promise<void> {
  const provider = new apn.Provider({
    token: { key: privateKey, keyId, teamId },
    production: true,
  })
  try {
    const note = new apn.Notification()
    note.topic = `${BUNDLE_ID}.voip`
    note.pushType = 'voip'
    note.priority = 10
    note.payload = payload
    await provider.send(note, voipToken)
  } finally {
    provider.shutdown()
  }
}

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

// Gelen arama — FCM push (Android + web) + VoIP push (iOS)
export const onCallCreated = onDocumentCreated(
  { document: 'calls/{callId}', secrets: [APNS_PRIVATE_KEY, APNS_KEY_ID, APNS_TEAM_ID] },
  async (event) => {
    const call = event.data?.data()
    if (!call || call.status !== 'ringing') return

    // Get caller alias name
    let callerName = 'Someone'
    if (call.callerAliasId) {
      const aliasSnap = await db.doc(`aliases/${call.callerAliasId}`).get()
      if (aliasSnap.exists) callerName = `@${aliasSnap.data()!.name}`
    }

    const callId  = event.params.callId
    const title   = call.type === 'video' ? 'Incoming Video Call' : 'Incoming Voice Call'
    const body    = `${callerName} is calling you`

    // ── iOS VoIP push via APNs (wakes app from killed state, shows CallKit UI) ──
    const voipDoc = await db.doc(`voipTokens/${call.calleeUserId}`).get()
    if (voipDoc.exists) {
      const voipToken = voipDoc.data()?.ios as string | undefined
      if (voipToken) {
        const pk = APNS_PRIVATE_KEY.value()
        const ki = APNS_KEY_ID.value()
        const ti = APNS_TEAM_ID.value()
        if (pk && ki && ti) {
          await sendVoIPPush(
            voipToken,
            { callId, callType: call.type, callerName, callerUserId: call.callerUserId },
            pk, ki, ti
          ).catch((err: unknown) => console.error('[VoIP push] error:', err))
        }
      }
    }

    // ── FCM push (Android + web fallback) ──
    const tokenDoc = await db.doc(`fcmTokens/${call.calleeUserId}`).get()
    if (!tokenDoc.exists) return
    const tokenData = tokenDoc.data()!
    const tokens = getTokens(tokenData)
    if (tokens.length === 0) return

    const result = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: {
        type: 'incoming_call',
        callId,
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

    const failed = new Set<string>()
    result.responses.forEach((r, i) => {
      if (!r.success && (
        r.error?.code === 'messaging/registration-token-not-registered' ||
        r.error?.code === 'messaging/invalid-registration-token'
      )) failed.add(tokens[i])
    })
    if (failed.size > 0) await pruneExpiredTokens(call.calleeUserId, tokenData, failed)
  }
)

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
