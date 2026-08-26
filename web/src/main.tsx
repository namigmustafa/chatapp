import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import './store/themeStore' // applies the persisted theme class before first paint
import App from './App.tsx'

async function setupNative() {
  if (!Capacitor.isNativePlatform()) return

  const { StatusBar } = await import('@capacitor/status-bar')
  const { Keyboard } = await import('@capacitor/keyboard')

  await StatusBar.setOverlaysWebView({ overlay: true })
  // Initial style is set by themeStore's applyTheme() (imported above) based
  // on the persisted theme, not hardcoded here.

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
