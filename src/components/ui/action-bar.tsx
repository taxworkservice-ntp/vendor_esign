import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * Sticky bottom action bar for the public vendor links. Keeps the primary action
 * reachable while a long form scrolls, and pads above the iOS home indicator via
 * the safe-area inset. Bleeds to the page container's edges (`-mx-4`) so its top
 * border spans the full content width.
 */
export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 -mx-4 border-t border-card-border bg-white/95 px-4 pt-3 backdrop-blur',
        'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        className,
      )}
    >
      {children}
    </div>
  )
}
