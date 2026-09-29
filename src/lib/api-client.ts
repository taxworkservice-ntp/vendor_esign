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
