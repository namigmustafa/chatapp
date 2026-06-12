import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.tsx'

async function setupNative() {
  if (!Capacitor.isNativePlatform()) return

  const { StatusBar, Style } = await import('@capacitor/status-bar')
  const { Keyboard } = await import('@capacitor/keyboard')

  await StatusBar.setOverlaysWebView({ overlay: true })
  await StatusBar.setStyle({ style: Style.Light })

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
