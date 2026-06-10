import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useCallStore } from '@/store/callStore'
import { subscribeIncomingCalls } from '@/services/webrtc'

const requestNotificationPermission = () => {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {})
  }
}

const showCallNotification = (callerName: string, callType: string) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`Incoming ${callType === 'video' ? 'video' : 'voice'} call`, {
      body: callerName.toUpperCase(),
      icon: '/favicon.ico',
      requireInteraction: true,
      silent: false,
    })
  }
}

export const useIncomingCalls = () => {
  const { user } = useAuthStore()
  const { setIncomingCall, activeCall } = useCallStore()

  useEffect(() => {
    requestNotificationPermission()
  }, [])

  useEffect(() => {
    if (!user) return
    const unsub = subscribeIncomingCalls(user.uid, (call) => {
      if (!activeCall) {
        setIncomingCall(call)
        const callerName = call.callerAliasId || call.callerUserId
        showCallNotification(callerName, call.type)
      }
    })
    return unsub
  }, [user, activeCall, setIncomingCall])
}
