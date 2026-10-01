import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

// Local-disk storage seam. Layout mirrors future bucket names
// (slips/, signatures/, pdfs/) so a move to S3-compatible storage
// only swaps this module. Directory is gitignored.
export function storageRoot(): string {
  return process.env.STORAGE_DIR ?? join(process.cwd(), 'storage')
}

export type StorageArea = 'slips' | 'signatures' | 'pdfs'

export function saveBytes(area: StorageArea, name: string, bytes: Uint8Array, tenantId?: string): string {
  const parts = tenantId ? [tenantId, area] : [area]
  const dir = join(storageRoot(), ...parts)
  mkdirSync(dir, { recursive: true })
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_')
  writeFileSync(join(dir, safe), bytes)
  return `${parts.join('/')}/${safe}`
}

/**
 * Turn a stored relative path into an absolute one, or null if it is unsafe.
 *
 * `signature_image_path` and `pdf_path` come back from the database, so they
 * are attacker-influenced input by the time a request reaches them. Resolving
 * them naively would let `../../other-tenant/pdfs/x.pdf` (or an absolute path)
 * read outside this workspace. Checks, cheapest first:
 *
 *  1. the path must be relative, NUL-free, and free of `..` segments;
 *  2. it must be in the documented `<tenantId>/<area>/<name>` shape, with the
 *     first segment equal to the caller's workspace — so a row can never reach
 *     another workspace even if the SQL filter were wrong;
 *  3. the resolved path must still sit under `<root>/<tenantId>/`;
 *  4. it must be an existing regular file.
 *
 * Returns null for anything unsafe so callers can 404 rather than 500.
 */
export function resolveStored(tenantId: string, relPath: string | null | undefined): string | null {
  if (!tenantId || !relPath) return null
  if (isAbsolute(relPath)) return null
  if (relPath.includes('\0')) return null

  // Reject traversal on the raw string first: normalizing first would let
  // `a/../../b` collapse into something that looks clean.
  const segments = relPath.split(/[\\/]/)
  if (segments.some((s) => s === '..')) return null
  // <tenant>/<area>/<name>
  if (segments.length < 3) return null
  if (segments[0] !== tenantId) return null

  const rootAbs = resolve(storageRoot())
  const full = resolve(rootAbs, ...segments)

  // Defence in depth: must remain inside this workspace's own directory.
  const inside = relative(join(rootAbs, tenantId), full)
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) return null

  try {
    if (!existsSync(full)) return null
    if (!statSync(full).isFile()) return null
  } catch {
    return null
  }
  return full
}

/** Read a stored file, or undefined if it is missing or unsafe. */
export function readStored(tenantId: string, relPath: string | null | undefined): Uint8Array | undefined {
  const full = resolveStored(tenantId, relPath)
  if (!full) return undefined
  try {
    return readFileSync(full)
  } catch {
    return undefined
  }
}

/** The tenant's own directory, for assertions and tests. */
export function tenantDir(tenantId: string): string {
  return join(storageRoot(), tenantId) + sep
}

