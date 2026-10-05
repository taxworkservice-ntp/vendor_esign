import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { ADMIN_ROLES, findMockUser, hasRole } from './mock-users'

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
const API = ((import.meta.env.VITE_ADMIN_API_BASE ?? '') || (import.meta.env.VITE_API_BASE ?? '')) as string
const LS_KEY = 'taxwork-auth-v1'

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
    try {
      const r = await fetch(`${API}/api/me`, { credentials: 'include' })
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
        setState(next)
        return { mustChangePw: false }
      }
      const r = await fetch(`${API}/api/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const j = (await r.json().catch(() => null)) as { mustChangePw?: boolean; error?: string } | null
      if (!r.ok) throw new Error(j?.error ?? 'login-failed')
      await refresh()
      return { mustChangePw: !!j?.mustChangePw }
    },
    [refresh],
  )

  const logout = useCallback(async () => {
    if (!API) {
      localStorage.removeItem(LS_KEY)
      setState(loggedOut())
      return
    }
    await fetch(`${API}/api/logout`, { method: 'POST', credentials: 'include' }).catch(() => null)
    await refresh()
  }, [refresh])

  return <Ctx.Provider value={{ ...state, login, logout, refresh }}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside provider')
  return v
}
