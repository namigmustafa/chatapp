import { useState, useEffect } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import ChatWindow from '@/components/chat/ChatWindow'
import CallOverlay from '@/components/call/CallOverlay'
import InAppToast from '@/components/ui/InAppToast'
import { useAuthStore } from '@/store/authStore'
import { useIncomingCalls } from '@/hooks/useIncomingCalls'
import { usePresence } from '@/hooks/usePresence'
import { useUIStore } from '@/store/uiStore'
import { subscribeConversations } from '@/services/conversations'
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

  const { pendingNavConvId, setPendingNavConvId, setActiveConvId } = useUIStore()

  useIncomingCalls()
  usePresence()

  // Subscribe to conversations for pending navigation (notification tap)
  useEffect(() => {
    if (!user) return
    return subscribeConversations(user.uid, setConversations)
  }, [user])

  // Handle pending navigation from notification tap
  useEffect(() => {
    if (!pendingNavConvId || !user) return

    const conv = conversations.find((c) => c.id === pendingNavConvId)
    if (conv) {
      const otherUserId = conv.participants.find((p) => p !== user.uid) ?? ''
      const myIdx = conv.participants.indexOf(user.uid)
      const myAliasId = conv.participantAliases[myIdx] ?? ''
      const otherAliasId = conv.participantAliases[conv.participants.indexOf(otherUserId)] ?? ''
      handleSelectConversation(pendingNavConvId, otherUserId, otherAliasId, myAliasId)
      setPendingNavConvId(null)
      return
    }

    // Conv not in loaded list yet — fetch directly (handles cold-start and slow subscriptions)
    const convId = pendingNavConvId
    ;(async () => {
      try {
        const { doc: fsDoc, getDoc } = await import('firebase/firestore')
        const { db } = await import('@/services/firebase')
        const snap = await getDoc(fsDoc(db, 'conversations', convId))
        if (!snap.exists()) return
        if (useUIStore.getState().pendingNavConvId !== convId) return
        const d = snap.data() as { participants: string[]; participantAliases: string[] }
        const otherUserId = d.participants.find((p) => p !== user.uid) ?? ''
        const myIdx = d.participants.indexOf(user.uid)
        const myAliasId = d.participantAliases[myIdx] ?? ''
        const otherAliasId = d.participantAliases[d.participants.indexOf(otherUserId)] ?? ''
        handleSelectConversation(convId, otherUserId, otherAliasId, myAliasId)
        setPendingNavConvId(null)
      } catch {}
    })()
  }, [pendingNavConvId, conversations, user])

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
