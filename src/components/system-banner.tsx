import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Info, Megaphone, ShieldAlert, Eye } from 'lucide-react'
import { useClientAuth } from '../lib/client-auth'
import { usePlatformNotice } from '../hooks/usePlatformNotice'
import { cn } from '../lib/cn'

// Platform-wide notices shown above every shell:
//  - announcement       (operator broadcast)
//  - maintenance        (off / read-only / full)
//  - impersonation      (operator "viewing as client", with read/write + stop)

function Row({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'info' | 'warning' | 'critical' | 'primary'
  icon: typeof Info
  children: React.ReactNode
}) {
  const tones = {
    info: 'border-primary/30 bg-primary-soft text-primary-text',
    primary: 'border-primary/30 bg-primary-soft text-primary-text',
    warning: 'border-warning/30 bg-warning-soft text-warning',
    critical: 'border-danger/30 bg-danger-soft text-danger',
  } as const
  return (
    <div className={cn('flex flex-wrap items-center gap-2.5 border-b px-4 py-2.5 text-body sm:px-6', tones[tone])} role="status">
      <Icon size={16} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}

export function SystemBanner() {
  const notice = usePlatformNotice()
  const { impersonating, impersonationMode, impersonationTenant, setImpersonationMode, stopImpersonation } = useClientAuth()
  const nav = useNavigate()

  const a = notice.announcement
  const m = notice.maintenance

  return (
    <div className="no-print">
      {impersonating && (
        <Row tone="primary" icon={Eye}>
          <span>
            กำลังดูในนามลูกค้า <b>{impersonationTenant}</b> ·{' '}
            {impersonationMode === 'write' ? 'โหมดแก้ไขได้' : 'โหมดอ่านอย่างเดียว'}
          </span>
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void setImpersonationMode(impersonationMode === 'write' ? 'read' : 'write')}
              className="rounded-full border border-primary/40 px-3 py-1 text-label font-medium transition hover:bg-white/60"
            >
              {impersonationMode === 'write' ? 'กลับเป็นอ่านอย่างเดียว' : 'ขอสิทธิ์แก้ไข'}
            </button>
            <button
              type="button"
              onClick={async () => {
                await stopImpersonation()
                nav('/admin')
              }}
              className="rounded-full bg-primary px-3 py-1 text-label font-semibold text-white transition hover:brightness-110"
            >
              ออกจากการดูในนามลูกค้า
            </button>
          </span>
        </Row>
      )}

      {m.mode === 'full' && (
        <Row tone="critical" icon={ShieldAlert}>
          <b>ปิดปรับปรุงระบบ</b> — {m.message || 'ระบบอยู่ระหว่างการบำรุงรักษา กรุณาลองใหม่ภายหลัง'}
        </Row>
      )}
      {m.mode === 'read_only' && (
        <Row tone="warning" icon={AlertTriangle}>
          <b>โหมดอ่านอย่างเดียว</b> — {m.message || 'ขณะนี้ไม่สามารถบันทึกหรือแก้ไขข้อมูลได้'}
        </Row>
      )}

      {a.active && a.message && (
        <Row tone={a.level === 'critical' ? 'critical' : a.level === 'warning' ? 'warning' : 'info'} icon={a.level === 'info' ? Megaphone : AlertTriangle}>
          {a.message}
        </Row>
      )}
    </div>
  )
}
