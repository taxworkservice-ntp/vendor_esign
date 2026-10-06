import { describe, expect, it } from 'vitest'
import { SIGN_METHOD_LABEL, signMethodLabel } from './typed-signature'

describe('signMethodLabel', () => {
  it('maps each stored method to a human label', () => {
    expect(signMethodLabel('stub-deferred')).toBe(SIGN_METHOD_LABEL['stub-deferred'])
    expect(signMethodLabel('typed-consent')).toBe('ลงนามด้วยการพิมพ์ชื่อ')
    expect(signMethodLabel('uploaded-signature')).toBe(SIGN_METHOD_LABEL['uploaded-signature'])
    expect(signMethodLabel('line-liff')).toBe(SIGN_METHOD_LABEL['line-liff'])
  })

  it('falls back for unknown / missing methods', () => {
    expect(signMethodLabel(undefined)).toBe('ลายเซ็น')
    expect(signMethodLabel('')).toBe('ลายเซ็น')
    expect(signMethodLabel('mystery')).toBe('ลายเซ็น')
  })
})
