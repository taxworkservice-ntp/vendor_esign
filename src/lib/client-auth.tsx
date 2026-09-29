import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { CLIENT_ROLES, findMockUser, hasRole } from './mock-users'

// Client portal auth (admin-provisioned passwords). Talks to the client/vendor
// operation at VITE_API_BASE; falls back to mock credentials when no API base is
// set so `npm run dev` works (see lib/mock-users.ts).
// One client user = one company: the active tenant is the user's single tenant.

export interface Membership {
  tenantId: string
  role: string
}

interface ClientAuthState {
  email: string | null
  memberships: Membership[]
  activeTenant: string
  mustChangePw: boolean
  isClientAdmin: boolean
  ready: boolean
}

interface ClientAuthCtx extends ClientAuthState {
  login: (email: string, password: string) => Promise<{ mustChangePw: boolean }>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<ClientAuthCtx | null>(null)
const API = (import.meta.env.VITE_API_BASE ?? '') as string
const LS_KEY = 'taxwork-client-auth-v2'

export const MOCK_MODE = !API

// A client user belongs to exactly one company. If a future account has more
// than one membership (e.g. a bookkeeper), the first is used as the active one.
function activeTenantOf(memberships: Membership[]): string {
  return memberships[0]?.tenantId ?? 'ABC'
}

function stateFrom(email: string, memberships: Membership[], mustChangePw: boolean): ClientAuthState {
  return {
    email,
    memberships,
    activeTenant: activeTenantOf(memberships),
    mustChangePw,
    isClientAdmin: memberships.some((m) => m.role === 'client_admin'),
    ready: true,
  }
}

function loggedOut(): ClientAuthState {
  return { email: null, memberships: [], activeTenant: 'ABC', mustChangePw: false, isClientAdmin: false, ready: true }
}

function storedState(): ClientAuthState | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { ...(JSON.parse(raw) as ClientAuthState), ready: true }
  } catch { /* ignore */ }
  return null
}

export function ClientAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ClientAuthState>({
    email: null, memberships: [], activeTenant: 'ABC', mustChangePw: false, isClientAdmin: false, ready: false,
  })

  const refresh = useCallback(async () => {
    if (MOCK_MODE) {
      setState(storedState() ?? loggedOut())
      return
    }
    try {
      const r = await fetch(`${API}/api/auth/me`, { credentials: 'include' })
      if (!r.ok) {
        setState(loggedOut())
        return
      }
      const j = (await r.json()) as { email: string; mustChangePw: boolean; memberships: Membership[] }
      setState(stateFrom(j.email, j.memberships ?? [], !!j.mustChangePw))
    } catch {
      setState(loggedOut())
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(
    async (email: string, password: string) => {
      if (MOCK_MODE) {
        const user = findMockUser(email, password)
        if (!user) throw new Error('invalid-credentials')
        if (!hasRole(user, CLIENT_ROLES)) throw new Error('not-a-client-user')
        const next = stateFrom(user.email, user.memberships, false)
        localStorage.setItem(LS_KEY, JSON.stringify(next))
        setState(next)
        return { mustChangePw: false }
      }
      const r = await fetch(`${API}/api/auth/login`, {
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
    if (MOCK_MODE) {
      localStorage.removeItem(LS_KEY)
      setState(loggedOut())
      return
    }
    await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => null)
    await refresh()
  }, [refresh])

  return <Ctx.Provider value={{ ...state, login, logout, refresh }}>{children}</Ctx.Provider>
}

export function useClientAuth(): ClientAuthCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useClientAuth outside provider')
  return v
}
