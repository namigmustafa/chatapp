import { useEffect, useRef } from 'react'

interface Options {
  onBack: () => void
  enabled?: boolean
  edgeOnly?: boolean  // only trigger if swipe starts within left 40px
}

const SPRING = 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)'

// Real-time interactive pop gesture (mirrors iOS's UINavigationController edge
// swipe): the screen follows the finger 1:1 while dragging, then either
// completes off-screen or snaps back, instead of the old implementation which
// only detected a finished swipe on touchend and had no visual feedback while
// dragging — that's what read as "not a native app" to users.
export function useSwipeBack({ onBack, enabled = true, edgeOnly = true }: Options) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!enabled || !el) return

    const setX = (x: number, animate: boolean) => {
      el.style.transition = animate ? SPRING : 'none'
      el.style.transform = x > 0 ? `translateX(${x}px)` : ''
    }

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (edgeOnly && touch.clientX > 40) return
      startX.current = touch.clientX
      startY.current = touch.clientY
      dragging.current = false
    }

    const onTouchMove = (e: TouchEvent) => {
      if (startX.current === null || startY.current === null) return
      const touch = e.touches[0]
      const dx = touch.clientX - startX.current
      const dy = touch.clientY - startY.current

      if (!dragging.current) {
        // Not committed yet — decide once the gesture is clearly horizontal.
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        if (Math.abs(dy) > Math.abs(dx)) {
          startX.current = null
          startY.current = null
          return
        }
        dragging.current = true
      }

      if (dx <= 0) {
        setX(0, false)
        return
      }
      // Rubber-band past the halfway point so it never flies further than
      // feels controllable, same idea as iOS's edge-pan resistance curve.
      const width = window.innerWidth
      const eased = dx < width / 2 ? dx : width / 2 + (dx - width / 2) * 0.3
      setX(Math.min(eased, width), false)
    }

    const onTouchEnd = (e: TouchEvent) => {
      const wasDragging = dragging.current
      const start = startX.current
      startX.current = null
      startY.current = null
      dragging.current = false
      if (!wasDragging || start === null) return

      const touch = e.changedTouches[0]
      const dx = touch.clientX - start
      const width = window.innerWidth

      if (dx > width * 0.3) {
        setX(width, true)
        // Prevent the ghost click that fires at the touchend position
        document.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true })
        window.setTimeout(() => {
          onBack()
          setX(0, false)
        }, 280)
      } else {
        setX(0, true)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [enabled, edgeOnly, onBack])

  return containerRef
}
