import { describe, expect, it } from 'vitest'
import { cn } from './cn'

/**
 * cn() used to be `filter(Boolean).join(' ')`, which concatenates without
 * understanding Tailwind. Every component in src/components/ui accepts a
 * `className` for exactly the purpose of overriding its base classes, so this
 * was silently load-bearing across the whole UI layer.
 */
describe('cn', () => {
  it('drops falsy values', () => {
    expect(cn('a', false && 'b', null, undefined, '', 'c')).toBe('a c')
  })

  it('lets a caller override a base size class', () => {
    // The regression this guards: both heights surviving, with the winner
    // decided by stylesheet order instead of the caller's intent.
    expect(cn('h-11 px-5', 'h-9')).toBe('px-5 h-9')
  })

  it('resolves conflicts last-wins across more than two inputs', () => {
    expect(cn('text-body', 'text-label', 'text-title')).toBe('text-title')
  })

  it('resolves custom token utilities, not just stock Tailwind ones', () => {
    expect(cn('rounded-card', 'rounded-control')).toBe('rounded-control')
    // Both are custom: `body` is the font-size token and `ink-500` a colour, so
    // they are different groups and correctly coexist rather than one evicting
    // the other.
    expect(cn('text-body', 'text-ink-500')).toBe('text-body text-ink-500')
  })

  it('keeps non-conflicting utilities from the same base', () => {
    expect(cn('flex items-center gap-2', 'text-danger')).toBe(
      'flex items-center gap-2 text-danger',
    )
  })

  it('accepts conditional and array forms', () => {
    const active = true
    expect(cn(['flex', { hidden: !active, 'text-primary': active }])).toBe('flex text-primary')
  })

  it('returns an empty string for no input', () => {
    expect(cn()).toBe('')
  })
})