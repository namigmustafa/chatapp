import { useState } from 'react'
import type { Alias } from '@/types'
import AliasAvatar from '@/components/ui/AliasAvatar'
import AliasScheduleEditor from './AliasScheduleEditor'

interface Props {
  alias: Alias
  onToggleActive: (id: string, current: boolean) => void
  onDelete: (id: string) => void
  onScheduleUpdate?: (schedule: Alias['schedule']) => void
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-emerald-500' : 'bg-zinc-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function CalendarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
    </svg>
  )
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function AliasCard({ alias, onToggleActive, onDelete, onScheduleUpdate }: Props) {
  const [showSchedule, setShowSchedule] = useState(false)

  const activeDays = alias.schedule.enabled
    ? alias.schedule.days.map((d) => DAYS[d]).join(', ')
    : null

  return (
    <div className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
      alias.isActive
        ? 'bg-zinc-800/70 border-zinc-700'
        : 'bg-zinc-900/50 border-zinc-800 opacity-60'
    }`}>
      {/* Main row */}
      <div className="flex items-center gap-4 p-4">
        <AliasAvatar name={alias.name} isActive={alias.isActive} size="lg" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-white text-lg tracking-wide leading-tight">
              {alias.name.toUpperCase()}
            </span>
            <span className="text-zinc-500 text-sm font-mono">@{alias.name}</span>
          </div>

          {alias.description && (
            <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{alias.description}</p>
          )}

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {alias.schedule.enabled && activeDays && (
              <span className="inline-flex items-center gap-1 text-xs text-indigo-300 bg-indigo-950/60 border border-indigo-800/50 px-2 py-0.5 rounded-full">
                <CalendarIcon />
                {alias.schedule.startTime}–{alias.schedule.endTime}
              </span>
            )}
            {alias.blockedUsers.length > 0 && (
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
                {alias.blockedUsers.length} blocked
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowSchedule((v) => !v)}
            className={`p-2 rounded-lg transition-colors ${
              showSchedule
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
            }`}
            title="Schedule"
          >
            <CalendarIcon />
          </button>
          <button
            type="button"
            onClick={() => onDelete(alias.id)}
            className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-950/40 transition-colors"
            title="Delete"
          >
            <TrashIcon />
          </button>
          <ToggleSwitch
            checked={alias.isActive}
            onChange={() => onToggleActive(alias.id, alias.isActive)}
          />
        </div>
      </div>

      {showSchedule && (
        <AliasScheduleEditor
          alias={alias}
          onClose={() => setShowSchedule(false)}
          onSaved={(schedule) => onScheduleUpdate?.(schedule)}
        />
      )}
    </div>
  )
}
