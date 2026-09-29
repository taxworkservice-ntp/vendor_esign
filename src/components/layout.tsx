import { Link, NavLink } from 'react-router-dom'
import { ReceiptText } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useClientAuth } from '../lib/client-auth'
import { useSettings } from '../hooks/useSettings'
import { defaultSettings } from '../lib/settings'

export function Layout({ children }: { children: React.ReactNode }) {
  const { email: clientEmail, logout: clientLogout, activeTenant } = useClientAuth()
  const { email: adminEmail, isSuperAdmin, logout: adminLogout } = useAuth()
  const { data: settings } = useSettings()
  const brand = settings ?? defaultSettings(activeTenant)
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink-900 text-white">
              <ReceiptText size={16} />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-bold">Taxwork · ใบเสร็จผู้ขาย</span>
              <span className="block text-[11px] text-ink-400">
                {brand.clientCode}-R-{brand.beYear}
              </span>
            </span>
          </Link>
          <nav className="flex items-center gap-0.5 text-[13px] font-semibold">
            <NavLink to="/" className={({ isActive }) => `rounded-lg px-3 py-2 ${isActive ? 'bg-slate-100' : 'text-ink-500 hover:text-ink-900'}`}>
              รายการ
            </NavLink>
            <NavLink to="/vendors" className={({ isActive }) => `rounded-lg px-3 py-2 ${isActive ? 'bg-slate-100' : 'text-ink-500 hover:text-ink-900'}`}>
              ผู้ขาย
            </NavLink>
            <NavLink to="/items" className={({ isActive }) => `rounded-lg px-3 py-2 ${isActive ? 'bg-slate-100' : 'text-ink-500 hover:text-ink-900'}`}>
              สินค้า/บริการ
            </NavLink>
            <NavLink to="/review" className={({ isActive }) => `rounded-lg px-3 py-2 ${isActive ? 'bg-slate-100' : 'text-ink-500 hover:text-ink-900'}`}>
              ตรวจสอบ
            </NavLink>
            <NavLink to="/metrics" className={({ isActive }) => `rounded-lg px-3 py-2 ${isActive ? 'bg-slate-100' : 'text-ink-500 hover:text-ink-900'}`}>
              ภาพรวม
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => `rounded-lg px-3 py-2 ${isActive ? 'bg-slate-100' : 'text-ink-500 hover:text-ink-900'}`}>
              ตั้งค่า
            </NavLink>
            {(isSuperAdmin || adminEmail) && (
              <NavLink to="/admin/clients" className={({ isActive }) => `rounded-lg px-3 py-2 ${isActive ? 'bg-slate-100' : 'text-ink-500 hover:text-ink-900'}`}>
                Admin
              </NavLink>
            )}
            {adminEmail && (
              <button onClick={() => void adminLogout()} className="rounded-lg px-3 py-2 text-ink-500 hover:text-ink-900" title={`admin: ${adminEmail}`}>
                ออกจากแอดมิน
              </button>
            )}
            {clientEmail ? (
              <button onClick={() => void clientLogout()} className="rounded-lg px-3 py-2 text-ink-500 hover:text-ink-900" title={clientEmail}>
                ออก
              </button>
            ) : (
              <NavLink to="/login" className="rounded-lg px-3 py-2 text-ink-500 hover:text-ink-900">
                เข้า
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="border-t border-slate-200/70">
        <p className="mx-auto max-w-screen-2xl px-4 py-5 text-xs text-ink-400 sm:px-6">
          ระบบออกใบเสร็จรับเงินสำหรับผู้ขายรายย่อย · เอกสารยกเลิกได้เท่านั้น (ไม่ลบ) · เลขที่ใบเสร็จออกเมื่อผู้ขายลงนามแล้ว
        </p>
      </footer>
    </div>
  )
}
