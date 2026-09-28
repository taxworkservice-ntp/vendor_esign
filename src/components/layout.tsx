import { Link, NavLink } from 'react-router-dom'
import { ReceiptText } from 'lucide-react'
import { PILOT_CONFIG } from '../lib/config'

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink-900 text-white">
              <ReceiptText size={18} />
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-bold">Taxwork · ใบเสร็จผู้ขาย</span>
              <span className="block text-xs text-ink-500">
                Pilot {PILOT_CONFIG.clientCode}-R-{PILOT_CONFIG.beYear} · โอนธนาคารเท่านั้น
              </span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm font-semibold">
            <NavLink to="/" className={({ isActive }) => `rounded-lg px-3 py-2 ${isActive ? 'bg-slate-100' : 'text-ink-500 hover:text-ink-900'}`}>
              รายการ
            </NavLink>
            <NavLink to="/transactions/new" className={({ isActive }) => `rounded-lg px-3 py-2 ${isActive ? 'bg-slate-100' : 'text-ink-500 hover:text-ink-900'}`}>
              สร้างรายการ
            </NavLink>
            <NavLink to="/review" className={({ isActive }) => `rounded-lg px-3 py-2 ${isActive ? 'bg-slate-100' : 'text-ink-500 hover:text-ink-900'}`}>
              ตรวจสอบ
            </NavLink>
            <NavLink to="/metrics" className={({ isActive }) => `rounded-lg px-3 py-2 ${isActive ? 'bg-slate-100' : 'text-ink-500 hover:text-ink-900'}`}>
              Metrics
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-ink-400 sm:px-6">
        Pilot นี้ไม่ออกใบกำกับภาษี · เอกสาร void ได้เท่านั้น ห้ามลบ · หมายเลขออกเมื่อผู้ขายเซ็นเท่านั้น
      </footer>
    </div>
  )
}
