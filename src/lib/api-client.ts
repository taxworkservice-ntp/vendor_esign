// Thin fetch client for the client-op API. `hasServer` is true when
// VITE_API_BASE is set; hooks branch on it to run on the server or the mock.

const API = (import.meta.env.VITE_API_BASE ?? '') as string
export const hasServer = !!API

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, { credentials: 'include', ...init })
  const j = (await r.json().catch(() => null)) as (T & { error?: string }) | null
  if (!r.ok) throw new Error(j?.error ?? 'request-failed')
  return j as T
}

export function apiGet<T>(path: string): Promise<T> {
  return req<T>(path)
}

export function apiSend<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  return req<T>(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export interface DownloadedFile {
  blob: Blob
  filename: string
  /** Response headers the server attached, e.g. the PDF's SHA-256. */
  headers: Record<string, string>
}

/**
 * Fetch a binary artifact (the issued receipt PDF) and hand back the blob plus
 * whatever metadata the server attached.
 *
 * Kept separate from `req` because that one always parses JSON, and a PDF is
 * not JSON. The caller decides whether to save it, so the verification code and
 * SHA-256 can be displayed before anything reaches the filesystem.
 */
export async function apiDownload(path: string): Promise<DownloadedFile> {
  const r = await fetch(`${API}${path}`, { credentials: 'include' })
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: string } | null
    throw new Error(j?.error ?? 'download-failed')
  }
  const blob = await r.blob()
  const headers: Record<string, string> = {}
  r.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v
  })
  const disposition = headers['content-disposition'] ?? ''
  const match = /filename="?([^";]+)"?/i.exec(disposition)
  return { blob, filename: match ? match[1] : 'download', headers }
}

/** Save a blob the browser already holds. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
