import type { Message } from '@/types'
import { format } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { useFileStore } from '@/store/fileStore'

interface Props {
  message: Message
  isOwn: boolean
}

const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|‍|️|⃣|\s)+$/u

function isEmojiOnly(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  const stripped = trimmed.replace(/[‍️⃣\s]/g, '')
  return EMOJI_ONLY_RE.test(stripped)
}

function countEmoji(text: string): number {
  return [...text.matchAll(/\p{Extended_Pictographic}|\p{Emoji_Presentation}/gu)].length
}

const callLabels: Record<string, string> = {
  call_missed: 'Missed call',
  call_ended: 'Call ended',
  call_rejected: 'Call declined',
}

const OWN_BG = '#1d3461'
const OTHER_BG = '#1e2d38'

function toDate(val: unknown): Date | null {
  if (!val) return null
  if (val instanceof Date) return val
  if (typeof val === 'number') return new Date(val)
  if (typeof val === 'object' && 'toDate' in (val as object))
    return (val as { toDate: () => Date }).toDate()
  return null
}

function SingleCheck() {
  return (
    <svg width="14" height="10" viewBox="0 0 16 11" fill="none" className="flex-shrink-0">
      <path d="M1 5.5L5.5 10L15 1" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DoubleCheck({ read }: { read: boolean }) {
  const color = read ? '#a5b4fc' : 'rgba(255,255,255,0.45)'
  return (
    <svg width="18" height="10" viewBox="0 0 20 11" fill="none" className="flex-shrink-0">
      <path d="M1 5.5L5.5 10L15 1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 5.5L10.5 10L20 1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StatusIcon({ status }: { status: Message['status'] }) {
  if (status === 'read') return <DoubleCheck read />
  if (status === 'delivered') return <DoubleCheck read={false} />
  return <SingleCheck />
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function MessageBubble({ message, isOwn }: Props) {
  const blobUrl = useFileStore((s) => s.blobUrls[message.id])
  const isCallEvent =
    message.type === 'call_missed' ||
    message.type === 'call_ended' ||
    message.type === 'call_rejected'
  const date = toDate(message.createdAt)
  const time = date ? format(date, 'HH:mm', { locale: enUS }) : ''
  const fileUrl = blobUrl ?? message.fileUrl

  if (isCallEvent) {
    return (
      <div className="flex justify-center my-1">
        <span className="text-[11px] text-zinc-400 bg-zinc-800/80 px-3 py-1 rounded-full">
          {callLabels[message.type] ?? message.type} · {time}
        </span>
      </div>
    )
  }

  const bg = isOwn ? OWN_BG : OTHER_BG
  // 0px on the tail corner — flush connection with ::after triangle, no gap
  const radius = isOwn ? '12px 12px 0px 12px' : '12px 12px 12px 0px'
  const tailClass = isOwn ? 'msg-tail-own' : 'msg-tail-other'
  // Row padding keeps 8px space so the tail isn't clipped by the scroll container
  const rowClass = `flex my-0.5 ${isOwn ? 'justify-end pr-4' : 'justify-start pl-4'}`

  if (message.type === 'image' || message.type === 'video' || message.type === 'document') {
    return (
      <div className={rowClass}>
        {/* overflow-hidden on the inner content only; outer div has the tail class */}
        <div
          className={`${tailClass} max-w-[72%] text-sm `}
          style={{ backgroundColor: bg, borderRadius: radius }}
        >
          <div className="overflow-hidden" style={{ borderRadius: radius }}>
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
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-zinc-300">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{message.fileName}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{message.fileSize ? formatSize(message.fileSize) : ''}</p>
                  </div>
                </a>
              ) : (
                <div className="flex items-center gap-3 px-3 py-3 opacity-50">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-zinc-300">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{message.fileName}</p>
                    <p className="text-xs text-zinc-400">Waiting for transfer...</p>
                  </div>
                </div>
              )
            )}
            {!fileUrl && message.type !== 'document' && (
              <div className="px-3 py-4 text-xs text-zinc-400 text-center">Waiting for transfer...</div>
            )}
          </div>
          <div className="flex items-center justify-end gap-1 px-2.5 pb-1.5 pt-0.5">
            <span className="text-[10px] text-white/50">{time}</span>
            {isOwn && <StatusIcon status={message.status} />}
          </div>
        </div>
      </div>
    )
  }

  // Emoji-only message — no bubble, just large emoji
  if (isEmojiOnly(message.content)) {
    const count = countEmoji(message.content)
    const sizeClass = count === 1 ? 'text-6xl' : count <= 2 ? 'text-5xl' : count <= 4 ? 'text-4xl' : 'text-3xl'
    return (
      <div className={rowClass}>
        <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} gap-0.5`}>
          <span className={`${sizeClass} leading-none select-none`}>{message.content}</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-white/40 whitespace-nowrap">{time}</span>
            {isOwn && <StatusIcon status={message.status} />}
          </div>
        </div>
      </div>
    )
  }

  // Text message
  return (
    <div className={rowClass}>
      <div
        className={`${tailClass} max-w-[72%] px-3 pt-2 pb-1.5 text-sm text-white `}
        style={{ backgroundColor: bg, borderRadius: radius }}
      >
        {/* Invisible trailing spacer prevents last word overlapping the timestamp */}
        <p className="break-words leading-relaxed">
          {message.content}
          <span className="inline-block w-16 select-none" aria-hidden />
        </p>
        <div className="flex items-center justify-end gap-1 -mt-1">
          <span className="text-[10px] text-white/50 whitespace-nowrap">{time}</span>
          {isOwn && <StatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  )
}
