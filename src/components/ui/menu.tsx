import { ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'

// A small, dependency-free actions menu for table rows. The panel is rendered in
// a portal with fixed positioning so it is never clipped by a scrolling table,
// closes on outside-click / Escape / scroll, and returns focus to the trigger.

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

export function ActionsMenu({
  items,
  label = 'เพิ่มเติม',
  align = 'right',
}: {
  items: MenuItem[]
  label?: string
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const openMenu = () => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    setPos(
      align === 'right'
        ? { top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) }
        : { top: r.bottom + 6, left: r.left },
    )
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    // Fixed positioning is invalidated by any scroll/resize — close instead of
    // drifting away from the trigger.
    const close = () => setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  if (items.length === 0) return null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          if (open) setOpen(false)
          else openMenu()
        }}
        className="inline-flex h-9 items-center gap-1 rounded-control border border-card-border bg-white px-3 text-body font-semibold text-ink-900 transition hover:border-ink-300"
      >
        {label}
        <ChevronDown size={14} className={cn('transition', open && 'rotate-180')} aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={{ position: 'fixed', top: pos.top, left: pos.left, right: pos.right, zIndex: 60 }}
            className="min-w-44 overflow-hidden rounded-card border border-card-border bg-white py-1 shadow-overlay"
          >
            {items.map((it, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false)
                  it.onSelect()
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-body transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40',
                  it.danger ? 'text-danger' : 'text-ink-700',
                )}
              >
                {it.icon}
                <span>{it.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
