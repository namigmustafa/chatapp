import { useCallback, useEffect, useRef } from 'react'
import { useCallStore } from '@/store/callStore'
import { useAuthStore } from '@/store/authStore'
import {
  createPeerConnection,
  initiateCall,
  answerCall,
  rejectCall,
  endCall,
  sendIceCandidate,
  subscribeCall,
  subscribeIceCandidates,
  cleanupCall,
} from '@/services/webrtc'
import type { Call, CallType, IceCandidate } from '@/types'

export const useWebRTC = () => {
  const { user } = useAuthStore()
  const {
    setActiveCall,
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

  const getMediaStream = async (type: CallType) => {
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video'
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        : false,
    })
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
    async (callerAliasId: string, calleeAliasId: string, calleeUserId: string, type: CallType) => {
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

      // Buffer caller ICE candidates until we have callId
      const callerCandidatesBuffer: IceCandidate[] = []
      let resolvedCallId: string | null = null

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

      resolvedCallId = await initiateCall(user.uid, callerAliasId, calleeAliasId, calleeUserId, type, offer)
      const callId = resolvedCallId

      // Flush buffered ICE candidates
      for (const ice of callerCandidatesBuffer) {
        sendIceCandidate(callId, 'caller', ice).catch(() => {})
      }

      const unsubCall = subscribeCall(callId, async (call) => {
        if (!call) return
        setActiveCall(call)
        if (call.answer && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(call.answer))
          flushPendingIce(pc)
        }
        if (call.status === 'ended' || call.status === 'rejected') {
          setTimeout(() => cleanup(), 1500)
        }
      })

      const unsubIce = subscribeIceCandidates(callId, 'callee', (ice) => {
        addIceSafe(pc, ice)
      })

      unsubscribeRef.current.push(unsubCall, unsubIce)
    },
    [user, setLocalStream, setRemoteStream, setPeerConnection, setActiveCall, cleanup]
  )

  const acceptCall = useCallback(
    async (call: Call) => {
      const pc = createPeerConnection()
      pcRef.current = pc
      const stream = await getMediaStream(call.type)
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

      await pc.setRemoteDescription(new RTCSessionDescription(call.offer!))
      flushPendingIce(pc)

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      await answerCall(call.id, answer)
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
    },
    [setLocalStream, setRemoteStream, setPeerConnection, setActiveCall, cleanup]
  )

  const declineCall = useCallback(async (callId: string) => {
    await rejectCall(callId)
    cleanup()
  }, [cleanup])

  const hangUp = useCallback(async (callId: string) => {
    await endCall(callId)
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
