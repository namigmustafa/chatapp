import type { Message } from '@/types'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { useFileStore } from '@/store/fileStore'

interface Props {
  message: Message
  isOwn: boolean
}

const callLabels: Record<string, string> = {
  call_missed: 'Cevapsız arama',
  call_ended: 'Arama bitti',
  call_rejected: 'Arama reddedildi',
}

function toDate(val: unknown): Date | null {
  if (!val) return null
  if (val instanceof Date) return val
  if (typeof val === 'number') return new Date(val)
  if (typeof val === 'object' && 'toDate' in (val as object))
    return (val as { toDate: () => Date }).toDate()
  return null
}

function SingleCheck({ color }: { color: string }) {
  return (
    <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
      <path d="M1 5.5L5.5 10L15 1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DoubleCheck({ color }: { color: string }) {
  return (
    <svg width="20" height="11" viewBox="0 0 20 11" fill="none">
      <path d="M1 5.5L5.5 10L15 1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 5.5L10.5 10L20 1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StatusIcon({ status }: { status: Message['status'] }) {
  if (status === 'read') return <DoubleCheck color="#a5b4fc" />
  if (status === 'delivered') return <DoubleCheck color="#6b7280" />
  return <SingleCheck color="#6b7280" />
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function MessageBubble({ message, isOwn }: Props) {
  const blobUrl = useFileStore((s) => s.blobUrls[message.id])
  const isCallEvent = message.type === 'call_missed' || message.type === 'call_ended' || message.type === 'call_rejected'
  const date = toDate(message.createdAt)
  const time = date ? format(date, 'HH:mm', { locale: tr }) : ''
  const fileUrl = blobUrl ?? message.fileUrl

  if (isCallEvent) {
    return (
      <div className="flex justify-center">
        <span className="text-xs text-zinc-500 bg-zinc-800 px-3 py-1 rounded-full">
          {callLabels[message.type] ?? message.type} · {time}
        </span>
      </div>
    )
  }

  if (message.type === 'image' || message.type === 'video' || message.type === 'document') {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-xs lg:max-w-sm rounded-2xl overflow-hidden text-sm ${
          isOwn ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-zinc-700 text-zinc-100 rounded-bl-sm'
        }`}>
          {message.type === 'image' && fileUrl && (
            <img
              src={fileUrl}
              alt={message.fileName}
              className="w-full max-h-64 object-cover cursor-pointer"
              onClick={() => window.open(fileUrl, '_blank')}
            />
          )}
          {message.type === 'video' && fileUrl && (
            <video controls src={fileUrl} className="w-full max-h-64" />
          )}
          {message.type === 'document' && (
            fileUrl ? (
              <a
                href={fileUrl}
                download={message.fileName}
                className="flex items-center gap-3 px-3 py-3 hover:opacity-80 transition-opacity"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{message.fileName}</p>
                  <p className={`text-xs ${isOwn ? 'text-indigo-200' : 'text-zinc-400'}`}>
                    {message.fileSize ? formatSize(message.fileSize) : ''}
                  </p>
                </div>
              </a>
            ) : (
              <div className="flex items-center gap-3 px-3 py-3 opacity-50">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{message.fileName}</p>
                  <p className={`text-xs ${isOwn ? 'text-indigo-200' : 'text-zinc-400'}`}>Bekleniyor...</p>
                </div>
              </div>
            )
          )}
          {!fileUrl && message.type !== 'document' && (
            <div className="px-3 py-4 text-xs opacity-50 text-center">Aktarım bekleniyor...</div>
          )}
          <div className={`flex items-center gap-1 px-3 py-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            <span className={`text-[11px] leading-none ${isOwn ? 'text-indigo-200' : 'text-zinc-400'}`}>{time}</span>
            {isOwn && <StatusIcon status={message.status} />}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-xs lg:max-w-md px-3 py-2 rounded-2xl text-sm ${
          isOwn
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-zinc-700 text-zinc-100 rounded-bl-sm'
        }`}
      >
        <p className="break-words leading-relaxed">{message.content}</p>
        <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-[11px] leading-none ${isOwn ? 'text-indigo-200' : 'text-zinc-400'}`}>
            {time}
          </span>
          {isOwn && <StatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  )
}
