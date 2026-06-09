import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'

const root = createRoot(document.getElementById('root')!)

async function boot() {
  if (Capacitor.isNativePlatform()) {
    // Wait for CapacitorHttp to patch window.fetch before Firebase captures it
    await new Promise<void>(resolve => setTimeout(resolve, 500))
  }
  const { default: App } = await import('./App.tsx')
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

boot()
