// DEV/TEST ONLY — hardcoded mock credentials used when no API base is configured
// (VITE_API_BASE empty). Never real user data; never used when a backend is wired.
// One shared password keeps local testing simple.

export interface MockMembership {
  tenantId: string
  role: string
}

export interface MockUser {
  email: string
  password: string
  memberships: MockMembership[]
}

export const MOCK_PASSWORD = 'demo1234'

export const MOCK_USERS: MockUser[] = [
  {
    email: 'client@taxwork.local',
    password: MOCK_PASSWORD,
    memberships: [{ tenantId: 'ABC', role: 'owner' }],
  },
  { email: 'admin@demo.co.th', password: MOCK_PASSWORD, memberships: [{ tenantId: 'DEMO', role: 'owner' }] },
  { email: 'manager@demo.co.th', password: MOCK_PASSWORD, memberships: [{ tenantId: 'DEMO', role: 'manager' }] },
  { email: 'user@demo.co.th', password: MOCK_PASSWORD, memberships: [{ tenantId: 'DEMO', role: 'officer' }] },
  { email: 'super@taxwork.local', password: MOCK_PASSWORD, memberships: [{ tenantId: 'ABC', role: 'super_admin' }] },
]

export function findMockUser(email: string, password: string): MockUser | null {
  const e = email.trim().toLowerCase()
  return MOCK_USERS.find((u) => u.email === e && u.password === password) ?? null
}

// Client-facing roles (owner-only model: owner is the top role; manager/officer are staff).
export const CLIENT_ROLES = ['owner', 'manager', 'officer', 'client_user', 'client_admin'] as const
export const ADMIN_ROLES = ['super_admin', 'bookkeeper'] as const

export function hasRole(user: MockUser, roles: readonly string[]): boolean {
  return user.memberships.some((m) => roles.includes(m.role))
}

// Shown on the login pages during mock mode so the credentials are discoverable.
export const MOCK_HINT = 'client@taxwork.local / demo1234 · super@taxwork.local / demo1234'
