import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { subscribeConversations } from '@/services/conversations'
import { getUserAliases } from '@/services/aliases'
import { signOut } from '@/services/auth'
import { subscribePresence } from '@/services/presence'
import type { Conversation, Alias } from '@/types'
import AliasAvatar from '@/components/ui/AliasAvatar'
import NewChatModal from '@/components/chat/NewChatModal'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'

interface Props {
  activeConvId: string | null
  onSelectConversation: (convId: string, otherUserId: string, otherAliasId: string, myAliasId: string) => void
}

function IconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex flex-col items-center gap-1 text-zinc-400 hover:text-white transition-colors p-2 rounded-xl hover:bg-zinc-800"
    >
      {children}
    </button>
  )
}

export default function Sidebar({ activeConvId, onSelectConversation }: Props) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [myAliases, setMyAliases] = useState<Alias[]>([])
  const [showNewChat, setShowNewChat] = useState(false)
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!user) return
    const unsub = subscribeConversations(user.uid, setConversations)
    getUserAliases(user.uid).then(setMyAliases)
    return unsub
  }, [user])

  useEffect(() => {
    const otherUserIds = conversations
      .map((c) => c.participants.find((p) => p !== user?.uid))
      .filter((id): id is string => !!id)
    const unsubs = otherUserIds.map((uid) =>
      subscribePresence(uid, (online) =>
        setOnlineMap((prev) => ({ ...prev, [uid]: online }))
      )
    )
    return () => unsubs.forEach((u) => u())
  }, [conversations, user?.uid])

  const primaryAlias = myAliases[0]

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Top header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 select-none">
            {(user?.displayName ?? user?.email ?? '?')
              .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <p className="text-white font-semibold truncate text-sm">
            {user?.displayName ?? user?.email}
          </p>
        </div>
        <button
          onClick={() => setShowNewChat(true)}
          disabled={!primaryAlias}
          title="Yeni sohbet"
          className="flex-shrink-0 text-zinc-400 hover:text-white disabled:opacity-30 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            <circle cx="18" cy="3" r="2" fill="currentColor" stroke="none"/>
          </svg>
        </button>
      </div>

      {/* ── Conversation list ── */}
      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        {conversations.length === 0 && (
          <p className="text-zinc-500 text-sm text-center p-6">Henüz sohbet yok.</p>
        )}
        {conversations.map((conv) => {
          const otherUserId = conv.participants.find((p) => p !== user?.uid) ?? ''
          const myIdx = conv.participants.indexOf(user?.uid ?? '')
          const myAliasId = conv.participantAliases[myIdx] ?? ''
          const otherAliasId = conv.participantAliases[conv.participants.indexOf(otherUserId)] ?? otherUserId

          const lastReadAt = conv.lastReadAt?.[user?.uid ?? ''] ?? 0
          const lastMsgTs = (() => {
            const ts = conv.lastMessage?.timestamp
            if (!ts) return 0
            if (typeof ts === 'number') return ts
            if (typeof ts === 'object' && 'toMillis' in (ts as object))
              return (ts as { toMillis: () => number }).toMillis()
            return 0
          })()
          const hasUnread =
            conv.id !== activeConvId &&
            !!conv.lastMessage &&
            conv.lastMessage.senderId !== user?.uid &&
            lastMsgTs > lastReadAt

          return (
            <button
              key={conv.id}
              onClick={() => onSelectConversation(conv.id, otherUserId, otherAliasId, myAliasId)}
              className={`w-full px-3 py-3 flex items-center gap-3 text-left transition-colors ${
                activeConvId === conv.id ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
              }`}
            >
              <div className="relative flex-shrink-0">
                <AliasAvatar name={otherAliasId} size="md" />
                {onlineMap[otherUserId] && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-zinc-900" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-semibold text-sm truncate ${hasUnread ? 'text-white' : 'text-zinc-200'}`}>
                    {otherAliasId.toUpperCase()}
                  </span>
                  {conv.lastMessage?.timestamp && (
                    <span className="text-xs text-zinc-500 flex-shrink-0">
                      {formatDistanceToNow(
                        typeof conv.lastMessage.timestamp === 'object' && 'toDate' in conv.lastMessage.timestamp
                          ? (conv.lastMessage.timestamp as { toDate: () => Date }).toDate()
                          : new Date(conv.lastMessage.timestamp),
                        { addSuffix: false, locale: tr }
                      )}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className={`text-xs truncate ${hasUnread ? 'text-zinc-300 font-medium' : 'text-zinc-500'}`}>
                    {conv.lastMessage
                      ? conv.lastMessage.type === 'text'
                        ? conv.lastMessage.content
                        : 'Arama'
                      : myAliasId ? `@${myAliasId} → @${otherAliasId}` : ''}
                  </p>
                  {hasUnread && (
                    <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Bottom navigation ── */}
      <div className="border-t border-zinc-800 px-4 py-2 flex items-center justify-around">
        <IconBtn onClick={() => {}} title="Sohbetler">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/>
          </svg>
          <span className="text-[10px]">Sohbetler</span>
        </IconBtn>

        <IconBtn onClick={() => navigate('/settings')} title="Ayarlar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
          <span className="text-[10px]">Ayarlar</span>
        </IconBtn>

        <IconBtn onClick={() => signOut(user?.uid)} title="Çıkış">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span className="text-[10px]">Çıkış</span>
        </IconBtn>
      </div>

      {showNewChat && primaryAlias && (
        <NewChatModal
          myAliasId={primaryAlias.id}
          onConversationReady={onSelectConversation}
          onClose={() => setShowNewChat(false)}
        />
      )}
    </div>
  )
}
