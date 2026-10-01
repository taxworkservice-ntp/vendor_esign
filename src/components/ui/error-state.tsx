import { useId } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from './button'

/**
 * Failure state for a data-backed panel. Distinct from EmptyState on purpose:
 * an empty list means "nothing matched", an error means "we do not know", and
 * collapsing the two tells a bookkeeper their ledger is empty when in fact the
 * request failed. Always offers a retry.
 */
export function ErrorState({
  title = 'โหลดข้อมูลไม่สำเร็จ',
  description = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง',
  onRetry,
  retryLabel = 'ลองอีกครั้ง',
  children,
}: {
  title?: string
  description?: string
  onRetry?: () => void
  retryLabel?: string
  children?: ReactNode
}) {
  const id = useId()
  return (
    <div className="px-4 py-14 text-center" role="alert" aria-describedby={id}>
      <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle size={20} aria-hidden />
      </span>
      <p className="font-semibold">{title}</p>
      <p id={id} className="mx-auto mt-1 max-w-sm text-body text-ink-500">
        {description}
      </p>
      {onRetry && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={onRetry}>
            <RotateCcw size={15} aria-hidden /> {retryLabel}
          </Button>
        </div>
      )}
      {children}
    </div>
  )
}
