import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { signOut } from '@/services/auth'
import AliasManager from '@/components/alias/AliasManager'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import { getMyRecentCalls } from '@/services/webrtc'
import type { CallDiagnosticRecord } from '@/services/webrtc'

type Section = 'aliases' | 'account' | 'notifications' | 'appearance'

interface MenuItem {
  id: Section
  icon: React.ReactNode
  label: string
  description: string
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  )
}

function KeyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6M15.5 7.5l3 3"/>
    </svg>
  )
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  )
}

function LogOutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6"/>
    </svg>
  )
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ThemeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  )
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'aliases', icon: <UserIcon />, label: 'My Aliases', description: 'Manage your anonymous identities' },
  { id: 'account', icon: <KeyIcon />, label: 'Account', description: 'Security, email, session' },
  { id: 'appearance', icon: <ThemeIcon />, label: 'Appearance', description: 'Light or dark theme' },
  { id: 'notifications', icon: <BellIcon />, label: 'Notifications', description: 'Sound, vibration, alerts' },
]

function AppearanceSection() {
  const { theme, setTheme } = useThemeStore()
  const options: { id: 'light' | 'dark'; label: string; desc: string }[] = [
    { id: 'light', label: 'Light', desc: 'Default — bright background' },
    { id: 'dark', label: 'Dark', desc: 'Dim background, easier at night' },
  ]
  return (
    <div className="flex flex-col gap-6 p-6 max-w-xl mx-auto">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Appearance</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Choose how Chatapp looks</p>
      </div>
      <div className="bg-zinc-200/60 dark:bg-zinc-800/60 border border-zinc-300 dark:border-zinc-700 rounded-2xl divide-y divide-zinc-200/50 dark:divide-zinc-700/50">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setTheme(opt.id)}
            className="w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left"
          >
            <div>
              <p className="text-sm text-zinc-900 dark:text-white">{opt.label}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{opt.desc}</p>
            </div>
            <span
              className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                theme === opt.id ? 'border-indigo-600' : 'border-zinc-400 dark:border-zinc-600'
              }`}
            >
              {theme === opt.id && <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function AccountSection({ user }: { user: any }) {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-xl mx-auto">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Account</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Security and account information</p>
      </div>
      <div className="bg-zinc-200/60 dark:bg-zinc-800/60 border border-zinc-300 dark:border-zinc-700 rounded-2xl divide-y divide-zinc-200/50 dark:divide-zinc-700/50">
        <div className="px-4 py-3.5">
          <p className="text-xs text-zinc-500 mb-0.5">Email</p>
          <p className="text-sm text-zinc-900 dark:text-white">{user?.email ?? '—'}</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-xs text-zinc-500 mb-0.5">User ID</p>
          <p className="text-sm text-zinc-900 dark:text-white font-mono truncate">{user?.uid ?? '—'}</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-xs text-zinc-500 mb-0.5">Sign-in method</p>
          <p className="text-sm text-zinc-900 dark:text-white capitalize">{user?.providerData?.[0]?.providerId?.replace('.com', '') ?? '—'}</p>
        </div>
      </div>
    </div>
  )
}

// Live VoIP/CallKit diagnostic. Runs the same registration call the app uses
// and reports which of three states we're in — so we can see on-device why the
// lock-screen call UI isn't showing, without reading native logs.
type VoipDiag =
  | { kind: 'checking' }
  | { kind: 'notIOS' }
  | { kind: 'pluginError'; detail: string }   // VoIPPlugin not in this build / native error
  | { kind: 'noToken' }                        // plugin OK but iOS issued no VoIP token (PushKit)
  | { kind: 'token'; prefix: string }          // token present → registration works

function CallDiagnostics() {
  const [diag, setDiag] = useState<VoipDiag>({ kind: 'checking' })

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'ios') { setDiag({ kind: 'notIOS' }); return }
    let cancelled = false
    let removeListener: (() => void) | null = null

    ;(async () => {
      try {
        const { VoIPPlugin } = await import('@/plugins/VoIPPlugin')

        // A late token arrives via the 'registration' event (PushKit didUpdate
        // can fire after this screen mounts).
        const listener = await VoIPPlugin.addListener('registration', ({ token }) => {
          if (!cancelled && token) setDiag({ kind: 'token', prefix: token.slice(0, 14) })
        })
        removeListener = () => listener.remove()

        const res = await VoIPPlugin.register()
        if (cancelled) return
        if (res.token) setDiag({ kind: 'token', prefix: res.token.slice(0, 14) })
        else setDiag({ kind: 'noToken' })
      } catch (e) {
        if (!cancelled) setDiag({ kind: 'pluginError', detail: String(e).slice(0, 120) })
      }
    })()

    return () => { cancelled = true; removeListener?.() }
  }, [])

  const view = (() => {
    switch (diag.kind) {
      case 'checking':  return { color: 'text-zinc-500 dark:text-zinc-400', title: 'Checking…', body: 'Querying VoIP registration' }
      case 'notIOS':    return { color: 'text-zinc-500 dark:text-zinc-400', title: 'Not iOS', body: 'VoIP/CallKit is iOS-only' }
      case 'pluginError': return { color: 'text-red-400', title: 'VoIP plugin missing in this build', body: `The native VoIPPlugin isn't responding — this binary likely predates the CallKit feature. Install the newest TestFlight build. (${diag.detail})` }
      case 'noToken':   return { color: 'text-amber-400', title: 'No VoIP token from iOS', body: "Plugin is present but iOS issued no PushKit token. Usually a provisioning/entitlement issue, a non-production build, or not a real device." }
      case 'token':     return { color: 'text-green-400', title: 'VoIP token registered ✓', body: `Token starts with ${diag.prefix}… If calls still don't show CallKit, the issue is the push send (APNs), not registration.` }
    }
  })()

  return (
    <div className="bg-zinc-200/60 dark:bg-zinc-800/60 border border-zinc-300 dark:border-zinc-700 rounded-2xl px-4 py-3.5">
      <p className="text-sm text-zinc-900 dark:text-white">Call (CallKit) diagnostics</p>
      <p className={`text-sm font-medium mt-1 ${view.color}`}>{view.title}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">{view.body}</p>
    </div>
  )
}

function formatRecord(r: CallDiagnosticRecord): string {
  const lines = [
    `call ${r.id}`,
    `role: ${r.isCaller ? 'caller' : 'callee'} · type: ${r.type} · status: ${r.status}`,
    `time: ${new Date(r.createdAt).toLocaleString()}`,
    `caller log: ${r.callerDebugLog?.join(' | ') || '(none)'}`,
    `callee log (JS): ${r.calleeDebugLog?.join(' | ') || '(none)'}`,
    `callee log (native): ${r.calleeDebugNative || '(none)'}`,
  ]
  return lines.join('\n')
}

function RecentCallsLog() {
  const { user } = useAuthStore()
  const [calls, setCalls] = useState<CallDiagnosticRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = () => {
    if (!user) return
    setCalls(null)
    setError(null)
    getMyRecentCalls(user.uid)
      .then(setCalls)
      .catch((e) => setError(String(e?.message ?? e)))
  }

  useEffect(load, [user?.uid])

  const copy = async (r: CallDiagnosticRecord) => {
    try {
      await navigator.clipboard.writeText(formatRecord(r))
      setCopiedId(r.id)
      setTimeout(() => setCopiedId((cur) => (cur === r.id ? null : cur)), 2000)
    } catch { /* clipboard unavailable — no-op */ }
  }

  return (
    <div className="bg-zinc-200/60 dark:bg-zinc-800/60 border border-zinc-300 dark:border-zinc-700 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5">
        <div>
          <p className="text-sm text-zinc-900 dark:text-white">Recent call logs</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Your last calls, straight from Firestore — tap to expand, copy to share</p>
        </div>
        <button onClick={load} className="text-xs text-indigo-500 dark:text-indigo-400 font-medium px-2 py-1">Refresh</button>
      </div>
      <div className="divide-y divide-zinc-300/50 dark:divide-zinc-700/50">
        {error && <p className="px-4 pb-3 text-xs text-red-400">{error}</p>}
        {calls === null && !error && <p className="px-4 pb-3 text-xs text-zinc-500">Loading…</p>}
        {calls?.length === 0 && <p className="px-4 pb-3 text-xs text-zinc-500">No calls yet.</p>}
        {calls?.map((r) => {
          const expanded = expandedId === r.id
          return (
            <div key={r.id}>
              <button
                onClick={() => setExpandedId(expanded ? null : r.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-900 dark:text-white truncate">
                    {r.isCaller ? 'You called' : 'Called you'} · {r.otherAliasId || '?'} · {r.status}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{new Date(r.createdAt).toLocaleString()}</p>
                </div>
                <ChevronRight />
              </button>
              {expanded && (
                <div className="px-4 pb-3 flex flex-col gap-2">
                  <pre className="text-[10px] leading-relaxed whitespace-pre-wrap break-all bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-zinc-700 dark:text-zinc-300">
                    {formatRecord(r)}
                  </pre>
                  <button
                    onClick={() => copy(r)}
                    className="self-start text-xs font-medium text-indigo-500 dark:text-indigo-400 px-2 py-1"
                  >
                    {copiedId === r.id ? 'Copied ✓' : 'Copy to clipboard'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NotificationsSection() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-xl mx-auto">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Notifications</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Sound and alert preferences</p>
      </div>
      <CallDiagnostics />
      <RecentCallsLog />
      <div className="bg-zinc-200/60 dark:bg-zinc-800/60 border border-zinc-300 dark:border-zinc-700 rounded-2xl divide-y divide-zinc-200/50 dark:divide-zinc-700/50">
        <div className="px-4 py-3.5 flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-900 dark:text-white">Message sounds</p>
            <p className="text-xs text-zinc-500 mt-0.5">Play a sound when a new message arrives</p>
          </div>
          <span className="text-xs text-zinc-500 bg-zinc-200 dark:bg-zinc-700 px-2 py-0.5 rounded-full">Coming soon</span>
        </div>
        <div className="px-4 py-3.5 flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-900 dark:text-white">Call notifications</p>
            <p className="text-xs text-zinc-500 mt-0.5">Notifications for incoming calls</p>
          </div>
          <span className="text-xs text-zinc-500 bg-zinc-200 dark:bg-zinc-700 px-2 py-0.5 rounded-full">Coming soon</span>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [activeSection, setActiveSection] = useState<Section | null>(null)

  // Swipe right from edge: if inside a section, go back to section list; else go home
  const swipeRef = useSwipeBack({
    onBack: () => {
      if (activeSection) setActiveSection(null)
      else navigate('/', { replace: true })
    },
  })

  const handleSignOut = async () => {
    if (!confirm('Sign out?')) return
    await signOut(user?.uid)
    navigate('/', { replace: true })
  }

  const initials = (user?.displayName ?? user?.email ?? '?').slice(0, 2).toUpperCase()

  // Mobile: show section content full screen
  const renderContent = () => {
    if (activeSection === 'aliases') return <AliasManager />
    if (activeSection === 'account') return <AccountSection user={user} />
    if (activeSection === 'appearance') return <AppearanceSection />
    if (activeSection === 'notifications') return <NotificationsSection />
    return null
  }

  return (
    <div ref={swipeRef} className="flex flex-col h-[100dvh] w-full bg-white dark:bg-zinc-950">
      {activeSection ? (
        <>
          {/* Section header */}
          <div className="flex items-center gap-3 px-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex-shrink-0" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: '0.75rem' }}>
            <button onClick={() => setActiveSection(null)} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-1 -ml-1 transition-colors active:scale-90 duration-150">
              <BackIcon />
            </button>
            <span className="font-semibold text-zinc-900 dark:text-white">
              {MENU_ITEMS.find((m) => m.id === activeSection)?.label}
            </span>
          </div>
          {/* Section content */}
          <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {renderContent()}
          </div>
        </>
      ) : (
        <>
          {/* Settings list header */}
          <div className="flex items-center gap-3 px-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex-shrink-0" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: '0.75rem' }}>
            <button onClick={() => navigate('/', { replace: true })} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-1 -ml-1 transition-colors active:scale-90 duration-150">
              <BackIcon />
            </button>
            <span className="font-semibold text-zinc-900 dark:text-white">Settings</span>
          </div>
          {/* Profile */}
          <div className="flex items-center gap-4 px-5 py-5 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-900 flex-shrink-0">
            <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0 ring-2 ring-zinc-300 dark:ring-zinc-700">
              {user?.photoURL ? <img src={user.photoURL} alt="avatar" className="w-full h-full rounded-full object-cover" /> : initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-zinc-900 dark:text-white font-semibold truncate">{user?.displayName ?? 'User'}</p>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm truncate mt-0.5">{user?.email ?? ''}</p>
            </div>
          </div>
          {/* Menu items */}
          <div className="flex-1 overflow-y-auto py-2 bg-white dark:bg-zinc-950" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {MENU_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex items-center justify-center flex-shrink-0">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{item.label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">{item.description}</p>
                </div>
                <ChevronRight />
              </button>
            ))}
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 transition-colors text-left mt-2 border-t border-zinc-200 dark:border-zinc-800"
            >
              <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0 text-red-400"><LogOutIcon /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-400">Sign Out</p>
                <p className="text-xs text-zinc-500 mt-0.5">End your session</p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
