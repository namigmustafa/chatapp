import { create } from 'zustand'
import { Capacitor } from '@capacitor/core'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'chatapp_theme'

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')

  if (Capacitor.isNativePlatform()) {
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      // Capacitor's naming is by the BACKGROUND the style suits, not the icon
      // color: Style.Dark -> light icons (for a dark page), Style.Light ->
      // dark icons (for a light page). Had this backwards before, which made
      // the clock/network icons render white-on-white in light mode.
      StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }).catch(() => {})
    })
  }
}

function getInitialTheme(): Theme {
  return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
}

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialTheme = getInitialTheme()
applyTheme(initialTheme)

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    localStorage.setItem(STORAGE_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },
}))
