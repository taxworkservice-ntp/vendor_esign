import { Link } from 'react-router-dom'
import { HelpCircle } from 'lucide-react'
import { hasGuideAnchor } from '../../lib/guide-sections'
import { cn } from '../../lib/cn'

// Contextual help affordance. Sits in a PageHeader `actions` slot (an existing
// optional slot) so it never perturbs a screen's layout. If the anchor is not a
// real guide section the link renders nothing, so a renamed guide section can
// never leave a dead "?" button behind.

export function HelpLink({ to, label = 'คู่มือ', className }: { to: string; label?: string; className?: string }) {
  const hash = to.includes('#') ? to.slice(to.indexOf('#') + 1) : ''
  if (hash && !hasGuideAnchor(hash)) return null

  return (
    <Link
      to={to}
      title={`เปิดคู่มือ: ${label}`}
      aria-label={`เปิดคู่มือการใช้งาน: ${label}`}
      className={cn(
        'no-print inline-flex items-center gap-1.5 rounded-control px-2.5 py-2 text-body font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-900',
        className,
      )}
    >
      <HelpCircle size={16} aria-hidden /> {label}
    </Link>
  )
}
