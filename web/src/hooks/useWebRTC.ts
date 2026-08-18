import { useCallback, useEffect, useRef } from 'react'
import { useCallStore } from '@/store/callStore'
import { useAuthStore } from '@/store/authStore'
import {
  createPeerConnection,
  initiateCall,
  answerCall,
  rejectCall,
  endCall,
  missedCall,
  calleeError,
  sendIceCandidate,
  subscribeCall,
  subscribeIceCandidates,
  cleanupCall,
  writeCalleeDebug,
  writeCallerDebug,
} from '@/services/webrtc'
import type { Call, CallType, IceCandidate } from '@/types'

export const useWebRTC = () => {
  const { user } = useAuthStore()
  const {
    setActiveCall,
    setIncomingCall,
    setLocalStream,
    setRemoteStream,
    setPeerConnection,
    reset,
  } = useCallStore()

  const unsubscribeRef = useRef<(() => void)[]>([])
  // Buffer remote ICE candidates that arrive before setRemoteDescription
  const pendingRemoteIceRef = useRef<IceCandidate[]>([])
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const remoteDescSetRef = useRef(false)

  const cleanup = useCallback(() => {
    unsubscribeRef.current.forEach((u) => u())
    unsubscribeRef.current = []
    pendingRemoteIceRef.current = []
    pcRef.current = null
    remoteDescSetRef.current = false
    reset()
  }, [reset])

  // WebRTC negotiation calls can hang indefinitely (neither resolve nor reject) when
  // getUserMedia succeeds but conflicts with CallKit's already-active AVAudioSession
  // during a locked-screen answer. Without this, that leaves the callee's UI stuck
  // forever and the caller waiting the full 30s ring timeout with no explanation.
  const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      p,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timeout:${label}`)), ms)),
    ])

  const getMediaStream = async (type: CallType) => {
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video'
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        : false,
    })
  }

  // Answering from CallKit/lock-screen can invoke this before the WebView is
  // fully resumed, in which case getUserMedia rejects immediately. One retry
  // after a short delay covers that resume race without hanging the caller.
  const getMediaStreamWithRetry = async (type: CallType) => {
    try {
      return await getMediaStream(type)
    } catch {
      await new Promise((r) => setTimeout(r, 800))
      return await getMediaStream(type)
    }
  }

  const addIceSafe = (pc: RTCPeerConnection, ice: IceCandidate) => {
    if (remoteDescSetRef.current) {
      pc.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {})
    } else {
      pendingRemoteIceRef.current.push(ice)
    }
  }

  const flushPendingIce = (pc: RTCPeerConnection) => {
    remoteDescSetRef.current = true
    pendingRemoteIceRef.current.forEach((ice) => {
      pc.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {})
    })
    pendingRemoteIceRef.current = []
  }

  const startCall = useCallback(
    async (callerAliasId: string, calleeAliasId: string, calleeUserId: string, type: CallType, conversationId: string) => {
      if (!user) return

      const pc = createPeerConnection()
      pcRef.current = pc
      const stream = await getMediaStream(type)
      setLocalStream(stream)
      setPeerConnection(pc)

      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      pc.ontrack = (e) => {
        if (e.streams[0]) setRemoteStream(e.streams[0])
      }

      const callerCandidatesBuffer: IceCandidate[] = []
      let resolvedCallId: string | null = null

      // Diagnostic: if signaling succeeds but media never flows, this shows exactly
      // where ICE got stuck (e.g. 'failed' usually means TURN was unreachable).
      pc.oniceconnectionstatechange = () => {
        if (resolvedCallId) writeCallerDebug(resolvedCallId, 'iceState:' + pc.iceConnectionState)
      }
      pc.onconnectionstatechange = () => {
        if (resolvedCallId) writeCallerDebug(resolvedCallId, 'connState:' + pc.connectionState)
      }

      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) return
        const ice: IceCandidate = {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        }
        if (resolvedCallId) {
          sendIceCandidate(resolvedCallId, 'caller', ice).catch(() => {})
        } else {
          callerCandidatesBuffer.push(ice)
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      resolvedCallId = await initiateCall(user.uid, callerAliasId, calleeAliasId, calleeUserId, type, offer, conversationId)
      const callId = resolvedCallId

      for (const ice of callerCandidatesBuffer) {
        sendIceCandidate(callId, 'caller', ice).catch(() => {})
      }

      // 30-second ring timeout — mark as missed if no answer
      const ringTimeout = setTimeout(() => {
        missedCall(callId).catch(() => {})
        cleanup()
      }, 30_000)

      const unsubCall = subscribeCall(callId, async (call) => {
        if (!call) return
        setActiveCall(call)
        if (call.answer && pc.signalingState === 'have-local-offer') {
          clearTimeout(ringTimeout)
          await pc.setRemoteDescription(new RTCSessionDescription(call.answer))
          flushPendingIce(pc)
        }
        if (call.status === 'ended' || call.status === 'rejected' || call.status === 'missed' || call.status === 'callee_error') {
          clearTimeout(ringTimeout)
          setTimeout(() => cleanup(), 1500)
        }
      })

      const unsubIce = subscribeIceCandidates(callId, 'callee', (ice) => {
        addIceSafe(pc, ice)
      })

      unsubscribeRef.current.push(unsubCall, unsubIce, () => clearTimeout(ringTimeout))
    },
    [user, setLocalStream, setRemoteStream, setPeerConnection, setActiveCall, cleanup]
  )

  const acceptCall = useCallback(
    async (call: Call) => {
      // Diagnostic breadcrumb written to the call doc so we can see — in the Firestore
      // console — exactly how far the answer got on the device (esp. CallKit/locked).
      const dbg = (stage: string) => { void writeCalleeDebug(call.id, stage) }
      try {
        dbg('accept:start')
        const pc = createPeerConnection()
        pcRef.current = pc
        pc.oniceconnectionstatechange = () => dbg('iceState:' + pc.iceConnectionState)
        pc.onconnectionstatechange = () => dbg('connState:' + pc.connectionState)
        const stream = await getMediaStreamWithRetry(call.type)
        dbg('accept:gotMedia')
        setLocalStream(stream)
        setPeerConnection(pc)

        stream.getTracks().forEach((track) => pc.addTrack(track, stream))
        pc.ontrack = (e) => {
          if (e.streams[0]) setRemoteStream(e.streams[0])
        }

        // Set onicecandidate BEFORE setLocalDescription
        pc.onicecandidate = ({ candidate }) => {
          if (!candidate) return
          sendIceCandidate(call.id, 'callee', {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
          }).catch(() => {})
        }

        await withTimeout(pc.setRemoteDescription(new RTCSessionDescription(call.offer!)), 10_000, 'setRemoteDescription')
        dbg('accept:remoteDescSet')
        flushPendingIce(pc)

        const answer = await withTimeout(pc.createAnswer(), 10_000, 'createAnswer')
        dbg('accept:answerCreated')
        await withTimeout(pc.setLocalDescription(answer), 10_000, 'setLocalDescription')
        dbg('accept:localDescSet')

        await withTimeout(answerCall(call.id, answer), 10_000, 'answerCall')
        dbg('accept:answerWritten')
        setIncomingCall(null)
        setActiveCall({ ...call, status: 'active' })

        const unsubIce = subscribeIceCandidates(call.id, 'caller', (ice) => {
          addIceSafe(pc, ice)
        })

        const unsubCall = subscribeCall(call.id, (updated) => {
          if (!updated) return
          setActiveCall(updated)
          if (updated.status === 'ended') {
            setTimeout(() => cleanup(), 1500)
          }
        })

        unsubscribeRef.current.push(unsubIce, unsubCall)
      } catch (e) {
        // Most likely getUserMedia failing (e.g. mic blocked when answered while
        // locked), even after the retry. Tell the caller via Firestore — without
        // this write the caller's subscribeCall listener never fires again and
        // its "Ringing..." screen hangs forever with no audio.
        dbg('accept:error:' + String((e as Error)?.message ?? e).slice(0, 80))
        calleeError(call.id).catch(() => {})
        cleanup()
      }
    },
    [setIncomingCall, setLocalStream, setRemoteStream, setPeerConnection, setActiveCall, cleanup]
  )

  const declineCall = useCallback(async (callId: string) => {
    await rejectCall(callId)
    cleanup()
  }, [cleanup])

  const hangUp = useCallback(async (callId: string) => {
    const currentStatus = useCallStore.getState().activeCall?.status
    if (currentStatus === 'ringing') {
      await missedCall(callId)
    } else {
      await endCall(callId)
    }
    cleanup()
    setTimeout(() => cleanupCall(callId), 5000)
  }, [cleanup])

  useEffect(() => {
    return () => {
      unsubscribeRef.current.forEach((u) => u())
    }
  }, [])

  return { startCall, acceptCall, declineCall, hangUp }
}
