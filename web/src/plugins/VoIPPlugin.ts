import { registerPlugin } from '@capacitor/core'

export interface VoIPCallInfo {
  callUUID: string
  callId: string
  callType: 'audio' | 'video'
  callerName: string
  callerUserId: string
}

export interface VoIPRegistrationResult {
  token?: string
  pendingCall?: VoIPCallInfo
  pendingAnswer?: boolean
}

export interface VoIPPluginDefinition {
  register(): Promise<VoIPRegistrationResult>
  endCall(): Promise<void>
  addListener(
    eventName: 'registration',
    listenerFunc: (event: { token: string }) => void
  ): Promise<{ remove: () => void }>
  addListener(
    eventName: 'callReceived',
    listenerFunc: (event: VoIPCallInfo) => void
  ): Promise<{ remove: () => void }>
  addListener(
    eventName: 'callAnswered',
    listenerFunc: (event: { callUUID: string }) => void
  ): Promise<{ remove: () => void }>
  addListener(
    eventName: 'callEnded',
    listenerFunc: (event: { callUUID: string }) => void
  ): Promise<{ remove: () => void }>
}

// No-op web implementation — VoIP push is iOS-only
const webImpl = {
  async register() { return {} as VoIPRegistrationResult },
  async endCall() {},
  async addListener(_event: string, _fn: unknown) {
    return { remove: () => {} }
  },
} as unknown as VoIPPluginDefinition

export const VoIPPlugin = registerPlugin<VoIPPluginDefinition>('VoIPPlugin', {
  web: () => webImpl,
})
