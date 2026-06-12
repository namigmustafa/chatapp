import { useEffect } from 'react'
import { useUIStore } from '@/store/uiStore'
import AliasAvatar from '@/components/ui/AliasAvatar'

interface Props {
  onTap: (convId: string) => void
}

export default function InAppToast({ onTap }: Props) {
  const { toast, setToast } = useUIStore()

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast?.id])

  if (!toast) return null

  return (
    <div
      className="fixed left-0 right-0 z-[90] flex justify-center pointer-events-none"
      style={{ top: 'env(safe-area-inset-top)' }}
    >
      <button
        className="mx-3 mt-2 w-full max-w-sm bg-zinc-800/95 backdrop-blur-sm border border-zinc-600/50 rounded-2xl px-3 py-2.5 flex items-center gap-3 shadow-2xl pointer-events-auto text-left"
        style={{ animation: 'slideDownBanner 0.35s cubic-bezier(0.22, 1, 0.36, 1)' }}
        onClick={() => { onTap(toast.convId); setToast(null) }}
      >
        <AliasAvatar name={toast.title} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">{toast.title}</p>
          <p className="text-zinc-400 text-xs truncate">{toast.body}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setToast(null) }}
          className="flex-shrink-0 text-zinc-500 hover:text-zinc-300 p-1"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </button>
    </div>
  )
}
