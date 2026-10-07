import { describe, expect, it } from 'vitest'
import { buildFirstLoginMessage } from './admin-invite-message'

describe('buildFirstLoginMessage', () => {
  const input = {
    loginUrl: 'https://app.example.co.th/login',
    email: 'user@client.co.th',
    tempPassword: 'Ab3dEf7hJk9m',
  }

  it('includes the login URL, email and temp password', () => {
    const msg = buildFirstLoginMessage(input)
    expect(msg).toContain('https://app.example.co.th/login')
    expect(msg).toContain('user@client.co.th')
    expect(msg).toContain('Ab3dEf7hJk9m')
  })

  it('states the forced first-login change and the 7-day expiry', () => {
    const msg = buildFirstLoginMessage(input)
    expect(msg).toContain('บังคับเปลี่ยนครั้งแรก')
    expect(msg).toContain('7 วัน')
  })

  it('never leaks undefined into the pasted text', () => {
    expect(buildFirstLoginMessage(input)).not.toContain('undefined')
  })

  it('renders steps in order', () => {
    const lines = buildFirstLoginMessage(input).split('\n')
    const steps = lines.filter((l) => /^[123]\./.test(l))
    expect(steps).toHaveLength(3)
    expect(steps[0]).toContain(input.loginUrl)
    expect(steps[1]).toContain(input.email)
  })
})
