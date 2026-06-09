import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'

const EmojiPicker = lazy(() => import('@emoji-mart/react'))
import { useAuthStore } from '@/store/authStore'
import { sendMessage, subscribeMessages, markMessageRead } from '@/services/messages'
import { useFileTransfer } from '@/hooks/useFileTransfer'
import { useFileStore } from '@/store/fileStore'
import { setTyping, subscribeConversationTyping, markConversationRead } from '@/services/conversations'
import { subscribePresence } from '@/services/presence'
import type { Message } from '@/types'
import { playMessageSound } from '@/utils/notificationSound'
import { useWebRTC } from '@/hooks/useWebRTC'
import { Button } from '@/components/ui/Button'
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
  const { sendFile } = useFileTransfer()
  const fileProgress = useFileStore((s) => s.progress)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [otherIsTyping, setOtherIsTyping] = useState(false)
  const [otherIsOnline, setOtherIsOnline] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const knownIdsRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (user && isVisible) markConversationRead(conversationId, user.uid)
    const unsub = subscribeMessages(conversationId, (msgs) => {
      if (knownIdsRef.current === null) {
        // First load — populate known IDs, no sound
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

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    e.target.value = ''
    sendFile(conversationId, otherUserId, file).catch(console.error)
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || !user) return
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    setTyping(conversationId, user.uid, false)
    await sendMessage(conversationId, user.uid, text.trim())
    setText('')
  }

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-800 bg-zinc-900 flex-shrink-0">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden text-zinc-400 hover:text-white p-1 -ml-1 flex-shrink-0"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          <div className="flex items-center gap-2">
          <div className="relative">
            <AliasAvatar name={otherAliasId} size="sm" />
            <span
              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-zinc-900 transition-colors ${
                otherIsOnline ? 'bg-emerald-400' : 'bg-zinc-600'
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-white tracking-wide text-sm">
                {myAliasId.toUpperCase()}
              </span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-zinc-500 flex-shrink-0">
                <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="font-mono font-bold text-white tracking-wide text-sm">
                {otherAliasId.toUpperCase()}
              </span>
            </div>
            <p className="text-xs mt-0.5">
              {otherIsTyping ? (
                <span className="text-indigo-400 animate-pulse">yazıyor...</span>
              ) : otherIsOnline ? (
                <span className="text-emerald-500">çevrimiçi</span>
              ) : (
                <span className="text-zinc-500">çevrimdışı</span>
              )}
            </p>
          </div>
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => startCall(myAliasId, otherAliasId, otherUserId, 'audio')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.77a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
            </svg>
            <span className="hidden sm:inline ml-1">Sesli</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => startCall(myAliasId, otherAliasId, otherUserId, 'video')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"/>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
            <span className="hidden sm:inline ml-1">Video</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 min-h-0">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={msg.senderId === user?.uid}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {Object.values(fileProgress).length > 0 && (
        <div className="px-4 py-2 bg-zinc-900 border-t border-zinc-800 flex-shrink-0">
          {Object.entries(fileProgress).map(([tid, pct]) => (
            <div key={tid} className="flex items-center gap-3">
              <div className="flex-1 bg-zinc-700 rounded-full h-1.5">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-zinc-400 flex-shrink-0">{pct}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <div className="absolute bottom-20 left-2 z-20 shadow-2xl rounded-2xl overflow-hidden">
          <Suspense fallback={null}>
            <EmojiPicker
              data={async () => (await import('@emoji-mart/data')).default}
              theme="dark"
              locale="tr"
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

      <form
        onSubmit={(e) => { setShowEmoji(false); handleSend(e) }}
        className="flex gap-2 p-3 border-t border-zinc-800 bg-zinc-900 flex-shrink-0"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
          onChange={handleFile}
        />

        {/* Paperclip button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={Object.keys(fileProgress).length > 0}
          className="flex-shrink-0 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>

        {/* Emoji button */}
        <button
          type="button"
          onClick={() => setShowEmoji((v) => !v)}
          className={`flex-shrink-0 p-2 rounded-xl transition-colors ${showEmoji ? 'text-indigo-400 bg-zinc-800' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
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
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
          placeholder="Mesaj yaz..."
          value={text}
          onChange={handleTextChange}
          onFocus={() => setShowEmoji(false)}
        />
        <Button type="submit" disabled={!text.trim()}>
          Gönder
        </Button>
      </form>
    </div>
  )
}
