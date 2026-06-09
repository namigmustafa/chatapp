import { useState } from 'react'
import type { Alias } from '@/types'
import { Button } from '@/components/ui/Button'
import AliasAvatar from '@/components/ui/AliasAvatar'
import AliasScheduleEditor from './AliasScheduleEditor'

interface Props {
  alias: Alias
  onToggleActive: (id: string, current: boolean) => void
  onDelete: (id: string) => void
}

export default function AliasCard({ alias, onToggleActive, onDelete }: Props) {
  const [showSchedule, setShowSchedule] = useState(false)

  return (
    <div className={`bg-zinc-800/60 border rounded-2xl p-4 flex flex-col gap-4 transition-colors ${
      alias.isActive ? 'border-zinc-700' : 'border-zinc-800 opacity-60'
    }`}>
      <div className="flex items-center gap-4">
        <AliasAvatar name={alias.name} isActive={alias.isActive} size="lg" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-white text-xl tracking-wide">
              {alias.name.toUpperCase()}
            </span>
            <span className="text-zinc-500 text-sm font-mono">@{alias.name}</span>
            {alias.isActive ? (
              <span className="text-xs bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                Aktif
              </span>
            ) : (
              <span className="text-xs bg-zinc-700/50 text-zinc-400 px-2 py-0.5 rounded-full">
                Pasif
              </span>
            )}
            {alias.schedule.enabled && (
              <span className="text-xs bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded-full">
                Zamanlı
              </span>
            )}
          </div>
          {alias.blockedUsers.length > 0 && (
            <p className="text-xs text-zinc-500 mt-1">
              {alias.blockedUsers.length} kullanıcı engellendi
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant={alias.isActive ? 'secondary' : 'success'}
          onClick={() => onToggleActive(alias.id, alias.isActive)}
        >
          {alias.isActive ? 'Pasif Et' : 'Aktif Et'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowSchedule(!showSchedule)}
        >
          Zamanlama
        </Button>
        <Button size="sm" variant="danger" onClick={() => onDelete(alias.id)}>
          Sil
        </Button>
      </div>

      {showSchedule && (
        <AliasScheduleEditor alias={alias} onClose={() => setShowSchedule(false)} />
      )}
    </div>
  )
}
