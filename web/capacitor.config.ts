import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.chatapp.p2p',
  appName: 'ChatApp',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com', 'password'],
    },
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound'],
    },
    StatusBar: {
      style: 'dark',
      overlaysWebView: true,
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
  },
}

export default config
