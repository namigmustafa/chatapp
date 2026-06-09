import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import {
  createAlias,
  getUserAliases,
  updateAliasActive,
  deleteAlias,
} from '@/services/aliases'
import type { Alias } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import AliasCard from './AliasCard'

export default function AliasManager() {
  const { user } = useAuthStore()
  const [aliases, setAliases] = useState<Alias[]>([])
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    getUserAliases(user.uid).then(setAliases)
  }, [user])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newName.trim()) return
    setError('')
    setLoading(true)
    try {
      await createAlias(user.uid, newName.trim())
      const updated = await getUserAliases(user.uid)
      setAliases(updated)
      setNewName('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleActive = async (aliasId: string, current: boolean) => {
    await updateAliasActive(aliasId, !current)
    setAliases((prev) =>
      prev.map((a) => (a.id === aliasId ? { ...a, isActive: !current } : a))
    )
  }

  const handleDelete = async (aliasId: string) => {
    if (!confirm(`"${aliasId}" aliasını silmek istiyor musun?`)) return
    await deleteAlias(aliasId)
    setAliases((prev) => prev.filter((a) => a.id !== aliasId))
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Alias'larım</h2>
        <p className="text-sm text-zinc-400">
          Alias'ların ile başkaları seni bulabilir. E-posta veya telefon
          numarandan bağımsız.
        </p>
      </div>

      <form onSubmit={handleCreate} className="flex gap-2">
        <Input
          placeholder="Yeni alias (örn: NAM)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !newName.trim()}>
          {loading ? '...' : 'Oluştur'}
        </Button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-col gap-3">
        {aliases.length === 0 && (
          <p className="text-zinc-500 text-sm text-center py-8">
            Henüz alias yok. Yukarıdan oluştur.
          </p>
        )}
        {aliases.map((alias) => (
          <AliasCard
            key={alias.id}
            alias={alias}
            onToggleActive={handleToggleActive}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  )
}
