// Absolute URLs into this app, built in one place.
//
// The router currently has no basename and the build has no base, so
// `location.origin` happens to be right today. Centralising it means a future
// sub-path deploy (a common way to host a client portal under
// /tenants/<code>/) only has to change this file, rather than every component
// that pastes a link into a LINE message.

function origin(): string {
  try {
    return window.location.origin
  } catch {
    return ''
  }
}

/** Absolute URL for an in-app path, e.g. appUrl('/v/tok_abc'). */
export function appUrl(path: string): string {
  const o = origin()
  if (!o) return path
  return `${o}${path.startsWith('/') ? path : `/${path}`}`
}

/** The vendor signing link for an invite token. Empty when there is no token. */
export function inviteUrl(token: string | undefined | null): string {
  return token ? appUrl(`/v/${token}`) : ''
}

/** The public verification link for a receipt code. */
export function verifyUrl(code: string | undefined | null): string {
  return code ? appUrl(`/verify/${code}`) : ''
}
