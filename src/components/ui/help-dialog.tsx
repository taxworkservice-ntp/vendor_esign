import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { HelpCircle, X } from 'lucide-react'
import { sectionsFor } from '../../lib/guide-sections'
import { Card, CardBody } from './card'
import { Button } from './button'

// Contextual help as a modal: the same content the guide page renders, shown
// over the current screen so a "?" never costs the user their place. The full
// guide stays one explicit link away for browsing.

export function HelpDialog({
  open,
  sectionId,
  kind,
  onClose,
}: {
  open: boolean
  sectionId: string
  kind: 'client' | 'admin'
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const section = sectionsFor(kind).find((s) => s.id === sectionId)
  const guidePath = kind === 'admin' ? '/admin/help' : '/help'

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <Card className="my-auto w-full max-w-lg">
        <CardBody className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary-text">
              <HelpCircle size={18} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-label text-ink-500">คู่มือการใช้งาน</p>
              <h2 id="help-dialog-title" className="text-title font-semibold">
                {section?.title ?? 'ไม่พบหัวข้อนี้'}
              </h2>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="ปิดคู่มือ"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-ink-500 transition hover:bg-ink-100"
            >
              <X size={15} aria-hidden />
            </button>
          </div>

          {section && (
            <div className="space-y-3">
              {section.intro && <p className="text-body text-ink-600">{section.intro}</p>}
              <ol className="ml-5 list-decimal space-y-1.5 text-body text-ink-700">
                {section.steps.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
              {section.note && <p className="rounded-control bg-warning-soft p-3 text-body text-warning">{section.note}</p>}
              {section.link && (
                <Link
                  to={section.link.to}
                  onClick={onClose}
                  className="inline-block text-body font-medium text-primary-text underline-offset-2 hover:underline"
                >
                  {section.link.label} →
                </Link>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-card-border pt-4">
            <Link to={guidePath} onClick={onClose} className="text-body font-medium text-primary-text underline-offset-2 hover:underline">
              เปิดคู่มือทั้งหมด →
            </Link>
            <Button variant="secondary" onClick={onClose}>
              ปิด
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
