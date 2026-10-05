import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  Building2,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings as SettingsIcon,
  ShieldCheck,
  UserCircle,
  Users,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { SystemBanner } from '../system-banner'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { cn } from '../../lib/cn'

// The provider/operator workspace shell. Deliberately separate from the client
// portal's Layout: different nav, different brand, no client chrome. The same
// design system, so it reads as the same product.

interface NavItem {
  to: string
  label: string
  end?: boolean
  icon: LucideIcon
}

const NAV: NavItem[] = [
  { to: '/admin', label: 'แดชบอร์ด', end: true, icon: LayoutDashboard },
  { to: '/admin/clients', label: 'ลูกค้า', icon: Building2 },
  { to: '/admin/users', label: 'ผู้ใช้ทั้งหมด', icon: Users },
  { to: '/admin/audit', label: 'บันทึกกิจกรรม', icon: ScrollText },
  { to: '/admin/settings', label: 'ตั้งค่าระบบ', icon: SettingsIcon },
  { to: '/admin/account', label: 'บัญชีของฉัน', icon: UserCircle },
]

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const loc = useLocation()

  useEffect(() => {
    document.title = 'Taxwork · คอนโซลผู้ให้บริการ'
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [loc.pathname])

  const sideLink = ({ isActive }: { isActive: boolean }) =>
    cn(
      'relative flex items-center gap-3 rounded-control py-2.5 pl-3.5 pr-3 text-body transition',
      isActive
        ? 'bg-primary-soft font-semibold text-primary-text'
        : 'font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900',
      isActive && 'before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary',
    )

  const navList = (onNavigate?: () => void) => (
    <nav aria-label="คอนโซลผู้ให้บริการ" className="flex flex-col gap-1">
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate} className={sideLink}>
          <item.icon size={19} className="shrink-0" aria-hidden />
          <span className="truncate">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )

  const brandBlock = (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-ink-900 text-white">
        <ShieldCheck size={17} aria-hidden />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-body font-semibold">Taxwork</span>
        <span className="block text-label text-ink-400">ผู้ให้บริการ</span>
      </span>
    </div>
  )

  const logoutButton = (
    <button
      type="button"
      onClick={() => setConfirmLogout(true)}
      title={email ?? undefined}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-control px-3 py-2 text-body font-medium text-ink-500 transition hover:text-ink-900"
    >
      <LogOut size={16} aria-hidden /> ออกจากระบบ
    </button>
  )

  return (
    <div className="flex min-h-screen bg-paper">
      {/* Desktop sidebar */}
      <aside
        aria-label="แถบนำทางผู้ให้บริการ"
        className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-card-border/70 bg-white lg:flex"
      >
        <div className="px-4 pb-4 pt-5">{brandBlock}</div>
        <div className="flex-1 overflow-y-auto px-3">{navList()}</div>
        <div className="border-t border-card-border/70 p-3">
          <Link
            to="/"
            className="flex items-center gap-3 rounded-control px-3 py-2.5 text-body font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
          >
            <LayoutDashboard size={18} className="shrink-0" aria-hidden />
            <span className="truncate">พอร์ทัลลูกค้า</span>
          </Link>
        </div>
      </aside>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="ปิดเมนู" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-ink-900/40" />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-overlay">
            <div className="flex items-center justify-between gap-2 px-4 pb-4 pt-5">
              {brandBlock}
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="ปิดเมนู"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-control text-ink-700 transition hover:bg-ink-100"
              >
                <X size={20} aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3">{navList(() => setMenuOpen(false))}</div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-card-border/70 bg-white/90 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="เปิดเมนู"
              aria-expanded={menuOpen}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-control text-ink-700 transition hover:bg-ink-100 lg:hidden"
            >
              <Menu size={20} aria-hidden />
            </button>
            <span className="flex items-center gap-2 truncate text-body font-semibold">
              <ShieldCheck size={16} className="text-ink-400" aria-hidden /> คอนโซลผู้ให้บริการ
            </span>
            <div className="flex-1" />
            <span className="hidden shrink-0 text-label text-ink-400 sm:block">{email}</span>
            {logoutButton}
          </div>
        </header>

        <SystemBanner />

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>

        <footer className="border-t border-card-border/70">
          <p className="px-4 py-5 text-label text-ink-400 sm:px-6">
            คอนโซลผู้ให้บริการ · จัดการลูกค้า ผู้ใช้ และการตั้งค่าระบบทั้งแพลตฟอร์ม
          </p>
        </footer>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        title="ยืนยันการออกจากระบบ"
        message="ท่านต้องการออกจากระบบผู้ให้บริการหรือไม่"
        confirmLabel="ออกจากระบบ"
        onConfirm={() => {
          setConfirmLogout(false)
          void logout()
        }}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  )
}
