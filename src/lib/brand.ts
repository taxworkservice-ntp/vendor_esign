// Pure branding helpers for the public vendor links (onboard + sign).

/**
 * Up to two initials from a client display name, used for the monogram shown
 * in the link header when the client has not uploaded a logo. Falls back to ''
 * for a blank name so the caller can drop the mark entirely.
 */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const first = words[0][0] ?? ''
  const last = words.length > 1 ? words[words.length - 1][0] ?? '' : ''
  return `${first}${last}`.toUpperCase().slice(0, 2)
}
