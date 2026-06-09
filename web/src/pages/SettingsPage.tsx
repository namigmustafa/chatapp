import { useNavigate } from 'react-router-dom'
import AliasManager from '@/components/alias/AliasManager'

export default function SettingsPage() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col h-[100dvh] bg-zinc-950" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900 flex-shrink-0">
        <button onClick={() => navigate('/')} className="text-zinc-400 hover:text-white p-1 -ml-1">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="font-semibold text-white">Alias Ayarları</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <AliasManager />
      </div>
    </div>
  )
}
