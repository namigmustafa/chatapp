import { useEffect, useRef } from 'react'

interface Options {
  onBack: () => void
  enabled?: boolean
  edgeOnly?: boolean  // only trigger if swipe starts within left 40px
}

export function useSwipeBack({ onBack, enabled = true, edgeOnly = true }: Options) {
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (edgeOnly && touch.clientX > 40) return
      startX.current = touch.clientX
      startY.current = touch.clientY
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (startX.current === null || startY.current === null) return
      const touch = e.changedTouches[0]
      const dx = touch.clientX - startX.current
      const dy = Math.abs(touch.clientY - startY.current)
      startX.current = null
      startY.current = null
      // Swipe right: horizontal movement > 80px, more horizontal than vertical
      if (dx > 80 && dy < dx * 0.75) {
        // Prevent the ghost click that fires at the touchend position
        document.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true })
        onBack()
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [enabled, edgeOnly, onBack])
}
