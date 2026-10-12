import { API_BASE } from '../../lib/api-base'
import { initials } from '../../lib/brand'

// Header + footer identity for the public vendor links (onboard and sign).
// White-label: the client's logo + name own the header; the platform mark moves
// to a muted "powered by" footer.

export interface Brand {
  logoUrl?: string | null
  clientName?: string | null
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

export function BrandFooter() {
  return (
    <footer className="border-t border-card-border/70">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-5 sm:px-6">
        <img src="/logo.png" alt="" aria-hidden className="h-5 w-5 shrink-0 rounded-full object-contain" />
        <p className="text-label text-ink-400">ขับเคลื่อนโดย TW VendorSign · เอกสารและลิงก์นี้จัดทำโดยผู้ว่าจ้าง</p>
      </div>
    </footer>
  )
}
