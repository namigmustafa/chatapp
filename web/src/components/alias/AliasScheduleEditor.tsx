import { useState } from 'react'
import type { Alias, AliasSchedule } from '@/types'
import { updateAliasSchedule } from '@/services/aliases'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

interface Props {
  alias: Alias
  onClose: () => void
}

export default function AliasScheduleEditor({ alias, onClose }: Props) {
  const [schedule, setSchedule] = useState<AliasSchedule>({ ...alias.schedule })
  const [saving, setSaving] = useState(false)

  const toggleDay = (day: number) => {
    setSchedule((s) => ({
      ...s,
      days: s.days.includes(day)
        ? s.days.filter((d) => d !== day)
        : [...s.days, day].sort(),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    await updateAliasSchedule(alias.id, schedule)
    setSaving(false)
    onClose()
  }

  return (
    <div className="border-t border-zinc-700 pt-3 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-zinc-300">Zamanlama aktif</label>
        <button
          onClick={() => setSchedule((s) => ({ ...s, enabled: !s.enabled }))}
          className={`w-10 h-5 rounded-full transition-colors ${
            schedule.enabled ? 'bg-indigo-600' : 'bg-zinc-600'
          }`}
        >
          <span
            className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${
              schedule.enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {schedule.enabled && (
        <>
          <div className="flex gap-3">
            <Input
              label="Başlangıç"
              type="time"
              value={schedule.startTime}
              onChange={(e) =>
                setSchedule((s) => ({ ...s, startTime: e.target.value }))
              }
            />
            <Input
              label="Bitiş"
              type="time"
              value={schedule.endTime}
              onChange={(e) =>
                setSchedule((s) => ({ ...s, endTime: e.target.value }))
              }
            />
          </div>

          <div>
            <p className="text-sm text-zinc-400 mb-2">Aktif günler</p>
            <div className="flex gap-1.5">
              {DAYS.map((day, i) => (
                <button
                  key={i}
                  onClick={() => toggleDay(i)}
                  className={`w-9 h-9 rounded-lg text-xs font-medium transition-colors ${
                    schedule.days.includes(i)
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-700 text-zinc-400'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onClose}>
          İptal
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </Button>
      </div>
    </div>
  )
}
