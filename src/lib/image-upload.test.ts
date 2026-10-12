import { describe, expect, it } from 'vitest'
import { dataUrlSize, fitWithin } from './image-upload'

describe('fitWithin', () => {
  it('leaves images already within the bound unchanged', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ w: 800, h: 600 })
    expect(fitWithin(1600, 1200, 1600)).toEqual({ w: 1600, h: 1200 })
  })

  it('scales the longest edge down, preserving aspect ratio', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200 })
    expect(fitWithin(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600 })
  })

  it('never returns a zero dimension and handles empty input', () => {
    const r = fitWithin(10000, 3, 1600)
    expect(r.w).toBe(1600)
    expect(r.h).toBeGreaterThanOrEqual(1)
    expect(fitWithin(0, 0, 1600)).toEqual({ w: 0, h: 0 })
  })
})

describe('dataUrlSize', () => {
  it('measures the decoded byte length of a base64 data URL', () => {
    // 'AAAA' = 3 bytes; 'AAA=' = 2 bytes; 'AA==' = 1 byte.
    expect(dataUrlSize('data:image/jpeg;base64,AAAA')).toBe(3)
    expect(dataUrlSize('data:image/jpeg;base64,AAA=')).toBe(2)
    expect(dataUrlSize('data:image/jpeg;base64,AA==')).toBe(1)
  })

  it('is zero for malformed input', () => {
    expect(dataUrlSize('not-a-data-url')).toBe(0)
  })
})
