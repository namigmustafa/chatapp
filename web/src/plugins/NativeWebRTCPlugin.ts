import { registerPlugin } from '@capacitor/core'

export interface NativeWebRTCPluginDefinition {
  // Hands a fresh Firebase ID token to the native call engine, which talks to
  // Firestore's REST API directly (bypassing the WebView) when CallKit answers
  // a call while locked/backgrounded. See native-webrtc/ios's FirestoreClient
  // for why this is REST + a bearer token instead of the native Firebase SDK.
  setAuthToken(options: { token: string }): Promise<void>
}

const webImpl = {
  async setAuthToken() {},
} as unknown as NativeWebRTCPluginDefinition

export const NativeWebRTCPlugin = registerPlugin<NativeWebRTCPluginDefinition>('NativeWebRTCPlugin', {
  web: () => webImpl,
})
