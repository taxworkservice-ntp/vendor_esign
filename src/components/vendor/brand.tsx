import { API_BASE } from '../../lib/api-base'
import { initials } from '../../lib/brand'

// Header identity for the public vendor links (onboard and sign), two-tier:
//   1. BrandBar   — the platform's slim app bar at the very top (TW VendorSign).
//   2. BrandHeader — the client's own identity row beneath it (logo + name).
// The tenant still owns the document's visual identity; the platform owns the
// shell, like a white-label SaaS app.

export interface Brand {
  logoUrl?: string | null
  clientName?: string | null
}

export function BrandBar() {
  return (
    <header role="banner" className="sticky top-0 z-10 border-b border-card-border/70 bg-white/95 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
        <img src="/logo.png" alt="" aria-hidden className="h-8 w-8 shrink-0 rounded-full object-contain" />
        <span className="truncate text-body font-semibold">TW VendorSign</span>
      </div>
    </header>
  )
}

export function BrandHeader({ brand, title, subtitle }: { brand?: Brand; title?: string; subtitle?: string }) {
  const name = (brand?.clientName ?? '').trim()
  const logo = brand?.logoUrl ? `${API_BASE}${brand.logoUrl}` : null

  return (
    <div className="mb-6 flex items-center gap-2.5">
      {logo ? (
        <img src={logo} alt="" aria-hidden className="h-9 w-9 shrink-0 rounded-full object-contain" />
      ) : name ? (
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-label font-semibold text-white"
        >
          {initials(name)}
        </span>
      ) : (
        <img src="/logo.png" alt="" aria-hidden className="h-9 w-9 shrink-0 rounded-full object-contain" />
      )}
      <div className="min-w-0 leading-tight">
        <p className="truncate text-title font-semibold tracking-tight">{name || 'TW VendorSign'}</p>
        {title && <p className="truncate text-body text-ink-600">{title}</p>}
        {subtitle && <p className="truncate text-label text-ink-500">{subtitle}</p>}
      </div>
    </div>
  )
}
