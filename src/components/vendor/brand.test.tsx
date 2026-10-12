import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { BrandBar, BrandHeader } from './brand'

// White-label header: the client's logo + name own the header, with a name
// monogram and the TW mark as fallbacks; the platform mark lives in the footer.
describe('BrandHeader', () => {
  it('shows the client name and title', () => {
    const html = renderToString(<BrandHeader brand={{ clientName: 'ABC Co., Ltd.' }} title="ใบเสร็จรับเงิน" />)
    expect(html).toContain('ABC Co., Ltd.')
    expect(html).toContain('ใบเสร็จรับเงิน')
  })

  it('renders the logo image when a logo path is present', () => {
    const html = renderToString(<BrandHeader brand={{ clientName: 'ABC', logoUrl: '/api/branding/ABC/logo' }} />)
    expect(html).toContain('/api/branding/ABC/logo')
  })

  it('falls back to a monogram when no logo, and to the TW mark when no name', () => {
    const monogram = renderToString(<BrandHeader brand={{ clientName: 'Acme Ltd' }} />)
    expect(monogram).not.toContain('/api/branding')
    expect(monogram).toContain('AL')
    const fallback = renderToString(<BrandHeader />)
    expect(fallback).toContain('TW VendorSign')
  })
})

describe('BrandBar', () => {
  it('renders the platform brand app bar', () => {
    const html = renderToString(<BrandBar />)
    expect(html).toContain('TW VendorSign')
    expect(html).toContain('/logo.png')
  })
})
