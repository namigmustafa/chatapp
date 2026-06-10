import { useState, useEffect } from 'react'
import type { Alias, AliasSchedule } from '@/types'
import { updateAliasSchedule } from '@/services/aliases'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface Props {
  alias: Alias
  onClose: () => void
  onSaved?: (schedule: AliasSchedule) => void
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
        checked ? 'bg-indigo-500' : 'bg-zinc-600'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

export default function AliasScheduleEditor({ alias, onClose, onSaved }: Props) {
  const [schedule, setSchedule] = useState<AliasSchedule>({ ...alias.schedule })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSchedule({ ...alias.schedule })
  }, [alias.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggleDay = (day: number) => {
    setSchedule((s) => ({
      ...s,
      days: s.days.includes(day) ? s.days.filter((d) => d !== day) : [...s.days, day].sort(),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    await updateAliasSchedule(alias.id, schedule)
    setSaving(false)
    onSaved?.(schedule)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-800">
          <div>
            <h2 className="text-white font-semibold text-sm">Schedule</h2>
            <p className="text-zinc-500 text-xs mt-0.5">@{alias.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300 p-1 rounded-lg hover:bg-zinc-800 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Enable schedule</p>
              <p className="text-xs text-zinc-500 mt-0.5">Be available only at specific hours</p>
            </div>
            <ToggleSwitch checked={schedule.enabled} onChange={() => setSchedule((s) => ({ ...s, enabled: !s.enabled }))} />
          </div>

          {schedule.enabled && (
            <>
              {/* Time range */}
              <div className="flex gap-3">
                <div className="flex-1 flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-400">From</label>
                  <input
                    type="time"
                    value={schedule.startTime}
                    onChange={(e) => setSchedule((s) => ({ ...s, startTime: e.target.value }))}
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-400">Until</label>
                  <input
                    type="time"
                    value={schedule.endTime}
                    onChange={(e) => setSchedule((s) => ({ ...s, endTime: e.target.value }))}
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              {/* Days */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-zinc-400">Active days</label>
                <div className="flex gap-1.5">
                  {DAYS.map((day, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
                        schedule.days.includes(i) ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="flex-1 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl transition-colors">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
