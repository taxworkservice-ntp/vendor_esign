import { describe, expect, it } from 'vitest'
import { isSigned, SIGNATURE_COPY, signatureState } from './signature-state'
import type { TxnStatus } from './types'

// The receipt signature block has four states, and the one that matters most is
// the distinction the old markup lost: "not signed" versus "signed but the
// image is not here". Previously the rule, the caption and the name were drawn
// unconditionally and only the <img> was conditional, so an unsigned receipt
// was indistinguishable from a signed one.

describe('isSigned', () => {
  it('covers exactly the statuses that mean the vendor has signed', () => {
    expect(isSigned({ status: 'signed' })).toBe(true)
    expect(isSigned({ status: 'issued' })).toBe(true)
    for (const s of ['draft', 'sent', 'opened', 'expired', 'cancelled', 'void'] as TxnStatus[]) {
      expect(isSigned({ status: s })).toBe(false)
    }
  })
})

describe('signatureState', () => {
  it('is unsigned for every pre-signature status, even with a stray image', () => {
    for (const s of ['draft', 'sent', 'opened', 'expired', 'cancelled', 'void'] as TxnStatus[]) {
      expect(signatureState({ status: s }, 'data:image/png;base64,AAA')).toEqual({ kind: 'unsigned' })
    }
  })

  it('is unsigned regardless of the loading flag', () => {
    expect(signatureState({ status: 'draft' }, null, { loading: true })).toEqual({ kind: 'unsigned' })
  })

  it('is ready when a signed row has an image', () => {
    expect(signatureState({ status: 'signed' }, 'data:image/png;base64,AAA')).toEqual({
      kind: 'ready',
      png: 'data:image/png;base64,AAA',
    })
    expect(signatureState({ status: 'issued' }, 'x').kind).toBe('ready')
  })

  it('is loading only while a request is in flight', () => {
    expect(signatureState({ status: 'signed' }, null, { loading: true })).toEqual({ kind: 'loading' })
  })

  it('is missing when signed with no image and nothing in flight', () => {
    // The gap that made the bug invisible: a finished request that simply had
    // no PNG must not be rendered as an empty signature box.
    expect(signatureState({ status: 'signed' }, null)).toEqual({ kind: 'missing' })
    expect(signatureState({ status: 'issued' }, undefined)).toEqual({ kind: 'missing' })
  })

  it('prefers the image over the loading flag once it arrives', () => {
    expect(signatureState({ status: 'signed' }, 'png', { loading: true }).kind).toBe('ready')
  })

  it('treats an empty string as no image', () => {
    expect(signatureState({ status: 'signed' }, '').kind).toBe('missing')
  })
})

describe('SIGNATURE_COPY', () => {
  it('has copy for every non-ready state', () => {
    expect(Object.keys(SIGNATURE_COPY).sort()).toEqual(['loading', 'missing', 'unsigned'])
  })

  it('gives every non-loading state an explanation', () => {
    expect(SIGNATURE_COPY.unsigned.detail).toBeTruthy()
    expect(SIGNATURE_COPY.missing.detail).toBeTruthy()
  })
})
