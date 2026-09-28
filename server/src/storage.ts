import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Local-disk storage seam. Layout mirrors future bucket names
// (slips/, signatures/, pdfs/) so a move to S3-compatible storage
// only swaps this module. Directory is gitignored.
export function storageRoot(): string {
  return process.env.STORAGE_DIR ?? join(process.cwd(), 'storage')
}

export function saveBytes(area: 'slips' | 'signatures' | 'pdfs', name: string, bytes: Uint8Array): string {
  const dir = join(storageRoot(), area)
  mkdirSync(dir, { recursive: true })
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_')
  writeFileSync(join(dir, safe), bytes)
  return `${area}/${safe}`
}
