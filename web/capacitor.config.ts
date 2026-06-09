import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.chatapp.p2p',
  appName: 'ChatApp',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    hostname: 'localhost',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
