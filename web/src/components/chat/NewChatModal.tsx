import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { searchAliases, getAliasStatus } from '@/services/aliases'
import { getOrCreateConversation } from '@/services/conversations'
import type { Alias } from '@/types'
import AliasAvatar from '@/components/ui/AliasAvatar'

interface Props {
  myAliasId: string
  onConversationReady: (convId: string, otherUserId: string, otherAliasId: string, myAliasId: string) => void
  onClose: () => void
}

function StatusBadge({ alias, callerUid }: { alias: Alias; callerUid: string }) {
  const status = getAliasStatus(alias, callerUid)
  if (status.reachable) return null
  if (status.reason === 'inactive') {
    return <span className="text-[11px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">Inactive</span>
  }
  if (status.reason === 'blocked') {
    return <span className="text-[11px] text-red-400 bg-red-950/40 px-2 py-0.5 rounded-full">Blocked</span>
  }
  // schedule
  const [days, time] = (status.scheduleInfo ?? '').split(' · ')
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-950/50 border border-amber-800/40 px-2 py-0.5 rounded-full">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
        </svg>
        {time ?? 'Outside schedule'}
      </span>
      {days && <span className="text-[10px] text-amber-500/70">{days}</span>}
    </div>
  )
}

export default function NewChatModal({ myAliasId, onConversationReady, onClose }: Props) {
  const { user } = useAuthStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Alias[]>([])
  const [loading, setLoading] = useState(false)
  const [errorStatus, setErrorStatus] = useState<{ reason: string; aliasName: string; scheduleInfo?: string } | null>(null)

  // Refresh statuses every 30s so schedule changes are reflected without re-search
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!results.length) return
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [results.length])

  const handleSearch = async (val: string) => {
    setQuery(val)
    setErrorStatus(null)
    if (val.trim().length < 1) { setResults([]); return }
    setLoading(true)
    const found = await searchAliases(val.trim())
    setResults(found.filter((a) => a.userId !== user?.uid && a.id !== myAliasId))
    setLoading(false)
  }

  const handleSelect = async (alias: Alias) => {
    if (!user) return
    try {
      const status = getAliasStatus(alias, user.uid)
      if (!status.reachable) {
        setErrorStatus({
          reason: status.reason,
          aliasName: alias.id,
          scheduleInfo: 'scheduleInfo' in status ? status.scheduleInfo : undefined,
        })
        return
      }
      setErrorStatus(null)
      const convId = await getOrCreateConversation(user.uid, myAliasId, alias.userId, alias.id)
      onConversationReady(convId, alias.userId, alias.id, myAliasId)
      onClose()
    } catch (err) {
      console.error('[NewChat] handleSelect failed:', err)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 p-4 pt-20 sm:pt-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-800">
          <h3 className="font-semibold text-white text-sm">New Chat</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 p-1 rounded-lg hover:bg-zinc-800 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 py-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search alias... (e.g. nam)"
              className="w-full bg-zinc-800 rounded-full pl-9 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none border-none"
            />
          </div>
          {errorStatus && (
            <div className="flex items-center gap-3 mt-2 px-4 py-3 rounded-2xl bg-amber-900/50 border border-amber-700/30">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0 text-amber-400">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
              <div className="flex-1 flex flex-col gap-1 items-center text-center">
                {errorStatus.reason === 'inactive' && (
                  <>
                    <p className="text-[13px] font-semibold text-amber-300 leading-tight">@{errorStatus.aliasName} is inactive</p>
                    <p className="text-[11px] text-amber-500">Messages cannot be sent</p>
                  </>
                )}
                {errorStatus.reason === 'blocked' && (
                  <>
                    <p className="text-[13px] font-semibold text-amber-300 leading-tight">@{errorStatus.aliasName} has blocked you</p>
                    <p className="text-[11px] text-amber-500">You cannot send messages to this alias</p>
                  </>
                )}
                {errorStatus.reason === 'schedule' && (() => {
                  const [days, time] = (errorStatus.scheduleInfo ?? '').split(' · ')
                  return (
                    <>
                      <p className="text-[13px] font-semibold text-amber-300 leading-tight">@{errorStatus.aliasName} is not available right now</p>
                      {days && <p className="text-[11px] text-amber-400/80">{days}</p>}
                      {time && <p className="text-[11px] text-amber-500">Active hours: <span className="text-amber-300 font-medium">{time}</span></p>}
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex flex-col max-h-64 overflow-y-auto pb-2">
          {loading && (
            <p className="text-sm text-zinc-500 text-center py-6">Searching...</p>
          )}
          {!loading && results.length === 0 && query.trim() && (
            <p className="text-sm text-zinc-500 text-center py-6">No results found</p>
          )}
          {results.map((alias) => {
            const status = user ? getAliasStatus(alias, user.uid) : null
            const reachable = status?.reachable ?? false
            return (
              <button
                key={alias.id + tick}
                onClick={() => handleSelect(alias)}
                className={`flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  reachable ? 'hover:bg-zinc-800/70' : 'hover:bg-zinc-800/40 opacity-70'
                }`}
              >
                <AliasAvatar name={alias.name} isActive={alias.isActive} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-bold text-white text-sm tracking-wide">
                    {alias.name.toUpperCase()}
                  </p>
                  {alias.description && (
                    <p className="text-xs text-zinc-500 truncate mt-0.5">{alias.description}</p>
                  )}
                </div>
                {status && user && <StatusBadge alias={alias} callerUid={user.uid} />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
