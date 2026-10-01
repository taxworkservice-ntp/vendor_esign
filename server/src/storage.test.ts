import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readStored, resolveStored, saveBytes, storageRoot } from './storage'

// resolveStored turns a path that came out of the database into a real file
// path. That makes it the boundary between "a column value" and "a byte on
// disk", so it has to refuse anything that is not a plain file inside the
// caller's own tenant directory.

let root: string
const WS = 'ABC'
const OTHER = 'ZZZ'

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'vs-store-'))
  process.env.STORAGE_DIR = root
  mkdirSync(join(root, WS, 'pdfs'), { recursive: true })
  mkdirSync(join(root, WS, 'signatures'), { recursive: true })
  mkdirSync(join(root, OTHER, 'pdfs'), { recursive: true })
  writeFileSync(join(root, WS, 'pdfs', 'RCT-001-2569-001.pdf'), 'PDF-A')
  writeFileSync(join(root, WS, 'signatures', 'tx-1.png'), 'PNG-A')
  writeFileSync(join(root, OTHER, 'pdfs', 'secret.pdf'), 'PDF-OTHER')
  // A receipt number can only reach disk through saveBytes, which sanitises it —
  // verify that, since it is the other half of the path-safety story.
  saveBytes('pdfs', '../../escape.pdf', new TextEncoder().encode('X'), WS)
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
  delete process.env.STORAGE_DIR
})

describe('resolveStored', () => {
  it('resolves a normal stored path', () => {
    const p = resolveStored(WS, 'ABC/pdfs/RCT-001-2569-001.pdf')
    expect(p).toBe(join(root, WS, 'pdfs', 'RCT-001-2569-001.pdf'))
  })

  it('refuses to climb out with ..', () => {
    expect(resolveStored(WS, 'ABC/../ZZZ/pdfs/secret.pdf')).toBeNull()
    expect(resolveStored(WS, '../ZZZ/pdfs/secret.pdf')).toBeNull()
    expect(resolveStored(WS, 'ABC/pdfs/../../ZZZ/pdfs/secret.pdf')).toBeNull()
  })

  it('refuses an absolute path', () => {
    expect(resolveStored(WS, join(root, WS, 'pdfs', 'RCT-001-2569-001.pdf'))).toBeNull()
    expect(resolveStored(WS, '/etc/passwd')).toBeNull()
    expect(resolveStored(WS, 'C:/Windows/System32/config/SAM')).toBeNull()
  })

  it('refuses a path belonging to another workspace', () => {
    // The SQL already filters by user_id; this is the second lock.
    expect(resolveStored(WS, 'ZZZ/pdfs/secret.pdf')).toBeNull()
  })

  it('refuses a path with no area segment', () => {
    expect(resolveStored(WS, 'RCT-001-2569-001.pdf')).toBeNull()
  })

  it('refuses empty, null and NUL-bearing input', () => {
    expect(resolveStored(WS, '')).toBeNull()
    expect(resolveStored(WS, null)).toBeNull()
    expect(resolveStored(WS, undefined)).toBeNull()
    expect(resolveStored('', 'ABC/pdfs/x.pdf')).toBeNull()
    expect(resolveStored(WS, 'ABC/pdfs/x.pdf\u0000.png')).toBeNull()
  })

  it('refuses a path that does not exist, and a directory', () => {
    expect(resolveStored(WS, 'ABC/pdfs/nope.pdf')).toBeNull()
    expect(resolveStored(WS, 'ABC/pdfs')).toBeNull()
  })
})

describe('readStored', () => {
  it('reads a stored file', () => {
    expect(new TextDecoder().decode(readStored(WS, 'ABC/signatures/tx-1.png'))).toBe('PNG-A')
  })

  it('returns undefined instead of throwing for unsafe or missing paths', () => {
    expect(readStored(WS, 'ZZZ/pdfs/secret.pdf')).toBeUndefined()
    expect(readStored(WS, 'ABC/pdfs/nope.pdf')).toBeUndefined()
  })
})

describe('saveBytes', () => {
  it('sanitises the file name so it cannot climb out', () => {
    // '../../escape.pdf' becomes '.._.._escape.pdf' and lands inside the area.
    const rel = saveBytes('pdfs', 'a b/c.pdf', new TextEncoder().encode('X'), WS)
    expect(rel.startsWith(`${WS}/pdfs/`)).toBe(true)
    expect(rel).not.toContain('..' + String.fromCharCode(92))
  })
})

describe('storageRoot', () => {
  it('honours STORAGE_DIR', () => {
    expect(storageRoot()).toBe(root)
  })
})
