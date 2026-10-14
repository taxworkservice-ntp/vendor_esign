import { describe, expect, it } from 'vitest'
import { isIOSDevice } from './api-client'

// The download path branches on this: iOS gets the share sheet / viewer tab
// because `<a download>` over a blob URL degrades to an in-place preview.
describe('isIOSDevice', () => {
  it('matches iPhone, iPad and iPod user agents', () => {
    expect(isIOSDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5)).toBe(true)
    expect(isIOSDevice('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)', 'iPad', 5)).toBe(true)
    expect(isIOSDevice('Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)', 'iPod', 5)).toBe(true)
  })

  it('catches iPadOS 13+ reporting a desktop Mac UA via touch points', () => {
    const macUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko)'
    expect(isIOSDevice(macUa, 'MacIntel', 5)).toBe(true)
    expect(isIOSDevice(macUa, 'MacIntel', 0)).toBe(false)
  })

  it('is false for desktop and Android', () => {
    const macUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
    expect(isIOSDevice(macUa, 'MacIntel', 0)).toBe(false)
    expect(
      isIOSDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36', 'Linux armv8l', 5),
    ).toBe(false)
  })
})
