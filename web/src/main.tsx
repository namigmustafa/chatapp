import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.tsx'

async function setupNative() {
  if (!Capacitor.isNativePlatform()) return

  const { StatusBar, Style } = await import('@capacitor/status-bar')
  const { Keyboard } = await import('@capacitor/keyboard')

  await StatusBar.setStyle({ style: Style.Dark })
  await StatusBar.setBackgroundColor({ color: '#0a0a0a' })
  await StatusBar.setOverlaysWebView({ overlay: false })

  // Keyboard pushes content up instead of overlaying it
  Keyboard.setAccessoryBarVisible({ isVisible: false })
  Keyboard.setScroll({ isDisabled: false })
}

setupNative().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
