import { describe, expect, it } from 'vitest'
import { initials } from './brand'

// The monogram shown in the vendor-link header when a client has no logo.
describe('initials', () => {
  it('takes the first letter of the first and last word', () => {
    expect(initials('ABC Accounting Co., Ltd.')).toBe('AL')
    expect(initials('Acme')).toBe('A')
  })

  it('is blank for empty input so the caller can drop the mark', () => {
    expect(initials('')).toBe('')
    expect(initials('   ')).toBe('')
    expect(initials(null)).toBe('')
    expect(initials(undefined)).toBe('')
  })

  it('caps at two characters', () => {
    expect(initials('a b c d').length).toBe(2)
  })
})
