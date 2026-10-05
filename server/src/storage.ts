import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { getObject, putObject, r2Configured } from './r2-storage'

// Storage seam for private artifacts (slips/, signatures/, pdfs/).
//
// Prefers Cloudflare R2 when configured — a serverless deployment has an
// ephemeral, per-instance disk, so a signature written by the instance that
// handled signing is gone when another instance later serves the receipt.
// Local disk remains the dev/test fallback. Layout mirrors the bucket keys:
// `<tenantId>/<area>/<name>`. Directory is gitignored.
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

/**
 * Persist bytes for a tenant, to R2 when configured else local disk.
 * Returns the relative path to store in the database regardless of backend.
 */
export async function saveBytesDurable(
  area: StorageArea,
  name: string,
  bytes: Uint8Array,
  tenantId: string,
): Promise<string> {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const relPath = `${tenantId}/${area}/${safe}`
  if (r2Configured()) {
    const contentType =
      area === 'pdfs' ? 'application/pdf'
        : area === 'signatures' ? 'image/png'
          : undefined
    await putObject(relPath, bytes, contentType)
    return relPath
  }
  // Serverless hosts (Vercel) have an ephemeral, per-instance disk: a file
  // written here is gone before it can be read back. Fail loudly instead of
  // silently losing a signature or a receipt PDF.
  if (process.env.VERCEL) {
    throw new Error(
      'Object storage is not configured (set R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY) — refusing to write to ephemeral disk on Vercel.',
    )
  }
  return saveBytes(area, name, bytes, tenantId)
}

/**
 * Read a stored artifact for a tenant from R2 when configured, else local disk.
 * The DB path is validated before any read so a row can never escape the tenant.
 */
export async function readStoredDurable(
  tenantId: string,
  relPath: string | null | undefined,
): Promise<Uint8Array | undefined> {
  if (!relPath) return undefined
  // Validate the shape/paths exactly as the disk reader does; for R2 the
  // `<tenantId>/<area>/<name>` key must still start with this tenant.
  if (r2Configured()) {
    const segments = relPath.split(/[\\/]/)
    if (segments.some((s) => s === '..') || segments[0] !== tenantId || segments.length < 3) {
      return undefined
    }
    const fromR2 = await getObject(relPath)
    if (fromR2) return fromR2
    // Fall through to disk: a file may pre-date R2 being enabled.
  }
  return readStored(tenantId, relPath)
}

/** The tenant's own directory, for assertions and tests. */
export function tenantDir(tenantId: string): string {
  return join(storageRoot(), tenantId) + sep
}

