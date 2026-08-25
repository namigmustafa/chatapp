import { create } from 'zustand'
import type { Room } from 'livekit-client'
import type { Call } from '@/types'

interface CallState {
  activeCall: Call | null
  incomingCall: Call | null
  incomingCallForeground: boolean
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  room: Room | null
  isMuted: boolean
  isVideoOff: boolean
  setActiveCall: (call: Call | null) => void
  setIncomingCall: (call: Call | null, foreground?: boolean) => void
  setLocalStream: (stream: MediaStream | null) => void
  setRemoteStream: (stream: MediaStream | null) => void
  setRoom: (room: Room | null) => void
  toggleMute: () => void
  toggleVideo: () => void
  reset: () => void
}

export const useCallStore = create<CallState>((set, get) => ({
  activeCall: null,
  incomingCall: null,
  incomingCallForeground: true,
  localStream: null,
  remoteStream: null,
  room: null,
  isMuted: false,
  isVideoOff: false,
  setActiveCall: (call) => set({ activeCall: call }),
  setIncomingCall: (call, foreground = true) => set({ incomingCall: call, incomingCallForeground: foreground }),
  setLocalStream: (stream) => set({ localStream: stream }),
  setRemoteStream: (stream) => set({ remoteStream: stream }),
  setRoom: (room) => set({ room }),
  toggleMute: () => {
    const { room, isMuted } = get()
    room?.localParticipant.setMicrophoneEnabled(isMuted).catch(() => {})
    set({ isMuted: !isMuted })
  },
  toggleVideo: () => {
    const { room, isVideoOff } = get()
    room?.localParticipant.setCameraEnabled(isVideoOff).catch(() => {})
    set({ isVideoOff: !isVideoOff })
  },
  reset: () => {
    const { localStream, room } = get()
    localStream?.getTracks().forEach((t) => t.stop())
    room?.disconnect()
    set({
      activeCall: null,
      incomingCall: null,
      incomingCallForeground: true,
      localStream: null,
      remoteStream: null,
      room: null,
      isMuted: false,
      isVideoOff: false,
    })
  },
}))
