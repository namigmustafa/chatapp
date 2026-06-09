import { aliasColor } from '@/utils/aliasColor'

function initialsFor(name: string): string {
  // Show up to 4 chars so "GAF" and "GAF2" are visually distinct
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

  return (
    <div className="relative flex-shrink-0">
      <div
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-bold tracking-wider text-white select-none`}
        style={{ backgroundColor: aliasColor(name) }}
      >
        {initials}
      </div>
      {isActive !== undefined && (
        <span
          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-zinc-900 ${
            isActive ? 'bg-emerald-400' : 'bg-zinc-500'
          }`}
        />
      )}
    </div>
  )
}
