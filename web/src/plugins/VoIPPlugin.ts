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
  pendingAnswerCallId?: string
  pendingDeclineCallId?: string
  // Android: action stored by CallActivity (answer/decline from lock screen)
  pendingCallAction?: 'answer' | 'decline'
  pendingCallId?: string
  // Diagnostic-only timing (epoch seconds) + UIApplication.State rawValue (0=active,1=inactive,2=background)
  nativeAnswerActionAt?: number
  nativeAnswerActionAppState?: number
  nativeAudioActivatedAt?: number
  nativeAudioActivatedAppState?: number
}

export interface VoIPPluginDefinition {
  register(): Promise<VoIPRegistrationResult>
  getStartupConversation(): Promise<{ conversationId: string }>
  endCall(): Promise<void>
  // Android only — pushes a fresh Firebase ID token into SharedPreferences so
  // CallForegroundService can authenticate its native LiveKit/Firestore calls.
  setAuthToken(options: { token: string }): Promise<void>
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
    listenerFunc: (event: { callUUID: string; callId?: string }) => void
  ): Promise<{ remove: () => void }>
  addListener(
    eventName: 'callEnded',
    listenerFunc: (event: { callUUID: string; callId?: string; answered?: boolean }) => void
  ): Promise<{ remove: () => void }>
}

// No-op web implementation — VoIP push is iOS-only
const webImpl = {
  async register() { return {} as VoIPRegistrationResult },
  async getStartupConversation() { return { conversationId: '' } },
  async endCall() {},
  async setAuthToken() {},
  async addListener(_event: string, _fn: unknown) {
    return { remove: () => {} }
  },
} as unknown as VoIPPluginDefinition

export const VoIPPlugin = registerPlugin<VoIPPluginDefinition>('VoIPPlugin', {
  web: () => webImpl,
})
