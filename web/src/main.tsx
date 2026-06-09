import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import './index.css'

if (Capacitor.isNativePlatform()) {
  const _orig = window.fetch.bind(window)

  function toHeadersObj(h: HeadersInit | undefined): Record<string, string> {
    if (!h) return {}
    if (h instanceof Headers) {
      const obj: Record<string, string> = {}
      h.forEach((v, k) => { obj[k] = v })
      return obj
    }
    if (Array.isArray(h)) return Object.fromEntries(h)
    return h as Record<string, string>
  }

  ;(window as any).fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : (input as Request).url

    if (!url.startsWith('http')) return _orig(input, init)

    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const headers = toHeadersObj(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const rawBody = init?.body ?? undefined
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
  }
}

const root = createRoot(document.getElementById('root')!)

async function boot() {
  if (Capacitor.isNativePlatform()) {
    await new Promise<void>(resolve => setTimeout(resolve, 300))
  }
  const { default: App } = await import('./App.tsx')
  root.render(<StrictMode><App /></StrictMode>)
}

boot()
