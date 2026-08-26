import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  arrayUnion,
  getDocs,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { auth, db } from './firebase'
import type { Call, CallType } from '@/types'

const CALLS = 'calls'

const LIVEKIT_TOKEN_ENDPOINT = 'https://us-central1-chatapp-48786.cloudfunctions.net/getLiveKitToken'

// Room-scoped JWT — the room name is always the callId, and the Cloud
// Function verifies the requester is a participant of that specific call
// before minting anything (see functions/src/index.ts getLiveKitToken).
export const fetchLiveKitToken = async (callId: string): Promise<string> => {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('not authenticated')
  const resp = await fetch(`${LIVEKIT_TOKEN_ENDPOINT}?callId=${encodeURIComponent(callId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) throw new Error(`getLiveKitToken failed: ${resp.status}`)
  const data = (await resp.json()) as { token?: string }
  if (!data.token) throw new Error('getLiveKitToken: empty token')
  return data.token
}

export const initiateCall = async (
  callerUserId: string,
  callerAliasId: string,
  calleeAliasId: string,
  calleeUserId: string,
  type: CallType,
  conversationId: string
): Promise<string> => {
  const callId = `${callerUserId}_${calleeUserId}_${Date.now()}`
  await setDoc(doc(db, CALLS, callId), {
    callerUserId,
    callerAliasId,
    calleeAliasId,
    calleeUserId,
    type,
    conversationId,
    status: 'ringing',
    createdAt: serverTimestamp(),
  })
  return callId
}

// Callee has joined the LiveKit room — flip the call to 'active' so the
// caller's subscribeCall listener clears its ring timeout.
export const answerCall = async (callId: string) => {
  await updateDoc(doc(db, CALLS, callId), { status: 'active' })
}

export const rejectCall = async (callId: string) => {
  await updateDoc(doc(db, CALLS, callId), { status: 'rejected' })
}

export const endCall = async (callId: string) => {
  await updateDoc(doc(db, CALLS, callId), { status: 'ended' })
}

export const missedCall = async (callId: string) => {
  await updateDoc(doc(db, CALLS, callId), { status: 'missed' })
}

// Callee's acceptCall() failed (e.g. mic permission or LiveKit connect failed
// while answering from a locked/backgrounded device) after CallKit already
// dismissed its UI. Without this, the caller's subscribeCall listener never
// fires again and the caller's "Ringing..." screen hangs forever with no audio.
export const calleeError = async (callId: string) => {
  await updateDoc(doc(db, CALLS, callId), { status: 'callee_error' })
}

export const subscribeCall = (
  callId: string,
  cb: (call: Call | null) => void
): Unsubscribe => {
  return onSnapshot(doc(db, CALLS, callId), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as Call) : null)
  })
}

export const subscribeIncomingCalls = (
  userId: string,
  cb: (call: Call) => void,
  onNoLongerRinging?: (callId: string) => void
): Unsubscribe => {
  const q = query(
    collection(db, CALLS),
    where('calleeUserId', '==', userId),
    where('status', '==', 'ringing')
  )
  return onSnapshot(q, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === 'added') {
        cb({ id: change.doc.id, ...change.doc.data() } as Call)
      } else if (change.type === 'removed') {
        // Status moved off 'ringing' — e.g. the native CallKit answer path
        // (CallEngine on iOS) answered it directly, bypassing this JS session
        // entirely. Without this, a stale "incoming call" screen can be left
        // showing after the app resumes, since nothing else clears it.
        onNoLongerRinging?.(change.doc.id)
      }
    })
  })
}

export interface CallDiagnosticRecord {
  id: string
  status: string
  type: string
  isCaller: boolean
  otherAliasId: string
  createdAt: number
  callerDebugLog?: string[]
  calleeDebugLog?: string[]
  calleeDebugNative?: string
}

// Reads the current user's own recent calls straight from Firestore — no
// server round-trip and no temporary Cloud Function needed (previously the
// only way to see this data was a throwaway unauthenticated debug endpoint
// deployed and deleted by hand for every debugging round). Security rules
// (firestore.rules `match /calls/{callId}`) already restrict reads to the
// caller/callee themselves, so this can run straight from the client.
// createdAt is written via serverTimestamp() (see initiateCall below), so it
// comes back as a Firestore Timestamp object, not the plain number the Call
// type claims — a naive `typeof === 'number'` check silently coerced every
// record to 0 (1970-01-01), which broke the recency sort entirely and was
// showing arbitrary old calls instead of the actual most recent ones.
function toMillis(val: unknown): number {
  if (typeof val === 'number') return val
  if (val && typeof (val as { toMillis?: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis()
  }
  return 0
}

export const getMyRecentCalls = async (userId: string, max = 15): Promise<CallDiagnosticRecord[]> => {
  const [asCaller, asCallee] = await Promise.all([
    getDocs(query(collection(db, CALLS), where('callerUserId', '==', userId))),
    getDocs(query(collection(db, CALLS), where('calleeUserId', '==', userId))),
  ])
  const seen = new Map<string, CallDiagnosticRecord>()
  for (const snap of [asCaller, asCallee]) {
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>
      const isCaller = data.callerUserId === userId
      seen.set(d.id, {
        id: d.id,
        status: String(data.status ?? 'unknown'),
        type: String(data.type ?? 'audio'),
        isCaller,
        otherAliasId: String((isCaller ? data.calleeAliasId : data.callerAliasId) ?? ''),
        createdAt: toMillis(data.createdAt),
        callerDebugLog: data.callerDebugLog as string[] | undefined,
        calleeDebugLog: data.calleeDebugLog as string[] | undefined,
        calleeDebugNative: data.calleeDebugNative as string | undefined,
      })
    }
  }
  return [...seen.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, max)
}

export const cleanupCall = async (callId: string) => {
  await deleteDoc(doc(db, CALLS, callId))
}

// Diagnostic: record how far the callee's answer flow got, readable in the
// Firestore console (calls/{id}.calleeDebugLog). Accumulates via arrayUnion —
// a plain overwrite hid earlier stages behind whatever ran last (e.g. missed
// whether the pre-answer effect ran at all before CallEngine's own writes).
// Best-effort, never throws.
export const writeCalleeDebug = async (callId: string, stage: string) => {
  try {
    await updateDoc(doc(db, CALLS, callId), { calleeDebugLog: arrayUnion(`${Date.now()}:${stage}`) })
  } catch { /* ignore */ }
}

// Same, for the caller side (calls/{id}.callerDebugLog) — used to trace LiveKit
// connection state so a media failure is visible even without a live device console.
export const writeCallerDebug = async (callId: string, stage: string) => {
  try {
    await updateDoc(doc(db, CALLS, callId), { callerDebugLog: arrayUnion(`${Date.now()}:${stage}`) })
  } catch { /* ignore */ }
}
