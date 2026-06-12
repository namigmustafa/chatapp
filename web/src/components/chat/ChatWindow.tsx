import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useSwipeBack } from '@/hooks/useSwipeBack'

const EmojiPicker = lazy(() => import('@emoji-mart/react'))
import { useAuthStore } from '@/store/authStore'
import { sendMessage, subscribeMessages, markMessageRead } from '@/services/messages'
import { setTyping, subscribeConversationTyping, markConversationRead } from '@/services/conversations'
import { subscribePresence } from '@/services/presence'
import type { Message } from '@/types'
import { playMessageSound } from '@/utils/notificationSound'
import { useWebRTC } from '@/hooks/useWebRTC'
import { subscribeAlias, getAliasStatus } from '@/services/aliases'
import type { Alias } from '@/types'
import AliasAvatar from '@/components/ui/AliasAvatar'
import MessageBubble from './MessageBubble'

interface Props {
  conversationId: string
  otherUserId: string
  otherAliasId: string
  myAliasId: string
  isVisible: boolean
  onBack?: () => void
}

export default function ChatWindow({
  conversationId,
  otherUserId,
  otherAliasId,
  myAliasId,
  isVisible,
  onBack,
}: Props) {
  const { user } = useAuthStore()
  const { startCall } = useWebRTC()
  useSwipeBack({ onBack: () => onBack?.(), enabled: !!onBack })
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [otherIsTyping, setOtherIsTyping] = useState(false)
  const [otherIsOnline, setOtherIsOnline] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [otherAlias, setOtherAlias] = useState<Alias | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const knownIdsRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (user && isVisible) markConversationRead(conversationId, user.uid)
    const unsub = subscribeMessages(conversationId, (msgs) => {
      if (knownIdsRef.current === null) {
        knownIdsRef.current = new Set(msgs.map((m) => m.id))
      } else {
        const hasNewIncoming = msgs.some(
          (m) => m.senderId !== user?.uid && !knownIdsRef.current!.has(m.id)
        )
        msgs.forEach((m) => knownIdsRef.current!.add(m.id))
        if (hasNewIncoming) playMessageSound()
      }
      setMessages(msgs)
      if (!isVisible) return
      const unread = msgs.filter(
        (m) => m.senderId !== user?.uid && m.status !== 'read'
      )
      if (unread.length > 0) {
        unread.forEach((m) => markMessageRead(m.id))
        if (user) markConversationRead(conversationId, user.uid)
      }
    })
    return unsub
  }, [conversationId, user?.uid, isVisible])

  useEffect(() => {
    const unsub = subscribeConversationTyping(conversationId, (typing) => {
      setOtherIsTyping(!!(otherUserId && typing[otherUserId]))
    })
    return unsub
  }, [conversationId, otherUserId])

  useEffect(() => {
    const unsub = subscribePresence(otherUserId, setOtherIsOnline)
    return unsub
  }, [otherUserId])

  useEffect(() => {
    const unsub = subscribeAlias(otherAliasId, setOtherAlias)
    return unsub
  }, [otherAliasId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, otherIsTyping])

  // Clear own typing flag on unmount
  useEffect(() => {
    return () => {
      if (user) setTyping(conversationId, user.uid, false)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [conversationId, user])

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setText(e.target.value)
      if (!user) return

      setTyping(conversationId, user.uid, true)

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => {
        setTyping(conversationId, user.uid, false)
      }, 3000)
    },
    [conversationId, user]
  )

  const aliasStatus = otherAlias && user ? getAliasStatus(otherAlias, user.uid) : null
  const canMessage = !aliasStatus || aliasStatus.reachable

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    const content = text.trim()
    if (!content || !user || !canMessage) return
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    setText('')
    setTyping(conversationId, user.uid, false)
    sendMessage(conversationId, user.uid, content).catch(console.error)
  }

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-3 border-b border-zinc-800 bg-zinc-900 flex-shrink-0" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))', paddingBottom: '0.625rem' }}>
        {onBack && (
          <button
            onClick={onBack}
            className="md:hidden text-zinc-400 hover:text-white p-1.5 -ml-1 rounded-full hover:bg-zinc-800 transition-colors flex-shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}

        <div className="relative flex-shrink-0">
          <AliasAvatar name={otherAliasId} size="sm" />
          <span
            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-900 transition-colors ${
              otherIsOnline ? 'bg-emerald-400' : 'bg-zinc-600'
            }`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-semibold text-white text-sm truncate">
              {myAliasId.toUpperCase()}
            </span>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="text-zinc-600 flex-shrink-0">
              <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="font-mono font-semibold text-white text-sm truncate">
              {otherAliasId.toUpperCase()}
            </span>
          </div>
          <p className="text-[11px] mt-0.5 leading-none">
            {otherIsTyping ? (
              <span className="text-indigo-400 animate-pulse">typing...</span>
            ) : otherIsOnline ? (
              <span className="text-emerald-500">online</span>
            ) : (
              <span className="text-zinc-600">offline</span>
            )}
          </p>
        </div>

        {(() => {
          const st = otherAlias && user ? getAliasStatus(otherAlias, user.uid) : null
          const canCall = !st || st.reachable
          return (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={() => canCall && startCall(myAliasId, otherAliasId, otherUserId, 'audio')}
                title={canCall ? 'Audio call' : 'Alias is currently unreachable'}
                disabled={!canCall}
                className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.77a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                </svg>
              </button>
              <button
                onClick={() => canCall && startCall(myAliasId, otherAliasId, otherUserId, 'video')}
                title={canCall ? 'Video call' : 'Alias is currently unreachable'}
                disabled={!canCall}
                className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7"/>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
              </button>
            </div>
          )
        })()}
      </div>


      <div
        className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1 min-h-0"
        style={{
          touchAction: 'pan-y',
          overscrollBehavior: 'contain',
          backgroundColor: '#0b141a',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Ccircle cx='40' cy='40' r='1.5' fill='rgba(255,255,255,0.03)'/%3E%3Ccircle cx='0' cy='0' r='1.5' fill='rgba(255,255,255,0.03)'/%3E%3Ccircle cx='80' cy='0' r='1.5' fill='rgba(255,255,255,0.03)'/%3E%3Ccircle cx='0' cy='80' r='1.5' fill='rgba(255,255,255,0.03)'/%3E%3Ccircle cx='80' cy='80' r='1.5' fill='rgba(255,255,255,0.03)'/%3E%3C/svg%3E")`,
        }}
      >
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={msg.senderId === user?.uid}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Emoji picker */}
      {showEmoji && (
        <div className="absolute bottom-16 left-2 z-20 shadow-2xl rounded-2xl overflow-hidden">
          <Suspense fallback={null}>
            <EmojiPicker
              data={async () => (await import('@emoji-mart/data')).default}
              theme="dark"
              locale="en"
              onEmojiSelect={(e: { native: string }) => {
                setText((prev) => prev + e.native)
                inputRef.current?.focus()
              }}
              previewPosition="none"
              skinTonePosition="none"
            />
          </Suspense>
        </div>
      )}

      {/* ── Reachability warning bubble ── */}
      {aliasStatus && !aliasStatus.reachable && (
        <div className="flex justify-center px-4 pt-3 pb-2 flex-shrink-0" style={{ backgroundColor: '#0b141a' }}>
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-900/50 border border-amber-700/30 w-full max-w-sm">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0 text-amber-400">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
            </svg>
            <div className="flex-1 flex flex-col gap-1 items-center text-center">
              {aliasStatus.reason === 'inactive' && (
                <>
                  <p className="text-[13px] font-semibold text-amber-300 leading-tight">@{otherAliasId} is inactive</p>
                  <p className="text-[11px] text-amber-500">Messages cannot be sent</p>
                </>
              )}
              {aliasStatus.reason === 'blocked' && (
                <>
                  <p className="text-[13px] font-semibold text-amber-300 leading-tight">@{otherAliasId} has blocked you</p>
                  <p className="text-[11px] text-amber-500">You cannot send messages to this alias</p>
                </>
              )}
              {aliasStatus.reason === 'schedule' && (() => {
                const info = 'scheduleInfo' in aliasStatus ? aliasStatus.scheduleInfo ?? '' : ''
                const [days, time] = info.split(' · ')
                return (
                  <>
                    <p className="text-[13px] font-semibold text-amber-300 leading-tight">@{otherAliasId} is not available right now</p>
                    {days && <p className="text-[11px] text-amber-400/80">{days}</p>}
                    {time && <p className="text-[11px] text-amber-500">Active hours: <span className="text-amber-300 font-medium">{time}</span></p>}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => { setShowEmoji(false); handleSend(e) }}
        className="flex items-center gap-1.5 px-3 py-2.5 border-t border-zinc-800 bg-zinc-900 flex-shrink-0"
        style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={() => setShowEmoji((v) => !v)}
          title="Emoji"
          className={`flex-shrink-0 p-2 rounded-full transition-colors ${showEmoji ? 'text-indigo-400 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/>
            <line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
        </button>

        <input
          ref={inputRef}
          className="flex-1 bg-zinc-800 rounded-full px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none border-none min-w-0 disabled:opacity-40 disabled:cursor-not-allowed"
          placeholder={canMessage ? 'Type a message...' : 'This alias is currently unreachable'}
          value={text}
          disabled={!canMessage}
          onChange={handleTextChange}
          onFocus={() => setShowEmoji(false)}
        />

        <button
          type="submit"
          disabled={!text.trim() || !canMessage}
          title="Send"
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </form>
    </div>
  )
}
