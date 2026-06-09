import { useEffect } from 'react'
import { goOnline } from 'firebase/database'
import { useAuthStore } from '@/store/authStore'
import { startPresence, setOnline, setOffline } from '@/services/presence'
import { rtdb } from '@/services/firebase'

export function usePresence() {
  const { user } = useAuthStore()

  useEffect(() => {
    if (!user) return
    const uid = user.uid

    // /.info/connected handles setOnline whenever RTDB connects/reconnects
    const stopPresence = startPresence(uid)

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setOffline(uid)
      } else {
        // Connection may still be alive (not dropped) so /.info/connected won't re-fire.
        // Call setOnline directly, then goOnline as fallback for suspended connections.
        goOnline(rtdb)
        setOnline(uid)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      stopPresence()
      setOffline(uid)
    }
  }, [user?.uid])
}
