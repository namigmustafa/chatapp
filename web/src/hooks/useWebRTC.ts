import { useCallback, useEffect, useRef } from 'react'
import { Room, RoomEvent, Track } from 'livekit-client'
import { useCallStore } from '@/store/callStore'
import { useAuthStore } from '@/store/authStore'
import {
  fetchLiveKitToken,
  initiateCall,
  answerCall,
  rejectCall,
  endCall,
  missedCall,
  calleeError,
  subscribeCall,
  cleanupCall,
  writeCalleeDebug,
  writeCallerDebug,
} from '@/services/webrtc'
import type { Call, CallType } from '@/types'

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string | undefined

export const useWebRTC = () => {
  const { user } = useAuthStore()
  const {
    setActiveCall,
    setIncomingCall,
    setRemoteStream,
    setRoom,
    reset,
  } = useCallStore()

  const unsubscribeRef = useRef<(() => void)[]>([])
  // Guards against rapid repeat taps on the call button — nothing previously
  // stopped a second startCall() from firing before the first had even
  // created its Firestore doc, each one spawning its own independent call
  // (confirmed in production: 5 separate call docs created within 2 seconds
  // from what was a single user action). activeCall/incomingCall in the
  // store aren't set until well after the async work starts, so a ref
  // flipped synchronously at the top of startCall is the only thing that
  // actually closes the window in time.
  const startingCallRef = useRef(false)

  const cleanup = useCallback(() => {
    unsubscribeRef.current.forEach((u) => u())
    unsubscribeRef.current = []
    reset()
  }, [reset])

  // Mic permission prompts (or the WKWebView resume race on iOS) can reject
  // immediately if invoked before the WebView is fully resumed. One retry
  // after a short delay covers that without hanging the caller.
  const connectRoomWithRetry = async (callId: string): Promise<Room> => {
    const token = await fetchLiveKitToken(callId)
    const room = new Room()
    try {
      await room.connect(LIVEKIT_URL!, token)
      await room.localParticipant.setMicrophoneEnabled(true)
    } catch (e) {
      try {
        await new Promise((r) => setTimeout(r, 800))
        await room.localParticipant.setMicrophoneEnabled(true)
      } catch {
        room.disconnect()
        throw e
      }
    }
    return room
  }

  const wireRemoteAudio = (room: Room, dbg: (stage: string) => void) => {
    room.on(RoomEvent.TrackSubscribed, (track) => {
      dbg('trackSubscribed:' + track.kind)
      if (track.kind === Track.Kind.Audio) {
        setRemoteStream(new MediaStream([track.mediaStreamTrack]))
      }
    })
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      dbg('trackUnsubscribed:' + track.kind)
      if (track.kind === Track.Kind.Audio) setRemoteStream(null)
    })
    room.on(RoomEvent.ParticipantConnected, (p) => dbg('participantConnected:' + p.identity))
    room.on(RoomEvent.ParticipantDisconnected, (p) => dbg('participantDisconnected:' + p.identity))
  }

  const startCall = useCallback(
    async (callerAliasId: string, calleeAliasId: string, calleeUserId: string, type: CallType, conversationId: string) => {
      if (!user) return
      if (!LIVEKIT_URL) {
        console.error('VITE_LIVEKIT_URL is not configured')
        return
      }
      if (startingCallRef.current) return
      startingCallRef.current = true
      // Released after a couple seconds regardless of outcome — long enough to
      // absorb a rapid-fire double tap, short enough not to block a genuine
      // next call attempt (e.g. redialing after a quick rejection).
      setTimeout(() => { startingCallRef.current = false }, 3000)

      let callId: string
      try {
        callId = await initiateCall(user.uid, callerAliasId, calleeAliasId, calleeUserId, type, conversationId)
      } catch {
        return
      }

      // Show the call screen IMMEDIATELY — previously this waited until the
      // entire LiveKit connect handshake (token fetch + WS/ICE + mic init)
      // finished, leaving the caller staring at nothing for 3-4s after
      // tapping the call button with zero feedback that anything happened.
      setActiveCall({
        id: callId,
        callerUserId: user.uid,
        callerAliasId,
        calleeAliasId,
        calleeUserId,
        type,
        status: 'ringing',
        createdAt: Date.now(),
      })

      const dbg = (stage: string) => { void writeCallerDebug(callId, stage) }

      // 30-second ring timeout — mark as missed if no answer
      const ringTimeout = setTimeout(() => {
        missedCall(callId).catch(() => {})
        cleanup()
      }, 30_000)

      try {
        dbg('caller:connecting')
        const room = await connectRoomWithRetry(callId)
        setRoom(room)
        wireRemoteAudio(room, dbg)
        dbg('caller:connected')

        const unsubCall = subscribeCall(callId, (call) => {
          if (!call) return
          setActiveCall(call)
          if (call.status === 'active') clearTimeout(ringTimeout)
          if (['ended', 'rejected', 'missed', 'callee_error'].includes(call.status)) {
            clearTimeout(ringTimeout)
            setTimeout(() => cleanup(), 1500)
          }
        })
        unsubscribeRef.current.push(unsubCall, () => clearTimeout(ringTimeout))
      } catch (e) {
        dbg('caller:error:' + String((e as Error)?.message ?? e).slice(0, 80))
        clearTimeout(ringTimeout)
        missedCall(callId).catch(() => {})
        cleanup()
      }
    },
    [user, setActiveCall, setRoom, cleanup]
  )

  const acceptCall = useCallback(
    async (call: Call) => {
      const dbg = (stage: string) => { void writeCalleeDebug(call.id, stage) }
      if (!LIVEKIT_URL) {
        dbg('accept:error:missingLiveKitUrl')
        calleeError(call.id).catch(() => {})
        return
      }
      try {
        dbg('accept:connecting')
        const room = await connectRoomWithRetry(call.id)
        setRoom(room)
        wireRemoteAudio(room, dbg)
        dbg('accept:connected')

        await answerCall(call.id)
        dbg('accept:answerWritten')
        setIncomingCall(null)
        setActiveCall({ ...call, status: 'active' })

        const unsubCall = subscribeCall(call.id, (updated) => {
          if (!updated) return
          setActiveCall(updated)
          if (updated.status === 'ended') {
            setTimeout(() => cleanup(), 1500)
          }
        })
        unsubscribeRef.current.push(unsubCall)
      } catch (e) {
        // Most likely mic permission or LiveKit connect failing (e.g. answered
        // while locked). Tell the caller via Firestore — without this write the
        // caller's subscribeCall listener never fires again and its "Ringing..."
        // screen hangs forever with no audio.
        dbg('accept:error:' + String((e as Error)?.message ?? e).slice(0, 80))
        calleeError(call.id).catch(() => {})
        cleanup()
      }
    },
    [setIncomingCall, setActiveCall, setRoom, cleanup]
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
