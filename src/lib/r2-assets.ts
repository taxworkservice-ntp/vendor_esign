import { hasServer } from './api-client'

// Client-side helpers for uploading/downloading tenant assets (signature,
// stamp) to R2 through presigned URLs. Mirrors the internal app's flow:
//
//   upload: client asks server for a PUT URL -> PUTs bytes to R2 -> saves the
//           returned storage path in settings.
//   download: client asks server for a GET URL -> uses it as the img src.

export interface R2Status {
  configured: boolean
}

export async function getR2Status(): Promise<R2Status> {
  if (!hasServer) return { configured: false }
  const r = await fetch(`${import.meta.env.VITE_API_BASE}/api/files/r2-status`, {
    credentials: 'include',
  })
  const j = (await r.json().catch(() => null)) as R2Status | null
  if (!r.ok) return { configured: false }
  return j ?? { configured: false }
}

export interface SignedUpload {
  url: string
  path: string
}

export async function signUpload(fileName: string): Promise<SignedUpload> {
  const r = await fetch(`${import.meta.env.VITE_API_BASE}/api/files/sign-upload`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName }),
  })
  const j = (await r.json().catch(() => null)) as (SignedUpload & { error?: string }) | null
  if (!r.ok) throw new Error(j?.error ?? 'sign-upload-failed')
  if (!j) throw new Error('sign-upload-failed')
  return j
}

/** Upload file bytes directly to R2 via a presigned PUT URL. */
export async function uploadToR2(url: string, file: File): Promise<void> {
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!r.ok) throw new Error('upload-failed')
}

export async function signDownload(path: string): Promise<string> {
  const r = await fetch(`${import.meta.env.VITE_API_BASE}/api/files/sign-download`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  const j = (await r.json().catch(() => null)) as ({ url: string } & { error?: string }) | null
  if (!r.ok) throw new Error(j?.error ?? 'sign-download-failed')
  if (!j) throw new Error('sign-download-failed')
  return j.url
}
