import AliasAvatar from '@/components/ui/AliasAvatar'

function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.77a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
    </svg>
  )
}

function PhoneOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c.907.34 1.85.573 2.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.42 19.42 0 01-3.33-2.67m-2.67-3.34a19.79 19.79 0 01-3.07-8.63A2 2 0 014.11 2h3a2 2 0 011.72 1.54c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.91 9.6"/>
      <line x1="23" y1="1" x2="1" y2="23"/>
    </svg>
  )
}

interface Props {
  callerName: string
  callType: 'audio' | 'video'
  onAccept: () => void
  onDecline: () => void
}

export default function IncomingCallBanner({ callerName, callType, onAccept, onDecline }: Props) {
  return (
    <div
      className="fixed left-0 right-0 z-[100] flex justify-center pointer-events-none"
      style={{ top: 'env(safe-area-inset-top)' }}
    >
      <div
        className="mx-3 mt-2 w-full max-w-sm bg-zinc-800/95 backdrop-blur-sm border border-zinc-600/50 rounded-2xl px-3 py-2.5 flex items-center gap-3 shadow-2xl pointer-events-auto"
        style={{ animation: 'slideDownBanner 0.35s cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        <div className="relative flex-shrink-0">
          <AliasAvatar name={callerName} size="sm" />
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-zinc-800 animate-pulse" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">{callerName.toUpperCase()}</p>
          <p className="text-zinc-400 text-xs">
            Incoming {callType === 'video' ? 'video' : 'voice'} call
          </p>
        </div>

        <button
          onClick={onDecline}
          aria-label="Decline"
          className="w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-colors flex-shrink-0"
        >
          <PhoneOffIcon />
        </button>
        <button
          onClick={onAccept}
          aria-label="Accept"
          className="w-9 h-9 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center text-white transition-colors flex-shrink-0"
        >
          <PhoneIcon />
        </button>
      </div>
    </div>
  )
}
