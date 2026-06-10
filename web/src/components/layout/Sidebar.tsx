import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { subscribeConversations } from '@/services/conversations'
import { getConversationText } from '@/services/messages'
import { getUserAliases } from '@/services/aliases'
import { signOut } from '@/services/auth'
import { subscribePresence } from '@/services/presence'
import type { Conversation, Alias } from '@/types'
import AliasAvatar from '@/components/ui/AliasAvatar'
import NewChatModal from '@/components/chat/NewChatModal'
import { formatDistanceToNow } from 'date-fns'
import { enUS } from 'date-fns/locale'

interface Props {
  activeConvId: string | null
  onSelectConversation: (convId: string, otherUserId: string, otherAliasId: string, myAliasId: string) => void
}

export default function Sidebar({ activeConvId, onSelectConversation }: Props) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [myAliases, setMyAliases] = useState<Alias[]>([])
  const [showNewChat, setShowNewChat] = useState(false)
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [msgIndex, setMsgIndex] = useState<Map<string, string>>(new Map())
  const menuRef = useRef<HTMLDivElement>(null)
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Build message index for full-text search with 400ms debounce
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    const q = search.trim()
    if (q.length < 2) { setMsgIndex(new Map()); return }
    searchDebounce.current = setTimeout(async () => {
      const entries = await Promise.all(
        conversations.map(async (conv) => {
          const text = await getConversationText(conv.id)
          return [conv.id, text] as const
        })
      )
      setMsgIndex(new Map(entries))
    }, 400)
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current) }
  }, [search, conversations])

  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const primaryAlias = myAliases[0]

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((conv) =>
      conv.participantAliases.some((a) => a.toLowerCase().includes(q)) ||
      (conv.lastMessage?.type === 'text' && conv.lastMessage.content.toLowerCase().includes(q)) ||
      (msgIndex.get(conv.id) ?? '').includes(q)
    )
  }, [search, conversations, msgIndex])

  const initials = (user?.displayName ?? user?.email ?? '?')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-zinc-900">

      {/* ── Header ── */}
      <div
        className="px-4 py-3 flex items-center gap-3 border-b border-zinc-800/60 flex-shrink-0"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <button
          onClick={() => navigate('/settings')}
          className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 select-none hover:opacity-90 transition-opacity overflow-hidden"
        >
          {user?.photoURL
            ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
            : initials}
        </button>

        <span className="flex-1 text-white font-semibold text-[15px] select-none">Chatapp</span>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setShowNewChat(true)}
            disabled={!primaryAlias}
            title="New chat"
            className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
          </button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu((v) => !v)}
              title="Menu"
              className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/>
              </svg>
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-zinc-800 border border-zinc-700/60 rounded-xl shadow-2xl z-50 overflow-hidden py-1">
                <button
                  onClick={() => { navigate('/settings'); setShowMenu(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-700/60 transition-colors text-left"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
                  </svg>
                  Settings
                </button>
                <div className="mx-3 my-1 border-t border-zinc-700/50" />
                <button
                  onClick={async () => { setShowMenu(false); await signOut(user?.uid) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-zinc-700/60 transition-colors text-left"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-3 py-2 flex-shrink-0">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or start new chat"
            className="w-full bg-zinc-800 rounded-full pl-9 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none border-none"
          />
        </div>
      </div>

      {search.trim() && (
        <div className="px-5 pb-1 text-[11px] text-zinc-500">
          {filteredConversations.length} result{filteredConversations.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* ── Conversation list ── */}
      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        {filteredConversations.length === 0 && (
          <p className="text-zinc-500 text-sm text-center px-6 py-10">
            {search.trim() ? 'No results found' : 'No chats yet.'}
          </p>
        )}

        {filteredConversations.map((conv) => {
          const otherUserId = conv.participants.find((p) => p !== user?.uid) ?? ''
          const myIdx = conv.participants.indexOf(user?.uid ?? '')
          const myAliasId = conv.participantAliases[myIdx] ?? ''
          const otherAliasId =
            conv.participantAliases[conv.participants.indexOf(otherUserId)] ?? otherUserId

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
              className={`w-full flex items-center gap-3 px-3 py-2.5 mx-2 mb-0.5 text-left transition-colors rounded-2xl ${
                activeConvId === conv.id
                  ? 'bg-[#2a3942]'
                  : 'hover:bg-zinc-800/50'
              }`}
              style={{ width: 'calc(100% - 1rem)' }}
            >
              <div className="relative flex-shrink-0">
                <AliasAvatar name={otherAliasId} size="md" />
                {onlineMap[otherUserId] && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-zinc-900" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-semibold text-[13px] truncate ${hasUnread ? 'text-white' : 'text-zinc-100'}`}>
                    {otherAliasId.toUpperCase()}
                  </span>
                  {conv.lastMessage?.timestamp && (
                    <span className={`text-[11px] flex-shrink-0 ${hasUnread ? 'text-indigo-400 font-medium' : 'text-zinc-500'}`}>
                      {formatDistanceToNow(
                        typeof conv.lastMessage.timestamp === 'object' &&
                        'toDate' in conv.lastMessage.timestamp
                          ? (conv.lastMessage.timestamp as { toDate: () => Date }).toDate()
                          : new Date(conv.lastMessage.timestamp as number),
                        { addSuffix: false, locale: enUS }
                      )}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className={`text-xs truncate ${hasUnread ? 'text-zinc-300' : 'text-zinc-500'}`}>
                    {conv.lastMessage
                      ? conv.lastMessage.type === 'text'
                        ? conv.lastMessage.content
                        : '📞 Call'
                      : myAliasId
                      ? `@${myAliasId} → @${otherAliasId}`
                      : ''}
                  </p>
                  {hasUnread && (
                    <span className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
                      <span className="w-2 h-2 rounded-full bg-white" />
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
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
