import { describe, expect, it } from 'vitest'
import { chunk, EXPORT_CHUNK_SIZE } from './export-chunk'

describe('chunk', () => {
  it('splits an array into chunks of the default size', () => {
    const arr = Array.from({ length: 45 }, (_, i) => i)
    const out = chunk(arr)
    expect(out).toHaveLength(3)
    expect(out[0]).toHaveLength(EXPORT_CHUNK_SIZE)
    expect(out[1]).toHaveLength(EXPORT_CHUNK_SIZE)
    expect(out[2]).toHaveLength(5)
  })

  it('returns one chunk when the array fits', () => {
    const arr = [1, 2, 3]
    const out = chunk(arr)
    expect(out).toEqual([[1, 2, 3]])
  })

  it('returns an empty array for empty input', () => {
    expect(chunk([])).toEqual([])
  })

  it('handles an exact multiple of the chunk size', () => {
    const arr = Array.from({ length: 40 }, (_, i) => i)
    const out = chunk(arr)
    expect(out).toHaveLength(2)
    expect(out[0]).toHaveLength(20)
    expect(out[1]).toHaveLength(20)
  })

  it('preserves order across chunks', () => {
    const arr = Array.from({ length: 25 }, (_, i) => i)
    const out = chunk(arr)
    expect(out.flat()).toEqual(arr)
  })

  it('supports a custom chunk size', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7]
    expect(chunk(arr, 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]])
  })
})
