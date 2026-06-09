import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import './index.css'

// Patch window.fetch synchronously before Firebase captures it.
// CapacitorHttp routes requests through native NSURLSession (no CORS).
if (Capacitor.isNativePlatform()) {
  const _orig = window.fetch.bind(window)
  ;(window as any).fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : (input as Request).url

    if (!url.startsWith('http')) return _orig(input, init)

    try {
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
      const headers = (init?.headers ?? {}) as Record<string, string>
      const rawBody = init?.body ?? (input instanceof Request ? undefined : undefined)
      const data = rawBody
        ? typeof rawBody === 'string'
          ? (() => { try { return JSON.parse(rawBody) } catch { return rawBody } })()
          : rawBody
        : undefined

      const response = await CapacitorHttp.request({ url, method, headers, data, responseType: 'text' })
      const bodyStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
      return new Response(bodyStr, {
        status: response.status,
        headers: new Headers(response.headers as Record<string, string>),
      })
    } catch {
      return _orig(input, init)
    }
  }
}

const root = createRoot(document.getElementById('root')!)

async function boot() {
  if (Capacitor.isNativePlatform()) {
    // Give the native bridge a moment to fully connect
    await new Promise<void>(resolve => setTimeout(resolve, 300))
  }
  const { default: App } = await import('./App.tsx')
  root.render(<StrictMode><App /></StrictMode>)
}

boot()
