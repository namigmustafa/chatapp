import { useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import ChatWindow from '@/components/chat/ChatWindow'
import CallOverlay from '@/components/call/CallOverlay'
import { useAuthStore } from '@/store/authStore'
import { useIncomingCalls } from '@/hooks/useIncomingCalls'
import { usePresence } from '@/hooks/usePresence'

export default function HomePage() {
  useAuthStore()
  const [activeConv, setActiveConv] = useState<{
    id: string
    otherUserId: string
    otherAliasId: string
    myAliasId: string
  } | null>(null)
  // Mobile: true = show chat panel, false = show sidebar
  const [mobileShowChat, setMobileShowChat] = useState(false)

  useIncomingCalls()
  usePresence()

  const handleSelectConversation = (
    convId: string,
    otherUserId: string,
    otherAliasId: string,
    myAliasId: string
  ) => {
    setActiveConv({ id: convId, otherUserId, otherAliasId, myAliasId })
    setMobileShowChat(true)
  }

  const handleBack = () => {
    setMobileShowChat(false)
  }

  const showSidebar = !mobileShowChat
  const showMain = mobileShowChat

  return (
    <div className="flex h-[100dvh] w-full bg-zinc-950 overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Sidebar — full screen on mobile, fixed width on desktop */}
      <div
        className={`
          ${showSidebar ? 'flex' : 'hidden'} md:flex
          w-full md:w-96 flex-shrink-0
          bg-zinc-900 border-r border-zinc-800 flex-col
        `}
      >
        <Sidebar
          activeConvId={activeConv?.id ?? null}
          onSelectConversation={handleSelectConversation}
        />
      </div>

      {/* Main panel — full screen on mobile, flex-1 on desktop */}
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
    </div>
  )
}
