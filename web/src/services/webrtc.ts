import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  addDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'
import type { Call, CallType, IceCandidate } from '@/types'

const CALLS = 'calls'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Free TURN relay — needed for NAT/mobile networks where STUN alone fails
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

export const createPeerConnection = () => {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS })
}

export const initiateCall = async (
  callerUserId: string,
  callerAliasId: string,
  calleeAliasId: string,
  calleeUserId: string,
  type: CallType,
  offer: RTCSessionDescriptionInit,
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
    offer,
    answer: null,
    createdAt: serverTimestamp(),
  })
  return callId
}

export const answerCall = async (
  callId: string,
  answer: RTCSessionDescriptionInit
) => {
  await updateDoc(doc(db, CALLS, callId), {
    answer,
    status: 'active',
  })
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

export const sendIceCandidate = async (
  callId: string,
  side: 'caller' | 'callee',
  candidate: IceCandidate
) => {
  await addDoc(
    collection(db, CALLS, callId, `${side}Candidates`),
    candidate
  )
}

export const subscribeCall = (
  callId: string,
  cb: (call: Call | null) => void
): Unsubscribe => {
  return onSnapshot(doc(db, CALLS, callId), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as Call) : null)
  })
}

export const subscribeIceCandidates = (
  callId: string,
  side: 'caller' | 'callee',
  cb: (candidate: IceCandidate) => void
): Unsubscribe => {
  return onSnapshot(
    collection(db, CALLS, callId, `${side}Candidates`),
    (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          cb(change.doc.data() as IceCandidate)
        }
      })
    }
  )
}

export const subscribeIncomingCalls = (
  userId: string,
  cb: (call: Call) => void
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
      }
    })
  })
}

export const cleanupCall = async (callId: string) => {
  await deleteDoc(doc(db, CALLS, callId))
}
