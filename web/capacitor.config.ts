import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.chatapp.p2p',
  appName: 'ChatApp',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
