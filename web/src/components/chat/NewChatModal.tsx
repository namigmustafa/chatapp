import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { searchAliases, isAliasReachable } from '@/services/aliases'
import { getOrCreateConversation } from '@/services/conversations'
import type { Alias } from '@/types'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import AliasAvatar from '@/components/ui/AliasAvatar'

interface Props {
  myAliasId: string
  onConversationReady: (convId: string, otherUserId: string, otherAliasId: string, myAliasId: string) => void
  onClose: () => void
}

export default function NewChatModal({ myAliasId, onConversationReady, onClose }: Props) {
  const { user } = useAuthStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Alias[]>([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async (val: string) => {
    setQuery(val)
    if (val.trim().length < 1) {
      setResults([])
      return
    }
    setLoading(true)
    const found = await searchAliases(val.trim())
    setResults(found.filter((a) => a.userId !== user?.uid && a.id !== myAliasId))
    setLoading(false)
  }

  const handleSelect = async (alias: Alias) => {
    if (!user) return
    const reachable = isAliasReachable(alias, user.uid)
    if (!reachable) {
      alert(`@${alias.name} şu an ulaşılamaz durumda.`)
      return
    }
    const convId = await getOrCreateConversation(
      user.uid,
      myAliasId,
      alias.userId,
      alias.id
    )
    onConversationReady(convId, alias.userId, alias.id, myAliasId)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">Yeni Sohbet</h3>
          <Button size="icon" variant="ghost" onClick={onClose}>✕</Button>
        </div>

        <Input
          placeholder="Alias ara... (örn: nam)"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          autoFocus
        />

        <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
          {loading && (
            <p className="text-sm text-zinc-500 text-center py-4">Aranıyor...</p>
          )}
          {!loading && results.length === 0 && query.trim() && (
            <p className="text-sm text-zinc-500 text-center py-4">Sonuç bulunamadı</p>
          )}
          {results.map((alias) => (
            <button
              key={alias.id}
              onClick={() => handleSelect(alias)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-800 text-left transition-colors"
            >
              <AliasAvatar name={alias.name} isActive={alias.isActive} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-mono font-bold text-white text-sm tracking-wide">
                  {alias.name.toUpperCase()}
                </p>
                <p className="text-xs text-zinc-500">@{alias.name}</p>
              </div>
              {!alias.isActive && (
                <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">Pasif</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
