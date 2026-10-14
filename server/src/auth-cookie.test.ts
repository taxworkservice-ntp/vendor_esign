import { afterEach, describe, expect, it } from 'vitest'
import { ADMIN_COOKIE, SESSION_COOKIE, clearSessionCookie, sessionCookie } from './auth'
import { clearImpersonationCookie, impersonationCookie } from './impersonation'

// Session cookies must be HttpOnly + SameSite=Lax everywhere, and Secure in
// production — including the deletion header, or some browsers ignore the
// logout and keep showing a stale cookie.

const prevEnv = process.env.NODE_ENV

afterEach(() => {
  if (prevEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = prevEnv
})

const hourFromNow = () => new Date(Date.now() + 3600 * 1000)

describe('session cookies', () => {
  it('set-cookie carries HttpOnly, Path and Lax outside production', () => {
    delete process.env.NODE_ENV
    const h = sessionCookie('tok', hourFromNow())
    expect(h.startsWith(`${SESSION_COOKIE}=tok;`)).toBe(true)
    expect(h).toContain('HttpOnly')
    expect(h).toContain('Path=/')
    expect(h).toContain('SameSite=Lax')
    expect(h).not.toContain('Secure')
    expect(h).toMatch(/Max-Age=\d+/)
  })

  it('set-cookie gains Secure in production, for all three cookies', () => {
    process.env.NODE_ENV = 'production'
    expect(sessionCookie('tok', hourFromNow())).toContain('; Secure')
    expect(sessionCookie('tok', hourFromNow(), ADMIN_COOKIE)).toContain('; Secure')
    expect(impersonationCookie('tok')).toContain('; Secure')
  })

  it('clear-cookie mirrors Secure in production so logout actually clears', () => {
    delete process.env.NODE_ENV
    expect(clearSessionCookie()).toContain('Max-Age=0')
    expect(clearSessionCookie()).not.toContain('Secure')
    expect(clearImpersonationCookie()).not.toContain('Secure')
    process.env.NODE_ENV = 'production'
    expect(clearSessionCookie()).toContain('; Secure')
    expect(clearSessionCookie(ADMIN_COOKIE)).toContain('; Secure')
    expect(clearImpersonationCookie()).toContain('; Secure')
  })
})
