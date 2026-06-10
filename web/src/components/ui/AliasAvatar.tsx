import { aliasColor } from '@/utils/aliasColor'

function initialsFor(name: string): string {
  return name.slice(0, 4).toUpperCase()
}

interface Props {
  name: string
  isActive?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function AliasAvatar({ name, isActive, size = 'md' }: Props) {
  const initials = initialsFor(name)

  const sizeClasses = {
    sm: 'w-9 h-9 text-[10px]',
    md: 'w-11 h-11 text-xs',
    lg: 'w-16 h-16 text-base',
  }

  const dotSize = {
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
    lg: 'w-3.5 h-3.5',
  }

  return (
    <div className="relative flex-shrink-0">
      <div
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-bold tracking-wider text-white select-none ring-2 ring-white/10`}
        style={{ backgroundColor: aliasColor(name) }}
      >
        {initials}
      </div>
      {isActive !== undefined && (
        <span
          className={`absolute bottom-0 right-0 ${dotSize[size]} rounded-full border-2 border-zinc-900 transition-colors duration-300 ${
            isActive ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-zinc-600'
          }`}
        />
      )}
    </div>
  )
}
