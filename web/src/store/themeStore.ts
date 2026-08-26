import { create } from 'zustand'
import { Capacitor } from '@capacitor/core'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'chatapp_theme'

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')

  if (Capacitor.isNativePlatform()) {
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      // Status bar content color is the inverse of the page: dark icons on a
      // light page, light icons on a dark page.
      StatusBar.setStyle({ style: theme === 'dark' ? Style.Light : Style.Dark }).catch(() => {})
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
