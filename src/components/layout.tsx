import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu, ReceiptText, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useClientAuth } from '../lib/client-auth'
import { useSettings } from '../hooks/useSettings'
import { defaultSettings } from '../lib/settings'
import { ConfirmDialog } from './ui/confirm-dialog'
import { cn } from '../lib/cn'

const NAV = [
  { to: '/', label: 'รายการธุรกรรม', end: true },
  { to: '/vendors', label: 'ผู้ขาย' },
  { to: '/items', label: 'สินค้า/บริการ' },
  { to: '/wht', label: 'ภาษีหัก ณ ที่จ่าย' },
  { to: '/metrics', label: 'ภาพรวม' },
  { to: '/settings', label: 'ตั้งค่า' },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const { email: clientEmail, logout: clientLogout, activeTenant } = useClientAuth()
  const { email: adminEmail, isSuperAdmin, logout: adminLogout } = useAuth()
  const { data: settings } = useSettings()
  const brand = settings ?? defaultSettings(activeTenant)
  const [confirmLogout, setConfirmLogout] = useState<'client' | 'admin' | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const showAdmin = isSuperAdmin || !!adminEmail

  useEffect(() => {
    document.title = `Taxwork · ${brand.clientCode}-R-${brand.beYear}`
  }, [brand.clientCode, brand.beYear])

  const runLogout = () => {
    if (confirmLogout === 'admin') void adminLogout()
    else if (confirmLogout === 'client') void clientLogout()
    setConfirmLogout(null)
  }

  const desktopLink = ({ isActive }: { isActive: boolean }) =>
    cn('rounded-control px-3 py-2 transition', isActive ? 'bg-ink-100 text-ink-900' : 'text-ink-500 hover:text-ink-900')
  const mobileLink = ({ isActive }: { isActive: boolean }) =>
    cn('rounded-control px-3 py-2.5 transition', isActive ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-50')

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-card-border/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-ink-900 text-white">
              <ReceiptText size={16} />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-body font-semibold">Taxwork<span className="hidden sm:inline"> · ระบบใบเสร็จรับเงินผู้ขาย</span></span>
              <span className="block text-label text-ink-400">{brand.clientCode}-R-{brand.beYear}</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-0.5 text-body font-semibold lg:flex">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={desktopLink}>
                {item.label}
              </NavLink>
            ))}
            {showAdmin && (
              <NavLink to="/admin/clients" className={desktopLink}>
                ผู้ดูแลระบบ
              </NavLink>
            )}
            {adminEmail && (
              <button onClick={() => setConfirmLogout('admin')} className="rounded-control px-3 py-2 text-ink-500 transition hover:text-ink-900" title={`ผู้ดูแลระบบ: ${adminEmail}`}>
                ออกจากระบบ (ผู้ดูแลระบบ)
              </button>
            )}
            {clientEmail ? (
              <button onClick={() => setConfirmLogout('client')} className="rounded-control px-3 py-2 text-ink-500 transition hover:text-ink-900" title={clientEmail}>
                ออกจากระบบ
              </button>
            ) : (
              <NavLink to="/login" className={desktopLink}>
                เข้าสู่ระบบ
              </NavLink>
            )}
          </nav>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
            aria-expanded={menuOpen}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-control text-ink-700 transition hover:bg-ink-100 lg:hidden"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-card-border/70 bg-white lg:hidden">
            <nav className="mx-auto flex max-w-screen-2xl flex-col gap-1 px-4 py-3 text-body font-semibold sm:px-6">
              {NAV.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={mobileLink} onClick={() => setMenuOpen(false)}>
                  {item.label}
                </NavLink>
              ))}
              {showAdmin && (
                <NavLink to="/admin/clients" className={mobileLink} onClick={() => setMenuOpen(false)}>
                  ผู้ดูแลระบบ
                </NavLink>
              )}
              <div className="my-1 border-t border-card-border/70" />
              {clientEmail || adminEmail ? (
                <button
                  onClick={() => { setMenuOpen(false); setConfirmLogout(clientEmail ? 'client' : 'admin') }}
                  className="rounded-control px-3 py-2.5 text-left text-ink-600 transition hover:bg-ink-50"
                >
                  ออกจากระบบ
                </button>
              ) : (
                <NavLink to="/login" className={mobileLink} onClick={() => setMenuOpen(false)}>
                  เข้าสู่ระบบ
                </NavLink>
              )}
            </nav>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="border-t border-card-border/70">
        <p className="mx-auto max-w-screen-2xl px-4 py-5 text-label text-ink-400 sm:px-6">
          ระบบออกใบเสร็จรับเงินสำหรับผู้ขายรายย่อย · เอกสารไม่สามารถแก้ไขหรือลบได้ แต่สามารถยกเลิกได้ · เลขที่ใบเสร็จจะออกเมื่อผู้ขายลงนามและลูกค้าดำเนินการออกใบเสร็จ
        </p>
      </footer>

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
