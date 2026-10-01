import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  Landmark,
  ListOrdered,
  LogIn,
  LogOut,
  Menu,
  Package,
  ReceiptText,
  Settings as SettingsIcon,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useClientAuth } from '../lib/client-auth'
import { useSettings } from '../hooks/useSettings'
import { defaultSettings } from '../lib/settings'
import { ConfirmDialog } from './ui/confirm-dialog'
import { GlobalMonthBar } from './global-month-bar'
import { cn } from '../lib/cn'

interface NavItem {
  to: string
  label: string
  end?: boolean
  icon: LucideIcon
}

const NAV: NavItem[] = [
  { to: '/', label: 'รายการธุรกรรม', end: true, icon: ListOrdered },
  { to: '/vendors', label: 'ผู้ขาย', icon: Users },
  { to: '/items', label: 'สินค้า/บริการ', icon: Package },
  { to: '/wht', label: 'ภาษีหัก ณ ที่จ่าย', icon: Landmark },
  { to: '/metrics', label: 'ภาพรวม', icon: BarChart3 },
  { to: '/settings', label: 'ตั้งค่า', icon: SettingsIcon },
]

const LS_COLLAPSED = 'tw:sidebar-collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(LS_COLLAPSED) === '1'
  } catch {
    return false
  }
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { email: clientEmail, logout: clientLogout, activeTenant } = useClientAuth()
  const { email: adminEmail, isSuperAdmin, logout: adminLogout } = useAuth()
  const { data: settings } = useSettings()
  const brand = settings ?? defaultSettings(activeTenant)
  const [confirmLogout, setConfirmLogout] = useState<'client' | 'admin' | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const loc = useLocation()
  const showAdmin = isSuperAdmin || !!adminEmail

  useEffect(() => {
    document.title = `Taxwork · ${brand.clientCode}-R-${brand.beYear}`
  }, [brand.clientCode, brand.beYear])

  // Mobile drawer follows navigation.
  useEffect(() => {
    setMenuOpen(false)
  }, [loc.pathname])

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(LS_COLLAPSED, next ? '1' : '0')
      } catch {
        /* persistence is best-effort */
      }
      return next
    })
  }

  const runLogout = () => {
    if (confirmLogout === 'admin') void adminLogout()
    else if (confirmLogout === 'client') void clientLogout()
    setConfirmLogout(null)
  }

  // Active route reads as chosen through a tinted surface, an accent label and a
  // 2px accent rail on the leading edge — not a near-black block. The rail is
  // what actually carries the state when the sidebar is collapsed to icons,
  // where there is no room for a fill.
  const sideLink = ({ isActive }: { isActive: boolean }) =>
    cn(
      'relative flex items-center gap-3 rounded-control py-2.5 pl-3.5 pr-3 text-body transition',
      collapsed && 'justify-center px-0',
      isActive
        ? 'bg-primary-soft font-semibold text-primary-text'
        : 'font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900',
      isActive && !collapsed && 'before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary',
    )

  const navList = (onNavigate?: () => void) => (
    <nav aria-label="หลัก" className="flex flex-col gap-1">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          title={collapsed ? item.label : undefined}
          aria-label={item.label}
          onClick={onNavigate}
          className={sideLink}
        >
          <item.icon size={19} className="shrink-0" aria-hidden />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </NavLink>
      ))}
      {showAdmin && (
        <>
          {!collapsed && (
            <p className="px-3 pb-1 pt-4 text-label font-medium text-ink-400">
              ผู้ดูแลระบบ
            </p>
          )}
          {collapsed && <div className="mx-2 my-2 border-t border-card-border/70" aria-hidden />}
          <NavLink
            to="/admin/clients"
            title={collapsed ? 'ผู้ดูแลระบบ' : undefined}
            aria-label="ผู้ดูแลระบบ"
            onClick={onNavigate}
            className={sideLink}
          >
            <ShieldCheck size={19} className="shrink-0" aria-hidden />
            {!collapsed && <span className="truncate">ผู้ดูแลระบบ</span>}
          </NavLink>
        </>
      )}
    </nav>
  )

  const brandBlock = (
    <Link to="/" className={cn('flex min-w-0 items-center gap-2.5', collapsed && 'justify-center')}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-primary text-white">
        <ReceiptText size={17} aria-hidden />
      </span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-body font-semibold">Taxwork</span>
          <span className="block text-label tabular-nums text-ink-400">
            {brand.clientCode}-R-{brand.beYear}
          </span>
        </span>
      )}
    </Link>
  )

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar — sticky full-height, collapses to icon rail. */}
      <aside
        aria-label="แถบนำทาง"
        className={cn(
          'no-print sticky top-0 hidden h-screen shrink-0 flex-col border-r border-card-border/70 bg-white transition-[width] duration-200 lg:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <div className={cn('px-4 pb-4 pt-5', collapsed && 'px-0 pt-5')}>
          <div className={cn(collapsed && 'flex justify-center')}>{brandBlock}</div>
        </div>
        <div className={cn('flex-1 overflow-y-auto px-3', collapsed && 'px-2')}>{navList()}</div>
        <div className={cn('border-t border-card-border/70 p-3', collapsed && 'px-2')}>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'ขยายแถบนำทาง' : 'ย่อแถบนำทางเหลือเฉพาะไอคอน'}
            title={collapsed ? 'ขยายแถบนำทาง' : 'ย่อแถบนำทาง'}
            className={cn(
              'flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-body font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-900',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? (
              <ChevronsRight size={19} className="shrink-0" aria-hidden />
            ) : (
              <>
                <ChevronsLeft size={19} className="shrink-0" aria-hidden />
                <span className="truncate">ย่อแถบนำทาง</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile drawer — left slide-over, icon + label rows. */}
      {menuOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="ปิดเมนู"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-ink-900/40"
          />
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
            <div className="border-t border-card-border/70 p-3">
              {clientEmail || adminEmail ? (
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    setConfirmLogout(clientEmail ? 'client' : 'admin')
                  }}
                  className="flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-body font-semibold text-ink-600 transition hover:bg-ink-50"
                >
                  <LogOut size={19} className="shrink-0" aria-hidden />
                  <span className="truncate">ออกจากระบบ</span>
                </button>
              ) : (
                <NavLink
                  to="/login"
                  aria-label="เข้าสู่ระบบ"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-control px-3 py-2.5 text-body font-semibold text-ink-600 transition hover:bg-ink-50"
                >
                  <LogIn size={19} className="shrink-0" aria-hidden />
                  <span className="truncate">เข้าสู่ระบบ</span>
                </NavLink>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content column */}
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
            <Link to="/" className="flex min-w-0 items-center gap-2 lg:hidden">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-primary text-white">
                <ReceiptText size={16} aria-hidden />
              </span>
              <span className="truncate text-body font-semibold">Taxwork</span>
            </Link>

            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'ขยายแถบนำทาง' : 'ย่อแถบนำทางเหลือเฉพาะไอคอน'}
              title={collapsed ? 'ขยายแถบนำทาง' : 'ย่อแถบนำทาง'}
              className="hidden h-10 w-10 shrink-0 place-items-center rounded-control text-ink-700 transition hover:bg-ink-100 lg:grid"
            >
              {collapsed ? (
                <ChevronsRight size={20} aria-hidden />
              ) : (
                <ChevronsLeft size={20} aria-hidden />
              )}
            </button>

            <div className="flex-1" />

            <span className="hidden shrink-0 text-label tabular-nums text-ink-400 sm:block">
              {brand.clientCode}-R-{brand.beYear}
            </span>
            {adminEmail && (
              <button
                onClick={() => setConfirmLogout('admin')}
                title={`ผู้ดูแลระบบ: ${adminEmail}`}
                className="hidden shrink-0 rounded-control px-3 py-2 text-body font-medium text-ink-500 transition hover:text-ink-900 md:block"
              >
                ออกจากระบบ (ผู้ดูแลระบบ)
              </button>
            )}
            {clientEmail ? (
              <button
                onClick={() => setConfirmLogout('client')}
                title={clientEmail}
                className="hidden shrink-0 items-center gap-1.5 rounded-control px-3 py-2 text-body font-medium text-ink-500 transition hover:text-ink-900 sm:inline-flex"
              >
                <LogOut size={16} aria-hidden /> ออกจากระบบ
              </button>
            ) : (
              <NavLink
                to="/login"
                className="hidden shrink-0 items-center gap-1.5 rounded-control px-3 py-2 text-body font-medium text-ink-500 transition hover:text-ink-900 sm:inline-flex"
              >
                <LogIn size={16} aria-hidden /> เข้าสู่ระบบ
              </NavLink>
            )}
          </div>
        </header>

        <GlobalMonthBar />

        {/* Full width, no max-w. This was capped at `max-w-screen-2xl` (1536px),
            which threw away ~380px on a 1920 monitor — the widest tables in the app
            (the transaction register, min 1120px) and the 4- and 5-up stat grids are
            exactly the content that benefits. No narrow page regresses: each keeps
            its own per-page max-w (TransactionNew 6xl, Settings 4xl, VendorDetail
            3xl, VendorNew 2xl), so a form field is still a sane size to type into.

            Header, month bar and footer use the same padding and no cap, so the
            content column's left edge lines up with the chrome. */}
        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>

        <footer className="border-t border-card-border/70">
          <p className="px-4 py-5 text-label text-ink-400 sm:px-6">
            ระบบออกใบเสร็จรับเงินสำหรับผู้ขายรายย่อย · เอกสารไม่สามารถแก้ไขหรือลบได้ แต่สามารถยกเลิกได้ · เลขที่ใบเสร็จจะออกเมื่อผู้ขายลงนามและลูกค้าดำเนินการออกใบเสร็จ
          </p>
        </footer>
      </div>

      <ConfirmDialog
        open={confirmLogout !== null}
        title="ยืนยันการออกจากระบบ"
        message="ท่านต้องการออกจากระบบหรือไม่"
        confirmLabel="ออกจากระบบ"
        onConfirm={runLogout}
        onCancel={() => setConfirmLogout(null)}
      />
    </div>
  )
}
