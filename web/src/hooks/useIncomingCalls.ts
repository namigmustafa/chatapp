import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useCallStore } from '@/store/callStore'
import { subscribeIncomingCalls } from '@/services/webrtc'

export const useIncomingCalls = () => {
  const { user } = useAuthStore()
  const { setIncomingCall, activeCall } = useCallStore()

  useEffect(() => {
    if (!user) return
    const unsub = subscribeIncomingCalls(user.uid, (call) => {
      if (!activeCall) {
        setIncomingCall(call)
      }
    })
    return unsub
  }, [user, activeCall, setIncomingCall])
}
