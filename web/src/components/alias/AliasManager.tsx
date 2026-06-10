import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import {
  createAlias,
  getUserAliases,
  updateAliasActive,
  deleteAlias,
} from '@/services/aliases'
import type { Alias } from '@/types'
import AliasCard from './AliasCard'
import CreateAliasModal from './CreateAliasModal'

function EmptyState({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-500">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
      </div>
      <div>
        <p className="text-white font-medium">No aliases yet</p>
        <p className="text-zinc-500 text-sm mt-1">Create your first alias and be reachable anonymously.</p>
      </div>
      <button
        onClick={onOpen}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Create Alias
      </button>
    </div>
  )
}

export default function AliasManager() {
  const { user } = useAuthStore()
  const [aliases, setAliases] = useState<Alias[]>([])
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    if (!user) return
    getUserAliases(user.uid).then(setAliases)
  }, [user])

  const handleCreate = async (name: string, description: string) => {
    if (!user) return
    await createAlias(user.uid, name, description)
    const updated = await getUserAliases(user.uid)
    setAliases(updated)
  }

  const handleToggleActive = async (aliasId: string, current: boolean) => {
    await updateAliasActive(aliasId, !current)
    setAliases((prev) =>
      prev.map((a) => (a.id === aliasId ? { ...a, isActive: !current } : a))
    )
  }

  const handleScheduleUpdate = (aliasId: string, schedule: Alias['schedule']) => {
    setAliases((prev) =>
      prev.map((a) => (a.id === aliasId ? { ...a, schedule } : a))
    )
  }

  const handleDelete = async (aliasId: string) => {
    const alias = aliases.find((a) => a.id === aliasId)
    if (!confirm(`Delete alias "${alias?.name}"?`)) return
    await deleteAlias(aliasId)
    setAliases((prev) => prev.filter((a) => a.id !== aliasId))
  }

  const activeCount = aliases.filter((a) => a.isActive).length

  return (
    <>
      <div className="flex flex-col gap-6 p-6 max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">My Aliases</h2>
            <p className="text-sm text-zinc-400 mt-0.5">
              An identity independent of your email or phone number.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {aliases.length > 0 && (
              <div className="text-right">
                <span className="text-2xl font-bold text-white">{activeCount}</span>
                <p className="text-xs text-zinc-500 -mt-0.5">active</p>
              </div>
            )}
            <button
              onClick={() => setShowModal(true)}
              className="w-10 h-10 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors shadow-lg shadow-indigo-600/20"
              title="Create new alias"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex flex-col gap-3">
          {aliases.length === 0 ? (
            <EmptyState onOpen={() => setShowModal(true)} />
          ) : (
            aliases.map((alias) => (
              <AliasCard
                key={alias.id}
                alias={alias}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
                onScheduleUpdate={(schedule) => handleScheduleUpdate(alias.id, schedule)}
              />
            ))
          )}
        </div>
      </div>

      {showModal && (
        <CreateAliasModal
          onClose={() => setShowModal(false)}
          onCreate={handleCreate}
        />
      )}
    </>
  )
}
