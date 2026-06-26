import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useCallStore } from '@/store/callStore'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { useWebRTC } from '@/hooks/useWebRTC'
import AliasAvatar from '@/components/ui/AliasAvatar'
import { startRingtone } from '@/utils/notificationSound'
import IncomingCallBanner from './IncomingCallBanner'
import type { Call } from '@/types'

// ── SVG icons ──────────────────────────────────────────────────────────────
function PhoneIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.77a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
    </svg>
  )
}

function PhoneOffIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c.907.34 1.85.573 2.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.42 19.42 0 01-3.33-2.67m-2.67-3.34a19.79 19.79 0 01-3.07-8.63A2 2 0 014.11 2h3a2 2 0 011.72 1.54c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.91 9.6"/>
      <line x1="23" y1="1" x2="1" y2="23"/>
    </svg>
  )
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
      <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
    </svg>
  )
}

function MicOffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/>
      <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8"/>
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/>
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
  )
}

function VideoOffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

// ── Timer ──────────────────────────────────────────────────────────────────
function useCallTimer(active: boolean) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!active) { setSeconds(0); return }
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [active])
  const m = String(Math.floor(seconds / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

// ── Round button ───────────────────────────────────────────────────────────
function RoundBtn({
  onClick,
  active = false,
  danger = false,
  children,
  label,
}: {
  onClick: (e: React.MouseEvent) => void
  active?: boolean
  danger?: boolean
  children: React.ReactNode
  label: string
}) {
  const bg = danger
    ? 'bg-red-600 hover:bg-red-700'
    : active
    ? 'bg-zinc-600 hover:bg-zinc-500'
    : 'bg-zinc-800 hover:bg-zinc-700'
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`${bg} w-16 h-16 rounded-full flex items-center justify-center text-white transition-colors`}
    >
      {children}
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function CallOverlay() {
  const {
    activeCall,
    incomingCall,
    incomingCallForeground,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    toggleMute,
    toggleVideo,
  } = useCallStore()
  const { user } = useAuthStore()
  const { pendingCallKitAction, setPendingCallKitAction, pendingCallKitCallId, setPendingCallKitCallId } = useUIStore()
  const { acceptCall, declineCall, hangUp } = useWebRTC()

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)

  const timer = useCallTimer(activeCall?.status === 'active')

  // Handle CallKit answer/decline actions from the iOS lock screen.
  // If the call object is already in memory (incomingCall), act on it directly.
  // Otherwise — answered from CallKit while the app wasn't holding the call — load it
  // from Firestore by id so we still write the WebRTC answer and the caller connects.
  useEffect(() => {
    if (!pendingCallKitAction) return
    let cancelled = false
    const removers: Array<() => void> = []
    const cleanup = () => { removers.forEach((r) => r()); removers.length = 0 }

    const clearPending = () => {
      setPendingCallKitAction(null)
      setPendingCallKitCallId(null)
    }

    // Answering needs the mic (getUserMedia), which iOS blocks while the screen is
    // locked / the web view is backgrounded — there it just hangs forever. Defer the
    // answer until the app is actually foregrounded. Capacitor's appStateChange is the
    // reliable iOS signal (the DOM 'visibilitychange' event is flaky in WKWebView).
    const answerWhenForeground = (call: Call) => {
      const attempt = () => {
        if (cancelled) return false
        if (document.visibilityState !== 'visible') return false
        cleanup()
        clearPending()
        acceptCall(call)
        return true
      }
      if (attempt()) return
      const onVis = () => { attempt() }
      document.addEventListener('visibilitychange', onVis)
      removers.push(() => document.removeEventListener('visibilitychange', onVis))
      ;(async () => {
        const { App: CapApp } = await import('@capacitor/app')
        const listener = await CapApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) attempt()
        })
        if (cancelled) { listener.remove(); return }
        removers.push(() => listener.remove())
      })()
    }

    if (incomingCall) {
      if (pendingCallKitAction === 'answer') answerWhenForeground(incomingCall)
      else { declineCall(incomingCall.id); clearPending() }
    } else if (pendingCallKitAction === 'answer' && pendingCallKitCallId) {
      // Recover the answer path when the call wasn't in memory (load it by id).
      ;(async () => {
        try {
          const { doc, getDoc } = await import('firebase/firestore')
          const { db } = await import('@/services/firebase')
          const snap = await getDoc(doc(db, 'calls', pendingCallKitCallId))
          if (cancelled || !snap.exists()) return
          const call = { id: snap.id, ...snap.data() } as Call
          if (call.offer && call.status === 'ringing') answerWhenForeground(call)
          else clearPending()
        } catch { /* keep pending; effect will re-run */ }
      })()
    }
    // else: no call yet — wait for incomingCall to arrive (don't clear the action)

    return () => { cancelled = true; cleanup() }
  }, [pendingCallKitAction, incomingCall, pendingCallKitCallId, acceptCall, declineCall, setPendingCallKitAction, setPendingCallKitCallId])

  // Ringtone while incoming call is showing (not on iOS — CallKit plays its own ringtone)
  useEffect(() => {
    if (!incomingCall || activeCall) return
    if (Capacitor.getPlatform() === 'ios') return
    const stop = startRingtone()
    return stop
  }, [!!incomingCall, !!activeCall])

  const [showControls, setShowControls] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const revealControls = () => {
    setShowControls(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setShowControls(false), 3000)
  }

  // Auto-hide controls after 3s on mount
  useEffect(() => {
    hideTimerRef.current = setTimeout(() => setShowControls(false), 3000)
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
  }, [])

  // Attach streams to video elements whenever stream or element changes
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
      localVideoRef.current.play().catch(() => {})
    }
  }, [localStream, activeCall])

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
      remoteVideoRef.current.play().catch(() => {})
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream
      remoteAudioRef.current.play().catch(() => {})
    }
  }, [remoteStream, activeCall])

  // ── Incoming call screen ─────────────────────────────────────────────────
  if (incomingCall && !activeCall) {
    const callerName = incomingCall.callerAliasId || incomingCall.callerUserId
    const isIOS = Capacitor.getPlatform() === 'ios'

    // Show compact banner only on non-iOS when app is already in foreground.
    // On iOS we always use our own full-screen overlay (CallKit handles background/lock natively).
    if (!isIOS && incomingCallForeground) {
      return (
        <IncomingCallBanner
          callerName={callerName}
          callType={incomingCall.type}
          onAccept={() => acceptCall(incomingCall)}
          onDecline={() => declineCall(incomingCall.id)}
        />
      )
    }

    // Full-screen overlay
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-8 flex flex-col items-center gap-6 w-80">
          <div className="flex flex-col items-center gap-3">
            <AliasAvatar name={callerName} size="lg" />
            <div className="text-center">
              <p className="text-zinc-400 text-sm">Incoming {incomingCall.type === 'video' ? 'video' : 'voice'} call</p>
              <p className="text-white font-bold text-xl mt-1">{callerName.toUpperCase()}</p>
            </div>
          </div>

          {/* Ringing animation */}
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>

          <div className="flex gap-8">
            <div className="flex flex-col items-center gap-2">
              <RoundBtn danger onClick={(_e) => declineCall(incomingCall.id)} label="Decline">
                <PhoneOffIcon />
              </RoundBtn>
              <span className="text-xs text-zinc-500">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <RoundBtn onClick={(_e) => acceptCall(incomingCall)} label="Answer">
                <PhoneIcon />
              </RoundBtn>
              <span className="text-xs text-zinc-400">Answer</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!activeCall) return null

  const isVideo = activeCall.type === 'video'
  const isActive = activeCall.status === 'active'
  const isCaller = activeCall.callerUserId === user?.uid
  const otherName = isCaller
    ? (activeCall.calleeAliasId || activeCall.calleeUserId)
    : (activeCall.callerAliasId || activeCall.callerUserId)

  // ── Active call screen ───────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black z-50 select-none"
      onMouseMove={revealControls}
      onMouseEnter={revealControls}
      onClick={revealControls}
      onTouchStart={revealControls}
    >
      {/* Background: video or audio artwork — fills entire screen */}
      {isVideo ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-contain bg-black"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-800 to-zinc-950 flex flex-col items-center justify-center gap-5">
          <AliasAvatar name={otherName} size="lg" />
          <div className="text-center">
            <p className="text-white font-bold text-2xl tracking-wide">{otherName.toUpperCase()}</p>
            <p className="text-zinc-400 text-sm mt-2">
              {isActive
                ? <span className="tabular-nums font-mono">{timer}</span>
                : <span className="animate-pulse">Ringing...</span>
              }
            </p>
          </div>
        </div>
      )}

      {/* No remote stream placeholder (video only) */}
      {isVideo && !remoteStream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <AliasAvatar name={otherName} size="lg" />
          <p className="text-white font-bold text-xl">{otherName.toUpperCase()}</p>
          <p className="text-zinc-400 text-sm animate-pulse">Connecting...</p>
        </div>
      )}

      {/* Timer — top center, always visible */}
      {isActive && (
        <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
          <span className="bg-black/50 backdrop-blur-sm text-white text-sm px-4 py-1.5 rounded-full tabular-nums font-mono">
            {timer}
          </span>
        </div>
      )}

      {/* Local PiP — bottom right, always visible */}
      {isVideo && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-28 right-4 w-28 h-40 object-cover rounded-2xl border-2 border-white/20 bg-zinc-900 shadow-xl"
        />
      )}

      {/* Hidden audio element for remote stream (audio calls) */}
      {!isVideo && <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />}

      {/* Controls overlay — fade in/out */}
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col items-center pb-10 pt-16
          bg-gradient-to-t from-black/70 via-black/30 to-transparent
          transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <div className="flex items-end justify-center gap-8">
          <div className="flex flex-col items-center gap-2">
            <RoundBtn active={isMuted} onClick={(e) => { e.stopPropagation(); toggleMute(); revealControls() }} label={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted ? <MicOffIcon /> : <MicIcon />}
            </RoundBtn>
            <span className="text-xs text-white/70">{isMuted ? 'Muted' : 'Microphone'}</span>
          </div>

          {isVideo && (
            <div className="flex flex-col items-center gap-2">
              <RoundBtn active={isVideoOff} onClick={(e) => { e.stopPropagation(); toggleVideo(); revealControls() }} label={isVideoOff ? 'Turn on camera' : 'Turn off camera'}>
                {isVideoOff ? <VideoOffIcon /> : <VideoIcon />}
              </RoundBtn>
              <span className="text-xs text-white/70">{isVideoOff ? 'Camera Off' : 'Camera'}</span>
            </div>
          )}

          <div className="flex flex-col items-center gap-2">
            <RoundBtn danger onClick={(e) => { e.stopPropagation(); hangUp(activeCall.id) }} label="End call">
              <PhoneOffIcon />
            </RoundBtn>
            <span className="text-xs text-white/70">End</span>
          </div>
        </div>
      </div>
    </div>
  )
}
