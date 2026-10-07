import { describe, expect, it } from 'vitest'
import {
  SIGN_METHOD_LABEL,
  TYPED_SIGNATURE_PADDING_RATIO,
  fitTypedSignature,
  signMethodLabel,
} from './typed-signature'

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

describe('fitTypedSignature', () => {
  const pad = (size: number) => Math.max(6, Math.round(size * TYPED_SIGNATURE_PADDING_RATIO))

  it('crops the canvas to the advance plus symmetric padding', () => {
    const layout = fitTypedSignature({ advance: 200, ascent: 60, descent: 20, size: 69 })
    const p = pad(69)
    expect(layout.width).toBe(200 + p * 2)
    expect(layout.height).toBe(60 + 20 + p * 2)
  })

  it('centres the text on the canvas and puts the baseline below the top pad', () => {
    const layout = fitTypedSignature({ advance: 200, ascent: 60, descent: 20, size: 69 })
    const p = pad(69)
    expect(layout.x).toBe(layout.width / 2)
    expect(layout.x).toBe((200 + p * 2) / 2)
    expect(layout.y).toBe(p + 60)
  })

  it('grows with a longer name and stays centred', () => {
    const short = fitTypedSignature({ advance: 120, ascent: 40, descent: 15, size: 69 })
    const long = fitTypedSignature({ advance: 900, ascent: 40, descent: 15, size: 69 })
    expect(long.width).toBeGreaterThan(short.width)
    expect(long.x).toBe(long.width / 2)
  })

  it('floors the padding for very small sizes', () => {
    const layout = fitTypedSignature({ advance: 100, ascent: 18, descent: 6, size: 20 })
    expect(layout.width).toBe(100 + 12)
    expect(layout.x).toBe(56)
    expect(layout.y).toBe(6 + 18)
  })

  it('is deterministic for identical metrics', () => {
    const m = { advance: 170, ascent: 50, descent: 18, size: 64 }
    expect(fitTypedSignature(m)).toEqual(fitTypedSignature(m))
  })
})
