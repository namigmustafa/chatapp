import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import { useThemeStore } from './store/themeStore' // applies the persisted theme class before first paint
import App from './App.tsx'

async function setupNative() {
  if (!Capacitor.isNativePlatform()) return

  const { StatusBar, Style } = await import('@capacitor/status-bar')
  const { Keyboard } = await import('@capacitor/keyboard')

  await StatusBar.setOverlaysWebView({ overlay: true })
  // Re-assert the status bar icon style AFTER overlay mode is confirmed on —
  // themeStore's own applyTheme() call already ran at import time above, but
  // that races setOverlaysWebView (both fire before the native bridge is
  // necessarily ready); on some Android builds a style set before overlay
  // mode is active gets silently dropped, leaving the clock/network icons
  // unreadable against the new light background.
  const theme = useThemeStore.getState().theme
  await StatusBar.setStyle({ style: theme === 'dark' ? Style.Light : Style.Dark }).catch(() => {})

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
