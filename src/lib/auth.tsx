import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { ADMIN_ROLES, findMockUser, hasRole } from './mock-users'
import { adminPath } from './admin-api'
import { ADMIN_API_BASE } from './api-base'

export interface Membership {
  tenantId: string
  role: string
}

interface AuthState {
  email: string | null
  memberships: Membership[]
  mustChangePw: boolean
  /** Provider/operator account — controls the whole app. */
  isPlatformAdmin: boolean
  ready: boolean
}

interface AuthCtx extends AuthState {
  login: (email: string, password: string) => Promise<{ mustChangePw: boolean }>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)
// Admin operation base: isolated port (default :8788). Falls back to the
// public API base, then to mock mode when both are empty.
const API = ADMIN_API_BASE
const LS_KEY = 'taxwork-auth-v1'
// Set once an admin logs in on this browser. Client pages only probe the admin
// session when this hint (or an /admin route) is present, so a normal client
// user never requests /api/me-admin and logs a 401 on every page load.
const HINT_KEY = 'taxwork-admin-hint'

function hasAdminHint(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}
function setAdminHint(on: boolean): void {
  try {
    if (on) localStorage.setItem(HINT_KEY, '1')
    else localStorage.removeItem(HINT_KEY)
  } catch {
    /* private mode */
  }
}

/** Mark this browser as having an admin session. ClientLogin calls this after
 *  a unified login returns kind='admin' (it bypasses useAuth.login, the only
 *  other place the hint is set) so refresh() actually probes the session
 *  instead of early-returning to logged-out. */
export function markAdminHint(): void {
  setAdminHint(true)
}

export const MOCK_MODE = !API

function loggedOut(): AuthState {
  return { email: null, memberships: [], mustChangePw: false, isPlatformAdmin: false, ready: true }
}

function localSession(): AuthState {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const s = JSON.parse(raw) as AuthState
      return { ...s, isPlatformAdmin: s.isPlatformAdmin ?? s.memberships.some((m) => m.role === 'super_admin'), ready: true }
    }
  } catch { /* ignore */ }
  // No stored session: require login (mock uses lib/mock-users.ts credentials).
  return loggedOut()
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ email: null, memberships: [], mustChangePw: false, isPlatformAdmin: false, ready: false })

  const refresh = useCallback(async () => {
    if (!API) {
      setState(localSession())
      return
    }
    // Probe the admin session only on admin routes or after an admin logged in
    // here; otherwise skip the request entirely (no 401 noise on client pages).
    const onAdminRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
    if (!onAdminRoute && !hasAdminHint()) {
      setState(loggedOut())
      return
    }
    try {
      const r = await fetch(adminPath('/api/me'), { credentials: 'include' })
      if (!r.ok) {
        setState(loggedOut())
        return
      }
      const j = (await r.json()) as { email: string; mustChangePw: boolean; isPlatformAdmin?: boolean; memberships: Membership[] }
      setState({
        email: j.email,
        memberships: j.memberships ?? [],
        mustChangePw: !!j.mustChangePw,
        isPlatformAdmin: !!j.isPlatformAdmin,
        ready: true,
      })
    } catch {
      setState(loggedOut())
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(
    async (email: string, password: string) => {
      if (!API) {
        const user = findMockUser(email, password)
        if (!user) throw new Error('invalid-credentials')
        if (!hasRole(user, ADMIN_ROLES)) throw new Error('not-an-admin')
        const next: AuthState = {
          email: user.email,
          memberships: user.memberships,
          mustChangePw: false,
          isPlatformAdmin: user.memberships.some((m) => m.role === 'super_admin'),
          ready: true,
        }
        localStorage.setItem(LS_KEY, JSON.stringify(next))
        setAdminHint(true)
        setState(next)
        return { mustChangePw: false }
      }
      const r = await fetch(adminPath('/api/login'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const j = (await r.json().catch(() => null)) as { mustChangePw?: boolean; error?: string } | null
      if (!r.ok) throw new Error(j?.error ?? 'login-failed')
      setAdminHint(true)
      await refresh()
      return { mustChangePw: !!j?.mustChangePw }
    },
    [refresh],
  )

  const logout = useCallback(async () => {
    setAdminHint(false)
    if (!API) {
      localStorage.removeItem(LS_KEY)
      setState(loggedOut())
      return
    }
    await fetch(adminPath('/api/logout'), { method: 'POST', credentials: 'include' }).catch(() => null)
    await refresh()
  }, [refresh])

  return <Ctx.Provider value={{ ...state, login, logout, refresh }}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside provider')
  return v
}
