import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Search, UserPlus } from 'lucide-react'
import { matchesVendorQuery } from '../lib/vendor-match'
import { displayTaxId, type ClientVendor } from '../lib/vendors-mock'
import { inputCls } from './ui/input'
import { cn } from '../lib/cn'

// Searchable vendor selector. Searches name, address, and tax ID; keyboard
// navigable; offers an add-vendor shortcut when nothing matches.
export function VendorPicker({
  vendors,
  value,
  onChange,
  addHref = '/vendors/new',
  allowAdd = true,
  compact = false,
}: {
  vendors: ClientVendor[]
  value?: string
  onChange: (vendorId: string) => void
  addHref?: string
  allowAdd?: boolean
  compact?: boolean
}) {
  const selected = vendors.find((v) => v.id === value)
  const [searching, setSearching] = useState(!selected)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(
    () => vendors.filter((v) => matchesVendorQuery(v, query)).slice(0, 8),
    [vendors, query],
  )

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (v: ClientVendor) => {
    onChange(v.id)
    setSearching(false)
    setQuery('')
    setOpen(false)
  }

  const startSearch = () => {
    setSearching(true)
    setQuery('')
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && matches[active]) {
        e.preventDefault()
        pick(matches[active])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      if (selected) setSearching(false)
    }
  }

  if (selected && !searching) {
    if (compact) {
      return (
        <div className="flex h-11 items-center justify-between gap-2 rounded-control border border-card-border bg-white px-3.5">
          <span className="truncate text-body">{selected.name}</span>
          <button
            type="button"
            onClick={startSearch}
            className="shrink-0 rounded-control px-2 py-1 text-body font-semibold text-ink-700 hover:bg-ink-100"
          >
            เปลี่ยนผู้ขาย
          </button>
        </div>
      )
    }
    return (
      <div className="rounded-control border border-card-border bg-white p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-semibold">
              <Check size={15} className="text-emerald-600" /> {selected.name}
            </p>
            <p className="mt-0.5 truncate text-body text-ink-500">{selected.address}</p>
            <p className="mt-0.5 font-mono text-label text-ink-400">เลขบัตร {displayTaxId(selected)}</p>
          </div>
          <button
            type="button"
            onClick={startSearch}
            className="shrink-0 rounded-control px-2.5 py-1.5 text-body font-semibold text-ink-700 hover:bg-ink-100"
          >
            เปลี่ยนผู้ขาย
          </button>
        </div>
        {allowAdd && (
          <Link to={addHref} className="mt-2 inline-block text-body font-semibold text-ink-700 underline">
            + เพิ่มผู้ขายใหม่
          </Link>
        )}
      </div>
    )
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls="vendor-picker-list"
          aria-activedescendant={open && matches[active] ? `vendor-opt-${matches[active].id}` : undefined}
          className={cn(inputCls, 'pl-10')}
          placeholder="ค้นหาผู้ขายจากชื่อ / เลขบัตร…"
          value={query}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>

      {open && (
        <ul
          id="vendor-picker-list"
          role="listbox"
          className="absolute z-20 mt-1.5 max-h-72 w-full overflow-auto rounded-control border border-card-border bg-white p-1.5 shadow-lg"
        >
          {matches.map((v, i) => (
            <li
              key={v.id}
              id={`vendor-opt-${v.id}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(v)
              }}
              className={cn(
                'cursor-pointer rounded-control px-3 py-2.5',
                i === active ? 'bg-ink-100' : 'hover:bg-ink-50',
              )}
            >
              <p className="font-semibold leading-snug">{v.name}</p>
              <p className="mt-0.5 truncate text-body text-ink-500">{v.address}</p>
              <p className="mt-0.5 font-mono text-label text-ink-400">{displayTaxId(v)}</p>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-3 py-3 text-body text-ink-500">
              ไม่พบผู้ขาย
              {allowAdd && (
                <Link to={addHref} className="ml-2 inline-flex items-center gap-1 font-semibold text-ink-800 underline">
                  <UserPlus size={14} /> เพิ่มผู้ขายใหม่
                </Link>
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
