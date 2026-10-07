import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { TempPasswordDialog } from './temp-password-dialog'

// The credential is shown exactly once; these guard that the dialog always
// carries the password, the copy-ready invite and the one-time warning, and
// that the close action starts locked until a copy happens.

const props = {
  open: true,
  email: 'user@client.co.th',
  tempPassword: 'Ab3dEf7hJk9m',
  loginUrl: 'https://app.example.co.th/login',
  onClose: () => {},
}

describe('TempPasswordDialog', () => {
  it('renders nothing when closed', () => {
    expect(renderToString(<TempPasswordDialog {...props} open={false} />)).toBe('')
  })

  it('shows the email, the temp password and the one-time warning', () => {
    const html = renderToString(<TempPasswordDialog {...props} />)
    expect(html).toContain('user@client.co.th')
    expect(html).toContain('Ab3dEf7hJk9m')
    expect(html).toContain('แสดงเพียงครั้งเดียว')
    expect(html).toContain('7 วัน')
  })

  it('includes the copy-ready invite with the login URL', () => {
    const html = renderToString(<TempPasswordDialog {...props} />)
    expect(html).toContain('https://app.example.co.th/login')
    expect(html).toContain('บังคับให้เปลี่ยน')
  })

  it('locks the close action until a copy has been made', () => {
    const html = renderToString(<TempPasswordDialog {...props} />)
    expect(html).toContain('disabled')
    expect(html).toContain('จะไม่แสดงอีก')
  })
})
