import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// R2 (Cloudflare) storage for client-uploaded assets such as the signature
// image and company stamp that appear on WHT forms. Uses the S3-compatible
// API — same shape as the internal app (lib/r2.ts), just a separate bucket.
//
// Falls back to null when credentials are not configured so the app still runs
// in local/dev mode without R2.

let client: S3Client | null = null

function getClient(): S3Client | null {
  if (client) return client
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKey = process.env.R2_ACCESS_KEY_ID
  const secretKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKey || !secretKey) return null
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  })
  return client
}

export const R2_BUCKET = process.env.R2_BUCKET ?? 'vendor-esign-assets'

export function r2Configured(): boolean {
  return getClient() !== null
}

/**
 * Issue a presigned PUT URL. The client uploads the file bytes directly to R2.
 * Returns the storage path (key) to persist alongside the tenant settings.
 */
export async function signUpload(fileName: string, tenantId: string): Promise<{ url: string; path: string } | null> {
  const c = getClient()
  if (!c) return null
  const path = `${tenantId}/${Date.now()}-${fileName}`
  const url = await getSignedUrl(c, new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: path,
  }), { expiresIn: 600 })
  return { url, path }
}

/**
 * Issue a presigned GET URL for an existing asset. Short-lived (5 min) so the
 * WHT print page can render the image without exposing the bucket.
 */
export async function signDownload(path: string): Promise<string | null> {
  const c = getClient()
  if (!c) return null
  return getSignedUrl(c, new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: path,
  }), { expiresIn: 300 })
}
