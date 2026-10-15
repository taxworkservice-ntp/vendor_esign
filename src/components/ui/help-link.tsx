import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { hasGuideAnchor } from '../../lib/guide-sections'
import { HelpDialog } from './help-dialog'
import { cn } from '../../lib/cn'

// Contextual help affordance. Sits in a PageHeader `actions` slot (an existing
// optional slot) so it never perturbs a screen's layout. Opens the matching
// guide section in a modal rather than navigating away, so the user keeps the
// page they were on. If the anchor is not a real guide section the button
// renders nothing, so a renamed guide section can never leave a dead "?"
// behind.

export function HelpLink({ to, label = 'คู่มือ', className }: { to: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const hash = to.includes('#') ? to.slice(to.indexOf('#') + 1) : ''
  const kind = to.startsWith('/admin') ? 'admin' : 'client'
  if (hash && !hasGuideAnchor(hash)) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`เปิดคู่มือ: ${label}`}
        aria-label={`เปิดคู่มือการใช้งาน: ${label}`}
        className={cn(
          'no-print inline-flex items-center gap-1.5 rounded-control px-2.5 py-2 text-body font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-900',
          className,
        )}
      >
        <HelpCircle size={16} aria-hidden /> {label}
      </button>
      <HelpDialog open={open} sectionId={hash} kind={kind} onClose={() => setOpen(false)} />
    </>
  )
}
