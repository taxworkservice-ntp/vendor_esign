import { describe, expect, it } from 'vitest'
import { parseDocDataUrl, parseUploadDataUrl, extForMime } from './data'

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

// Slips are uploaded through a wider parser that also accepts PDFs.
describe('parseUploadDataUrl (slips)', () => {
  const jpg = `data:image/jpeg;base64,${Buffer.from('fake-jpg').toString('base64')}`
  const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 fake').toString('base64')}`

  it('accepts images and PDFs', () => {
    expect(parseUploadDataUrl(jpg)?.mime).toBe('image/jpeg')
    expect(parseUploadDataUrl(pdf)?.mime).toBe('application/pdf')
    expect(parseUploadDataUrl(pdf)?.bytes[0]).toBe(0x25) // '%'
  })

  it('maps mime to a file extension', () => {
    expect(extForMime('application/pdf')).toBe('pdf')
    expect(extForMime('image/png')).toBe('png')
    expect(extForMime('image/jpeg')).toBe('jpg')
  })

  it('rejects unknown types and oversized payloads', () => {
    expect(parseUploadDataUrl('data:text/plain;base64,AAAA')).toBeNull()
    expect(parseUploadDataUrl(`data:application/pdf;base64,${'A'.repeat(7 * 1024 * 1024)}`)).toBeNull()
  })
})
