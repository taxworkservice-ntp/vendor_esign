import { describe, expect, it } from 'vitest'
import { ADMIN_GUIDE, ALL_GUIDE_SECTIONS, CLIENT_GUIDE, hasGuideAnchor, sectionsFor } from './guide-sections'

describe('guide sections', () => {
  it('has unique anchor ids across client and admin', () => {
    const ids = ALL_GUIDE_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every section a title and at least one step', () => {
    for (const s of ALL_GUIDE_SECTIONS) {
      expect(s.title.trim()).not.toBe('')
      expect(s.steps.length).toBeGreaterThan(0)
      for (const step of s.steps) expect(step.trim()).not.toBe('')
    }
  })

  it('resolves only real anchors', () => {
    for (const s of ALL_GUIDE_SECTIONS) expect(hasGuideAnchor(s.id)).toBe(true)
    expect(hasGuideAnchor('does-not-exist')).toBe(false)
  })

  it('covers the anchors wired to screens', () => {
    // These are the deep-links used by HelpLink across the app; a rename here
    // without updating the screens would make the test fail rather than ship a
    // dead "?" button.
    for (const id of ['getting-started', 'add-vendor', 'create-transaction', 'wht', 'receipt-register']) {
      expect(hasGuideAnchor(id)).toBe(true)
    }
  })

  it('selects the guide for each console', () => {
    expect(sectionsFor('client')).toBe(CLIENT_GUIDE)
    expect(sectionsFor('admin')).toBe(ADMIN_GUIDE)
  })
})
