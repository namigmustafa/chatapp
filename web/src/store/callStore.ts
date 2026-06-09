import { create } from 'zustand'
import type { Call } from '@/types'

interface CallState {
  activeCall: Call | null
  incomingCall: Call | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  peerConnection: RTCPeerConnection | null
  isMuted: boolean
  isVideoOff: boolean
  setActiveCall: (call: Call | null) => void
  setIncomingCall: (call: Call | null) => void
  setLocalStream: (stream: MediaStream | null) => void
  setRemoteStream: (stream: MediaStream | null) => void
  setPeerConnection: (pc: RTCPeerConnection | null) => void
  toggleMute: () => void
  toggleVideo: () => void
  reset: () => void
}

export const useCallStore = create<CallState>((set, get) => ({
  activeCall: null,
  incomingCall: null,
  localStream: null,
  remoteStream: null,
  peerConnection: null,
  isMuted: false,
  isVideoOff: false,
  setActiveCall: (call) => set({ activeCall: call }),
  setIncomingCall: (call) => set({ incomingCall: call }),
  setLocalStream: (stream) => set({ localStream: stream }),
  setRemoteStream: (stream) => set({ remoteStream: stream }),
  setPeerConnection: (pc) => set({ peerConnection: pc }),
  toggleMute: () => {
    const { localStream, isMuted } = get()
    localStream?.getAudioTracks().forEach((t) => (t.enabled = isMuted))
    set({ isMuted: !isMuted })
  },
  toggleVideo: () => {
    const { localStream, isVideoOff } = get()
    localStream?.getVideoTracks().forEach((t) => (t.enabled = isVideoOff))
    set({ isVideoOff: !isVideoOff })
  },
  reset: () => {
    const { localStream, peerConnection } = get()
    localStream?.getTracks().forEach((t) => t.stop())
    peerConnection?.close()
    set({
      activeCall: null,
      incomingCall: null,
      localStream: null,
      remoteStream: null,
      peerConnection: null,
      isMuted: false,
      isVideoOff: false,
    })
  },
}))

