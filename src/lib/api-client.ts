// Thin fetch client for the client-op API. `hasServer` is true when
// VITE_API_BASE is set; hooks branch on it to run on the server or the mock.

import { API_BASE } from './api-base'

const API = API_BASE
export const hasServer = !!API

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, { credentials: 'include', ...init })
  const j = (await r.json().catch(() => null)) as (T & { error?: string }) | null
  if (!r.ok) {
    // Attach the HTTP status so callers can tell "not found" (404/410) from a
    // transient 5xx / network failure and offer the right recovery.
    const err = new Error(j?.error ?? 'request-failed') as Error & { status?: number }
    err.status = r.status
    throw err
  }
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

/**
 * True on iOS/iPadOS. Takes its inputs as arguments (defaulting to the live
 * navigator) so the detection is unit-testable in Node.
 */
export function isIOSDevice(
  ua: string = typeof navigator === 'undefined' ? '' : (navigator.userAgent ?? ''),
  platform: string = typeof navigator === 'undefined' ? '' : (navigator.platform ?? ''),
  maxTouchPoints: number =
    typeof navigator === 'undefined' ? 0 : ((navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0),
): boolean {
  if (/iPad|iPhone|iPod/.test(ua)) return true
  // iPadOS 13+ reports a desktop "Macintosh" UA; touch points give it away.
  return /Macintosh/.test(ua) && /Mac/.test(platform) && maxTouchPoints > 1
}

function canNativeShare(file: File): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

export type SaveOutcome = 'shared' | 'downloaded' | 'opened' | 'dismissed'

/**
 * Hand a generated file to the user on any platform.
 *
 * A plain `<a download>` over a blob URL is silently downgraded by iOS Safari
 * to an in-place preview (the reported "cannot download" bug), so on mobile we
 * prefer the native share sheet ("Save to Files" / AirDrop / LINE…), and on iOS
 * fall back to a new tab whose viewer offers its own Share/Save. Desktop keeps
 * the classic anchor download. `'dismissed'` means the user cancelled the share
 * sheet — not an error, so callers must not toast it.
 */
export async function saveFile(blob: Blob, filename: string, mime = 'application/pdf'): Promise<SaveOutcome> {
  let file: File | null = null
  try {
    file = new File([blob], filename, { type: mime || blob.type })
  } catch {
    file = null
  }

  const coarse =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  if (file && (coarse || isIOSDevice()) && canNativeShare(file)) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'dismissed'
      // A real failure (e.g. activation lapsed after a slow render) — continue
      // to the platform fallback instead of surfacing a scary error.
    }
  }

  const url = URL.createObjectURL(blob)
  if (isIOSDevice()) {
    // The viewer tab carries Share/Save; keep the URL alive for it.
    const w = window.open(url, '_blank', 'noopener')
    if (w) {
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      return 'opened'
    }
  }
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return 'downloaded'
}
