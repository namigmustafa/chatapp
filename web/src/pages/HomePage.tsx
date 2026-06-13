import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import Sidebar from '@/components/layout/Sidebar'
import ChatWindow from '@/components/chat/ChatWindow'
import CallOverlay from '@/components/call/CallOverlay'
import InAppToast from '@/components/ui/InAppToast'
import { useAuthStore } from '@/store/authStore'
import { useIncomingCalls } from '@/hooks/useIncomingCalls'
import { usePresence } from '@/hooks/usePresence'
import { useUIStore } from '@/store/uiStore'
import { subscribeConversations } from '@/services/conversations'
import { playMessageSound } from '@/utils/notificationSound'
import type { Conversation } from '@/types'

export default function HomePage() {
  const { user } = useAuthStore()
  const [activeConv, setActiveConv] = useState<{
    id: string
    otherUserId: string
    otherAliasId: string
    myAliasId: string
  } | null>(null)
  const [mobileShowChat, setMobileShowChat] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])

  const [searchParams, setSearchParams] = useSearchParams()
  const { setActiveConvId, setToast } = useUIStore()
  // Tracks the last-seen lastMessage timestamp per conversation.
  // Used to detect newly arrived messages without relying on FCM foreground events.
  const lastMsgTsRef = useRef<Map<string, number>>(new Map())

  useIncomingCalls()
  usePresence()

  // Subscribe to conversations for pending navigation (notification tap)
  useEffect(() => {
    if (!user) return
    return subscribeConversations(user.uid, setConversations)
  }, [user])

  // Detect newly arrived messages via Firestore (reliable replacement for FCM
  // notificationReceived which is unreliable on iOS for notification messages).
  // Only fires for messages that arrive AFTER the first snapshot (prevTs > 0).
  useEffect(() => {
    if (!user) return
    const prev = lastMsgTsRef.current
    const next = new Map<string, number>()

    for (const conv of conversations) {
      const ts = (() => {
        const t = conv.lastMessage?.timestamp
        if (!t) return 0
        if (typeof t === 'number') return t
        if (typeof t === 'object' && 'toMillis' in (t as object))
          return (t as { toMillis: () => number }).toMillis()
        return 0
      })()

      const prevTs = prev.get(conv.id) ?? 0

      // New message from someone else in a non-active conversation
      if (
        prevTs > 0 &&
        ts > prevTs &&
        conv.lastMessage?.senderId !== user.uid &&
        conv.id !== useUIStore.getState().activeConvId
      ) {
        const myIdx = conv.participants.indexOf(user.uid)
        const otherIdx = myIdx === 0 ? 1 : 0
        const senderAlias = conv.participantAliases?.[otherIdx] ?? 'Unknown'
        const body =
          conv.lastMessage!.type === 'text'
            ? conv.lastMessage!.content
            : conv.lastMessage!.type === 'image' ? '📷 Photo'
            : conv.lastMessage!.type === 'video' ? '🎥 Video'
            : 'New message'
        playMessageSound()
        setToast({ id: `${conv.id}-${ts}`, title: `@${senderAlias}`, body, convId: conv.id })
      }

      next.set(conv.id, ts)
    }

    lastMsgTsRef.current = next
  }, [conversations, user])

  // When URL has ?conv=, immediately switch to main panel — no data needed.
  // Prevents the sidebar from showing while conversation data loads.
  useEffect(() => {
    if (searchParams.get('conv')) setMobileShowChat(true)
  }, [searchParams])

  // Handle notification-tap navigation: conv ID comes in via ?conv= URL param.
  // Always fetches directly from Firestore so we don't depend on the subscription
  // being loaded yet (cold-start, background→foreground, slow network).
  useEffect(() => {
    const convId = searchParams.get('conv')
    if (!convId || !user) return

    const open = (participants: string[], participantAliases: string[]) => {
      const otherUserId = participants.find((p) => p !== user.uid) ?? ''
      const myIdx = participants.indexOf(user.uid)
      const myAliasId = participantAliases[myIdx] ?? ''
      const otherAliasId = participantAliases[participants.indexOf(otherUserId)] ?? ''
      handleSelectConversation(convId, otherUserId, otherAliasId, myAliasId)
      setSearchParams({}, { replace: true })
    }

    // Check in-memory list first (instant, avoids a network round-trip)
    const cached = conversations.find((c) => c.id === convId)
    if (cached) {
      open(cached.participants, cached.participantAliases)
      return
    }

    // Not in cache yet — fetch directly. 'active' prevents a stale fetch from
    // navigating after the user has tapped a different notification.
    let active = true
    ;(async () => {
      try {
        const { doc: fsDoc, getDoc } = await import('firebase/firestore')
        const { db } = await import('@/services/firebase')
        const snap = await getDoc(fsDoc(db, 'conversations', convId))
        if (!active || !snap.exists()) return
        const d = snap.data() as { participants: string[]; participantAliases: string[] }
        open(d.participants, d.participantAliases)
      } catch {}
    })()

    return () => { active = false }
  }, [searchParams, conversations, user])

  const handleSelectConversation = (
    convId: string,
    otherUserId: string,
    otherAliasId: string,
    myAliasId: string
  ) => {
    setActiveConv({ id: convId, otherUserId, otherAliasId, myAliasId })
    setMobileShowChat(true)
    setActiveConvId(convId)
  }

  const handleBack = () => {
    setMobileShowChat(false)
    setActiveConvId(null)
  }

  const showSidebar = !mobileShowChat
  const showMain = mobileShowChat

  // On mobile sidebar view: pass null so ALL unread conversations show the dot
  // On mobile chat view or desktop: pass the active conv id
  const sidebarActiveConvId = mobileShowChat ? (activeConv?.id ?? null) : null

  return (
    <div className="flex h-[100dvh] w-full bg-zinc-950 overflow-hidden">
      <div
        className={`
          ${showSidebar ? 'flex' : 'hidden'} md:flex
          w-full md:w-96 flex-shrink-0
          bg-zinc-900 border-r border-zinc-800 flex-col
        `}
      >
        <Sidebar
          activeConvId={sidebarActiveConvId}
          conversations={conversations}
          onSelectConversation={handleSelectConversation}
        />
      </div>

      <main
        className={`
          ${showMain ? 'flex' : 'hidden'} md:flex
          flex-1 flex-col overflow-hidden
        `}
      >
        {activeConv ? (
          <ChatWindow
            key={activeConv.id}
            conversationId={activeConv.id}
            otherUserId={activeConv.otherUserId}
            otherAliasId={activeConv.otherAliasId}
            myAliasId={activeConv.myAliasId}
            isVisible={mobileShowChat}
            onBack={handleBack}
          />
        ) : searchParams.get('conv') ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-zinc-500 text-sm">Opening chat...</p>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center px-6">
              <p className="text-zinc-500 text-lg">Select a chat or start a new one</p>
              <p className="text-zinc-600 text-sm mt-2">Click the settings icon to manage your aliases</p>
            </div>
          </div>
        )}
      </main>

      <CallOverlay />
      <InAppToast onTap={(convId) => {
        const conv = conversations.find((c) => c.id === convId)
        if (!conv || !user) return
        const otherUserId = conv.participants.find((p) => p !== user.uid) ?? ''
        const myIdx = conv.participants.indexOf(user.uid)
        const myAliasId = conv.participantAliases[myIdx] ?? ''
        const otherAliasId = conv.participantAliases[conv.participants.indexOf(otherUserId)] ?? ''
        handleSelectConversation(convId, otherUserId, otherAliasId, myAliasId)
      }} />
    </div>
  )
}
