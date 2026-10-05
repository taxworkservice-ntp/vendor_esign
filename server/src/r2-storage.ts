import { AwsClient } from 'aws4fetch'

// R2 (Cloudflare) storage for private artifacts (signatures, receipt PDFs,
// WHT assets) over the S3-compatible API.
//
// aws4fetch is used instead of @aws-sdk/client-s3: the AWS SDK pulls in
// @smithy/node-http-handler, whose dynamic `require('node:https')` breaks
// Vercel's ESM function bundle at import time (FUNCTION_INVOCATION_FAILED).
// aws4fetch is small, ESM-safe, and built on fetch — it runs on Node, Vercel
// and Workers alike.
//
// Falls back to null when credentials are not configured so the app still runs
// in local/dev mode without R2.

let client: AwsClient | null = null
let accountId: string | null = null

function getClient(): AwsClient | null {
  if (client) return client
  const account = process.env.R2_ACCOUNT_ID
  const accessKey = process.env.R2_ACCESS_KEY_ID
  const secretKey = process.env.R2_SECRET_ACCESS_KEY
  if (!account || !accessKey || !secretKey) return null
  accountId = account
  client = new AwsClient({
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    service: 's3',
    region: 'auto',
  })
  return client
}

export const R2_BUCKET = process.env.R2_BUCKET ?? 'vendor-esign'

export function r2Configured(): boolean {
  return getClient() !== null
}

function objectUrl(path: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com/${R2_BUCKET}/${path}`
}

/**
 * Presign via query-string signing with an explicit TTL. aws4fetch defaults
 * X-Amz-Expires to 24h, so we set it before signing to keep links short-lived.
 */
async function presign(method: 'GET' | 'PUT', path: string, expires: number): Promise<string | null> {
  const c = getClient()
  if (!c) return null
  const url = new URL(objectUrl(path))
  url.searchParams.set('X-Amz-Expires', String(expires))
  const signed = await c.sign(url.toString(), { method, aws: { signQuery: true } })
  return signed.url
}

/**
 * Issue a presigned PUT URL. The client uploads the file bytes directly to R2.
 * Returns the storage path (key) to persist alongside the tenant settings.
 */
export async function signUpload(fileName: string, tenantId: string): Promise<{ url: string; path: string } | null> {
  if (!getClient()) return null
  const path = `${tenantId}/${Date.now()}-${fileName}`
  const url = await presign('PUT', path, 600)
  return url ? { url, path } : null
}

/**
 * Issue a presigned GET URL for an existing asset. Short-lived (5 min) so the
 * WHT print page can render the image without exposing the bucket.
 */
export async function signDownload(path: string): Promise<string | null> {
  return presign('GET', path, 300)
}

/** Write bytes directly from the server (signatures, receipt PDFs). */
export async function putObject(path: string, bytes: Uint8Array, contentType?: string): Promise<boolean> {
  const c = getClient()
  if (!c) return false
  const res = await c.fetch(objectUrl(path), {
    method: 'PUT',
    body: bytes,
    headers: contentType ? { 'Content-Type': contentType } : undefined,
  })
  return res.ok
}

/** Read an object's bytes, or null when absent (or R2 is not configured). */
export async function getObject(path: string): Promise<Uint8Array | null> {
  const c = getClient()
  if (!c) return null
  try {
    const res = await c.fetch(objectUrl(path))
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

export async function deleteObject(path: string): Promise<void> {
  const c = getClient()
  if (!c) return
  try {
    await c.fetch(objectUrl(path), { method: 'DELETE' })
  } catch {
    /* best-effort */
  }
}
