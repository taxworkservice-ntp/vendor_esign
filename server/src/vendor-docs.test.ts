import { describe, expect, it } from 'vitest'
import { parseDocDataUrl } from './data'

// Validation for the client document upload (POST /vendors/:id/document/:kind):
// same envelope as the onboarding submit route.
describe('parseDocDataUrl', () => {
  const png = `data:image/png;base64,${Buffer.from('fake-png-bytes').toString('base64')}`

  it('accepts jpeg, png and webp', () => {
    expect(parseDocDataUrl(png)?.mime).toBe('image/png')
    expect(parseDocDataUrl(png.replace('image/png', 'image/jpeg'))?.mime).toBe('image/jpeg')
    expect(parseDocDataUrl(png.replace('image/png', 'image/webp'))?.mime).toBe('image/webp')
  })

  it('rejects non-image types, HEIC, empty and oversized payloads', () => {
    expect(parseDocDataUrl('data:text/plain;base64,AAAA')).toBeNull()
    expect(parseDocDataUrl(png.replace('image/png', 'image/heic'))).toBeNull()
    expect(parseDocDataUrl('data:image/png;base64,')).toBeNull()
    expect(parseDocDataUrl('not-a-data-url')).toBeNull()
    const big = `data:image/jpeg;base64,${'A'.repeat(7 * 1024 * 1024)}`
    expect(parseDocDataUrl(big)).toBeNull()
  })
})
