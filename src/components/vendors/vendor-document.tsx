import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileImage, Trash2, Upload, X } from 'lucide-react'
import {
  fetchVendorDoc,
  removeVendorDoc,
  uploadVendorDoc,
  type DocKind,
  type DocOwner,
} from '../../lib/vendor-doc-source'
import { prepareUpload } from '../../lib/image-upload'
import { Spinner } from '../ui/spinner'
import { FieldError } from '../ui/input'

// One vendor document thumbnail, loaded on demand (never in a list payload),
// owner-only on the server, click to enlarge. Used by both the invite review and
// the vendor detail page.
//
// `editable` (vendor detail only) lets the client attach or replace a document
// the vendor never sent — e.g. a walk-in vendor's ID photo taken at the
// counter. Uploads go through the same downscale/transcode as onboarding.
// Removal is a separate, stricter grant (`canRemove`, defaults to `editable`
// so existing callers keep working); display-only mirrors of the server gates.
export function VendorDocument({
  owner,
  doc,
  label,
  hasDoc = true,
  editable = false,
  canRemove,
  onChanged,
}: {
  owner: DocOwner
  doc: DocKind
  label: string
  hasDoc?: boolean
  editable?: boolean
  canRemove?: boolean
  onChanged?: () => void
}) {
  const allowRemove = canRemove ?? editable
  const [zoom, setZoom] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const key = ['vendor-doc', owner.kind, owner.id, doc]
  const { data: src, isLoading } = useQuery({
    queryKey: key,
    enabled: hasDoc,
    staleTime: 5 * 60_000,
    queryFn: () => fetchVendorDoc(owner, doc),
  })

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key })
    onChanged?.()
  }

  const onPick = async (file: File | undefined) => {
    if (!file || owner.kind !== 'vendor') return
    setErr('')
    setBusy(true)
    try {
      const prepared = await prepareUpload(file, { name: `${doc}.jpg` })
      await uploadVendorDoc({ kind: 'vendor', id: owner.id }, doc, prepared.dataUrl)
      setConfirmingDelete(false)
      refresh()
    } catch (e) {
      setErr(
        e instanceof Error && e.message === 'unsupported-image'
          ? 'ไม่รองรับไฟล์นี้ กรุณาใช้รูป JPG/PNG'
          : 'อัปโหลดไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง',
      )
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    if (owner.kind !== 'vendor') return
    setErr('')
    setBusy(true)
    try {
      await removeVendorDoc({ kind: 'vendor', id: owner.id }, doc)
      setConfirmingDelete(false)
      refresh()
    } catch {
      setErr('ลบเอกสารไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="mb-1 text-label text-ink-500">{label}</p>
      {!hasDoc ? (
        <Placeholder label="ไม่มีไฟล์" />
      ) : isLoading ? (
        <div className="flex h-40 items-center justify-center rounded-control bg-ink-50 text-ink-400">
          <Spinner />
        </div>
      ) : !src ? (
        <Placeholder label="โหลดเอกสารไม่สำเร็จ" />
      ) : (
        <button type="button" onClick={() => setZoom(true)} className="block w-full" title="แตะเพื่อดูขนาดเต็ม">
          <img src={src} alt={label} className="h-40 w-full rounded-control border border-card-border object-cover" />
        </button>
      )}

      {editable && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="flex h-9 items-center gap-1.5 rounded-control border border-card-border bg-white px-3 text-label font-medium text-ink-700 transition hover:border-ink-300 disabled:opacity-50"
          >
            {busy ? <Spinner /> : <Upload size={14} aria-hidden />}
            {hasDoc && src ? 'เปลี่ยนรูป' : 'อัปโหลด'}
          </button>
          {hasDoc && src && allowRemove && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDelete()}
              onBlur={() => setConfirmingDelete(false)}
              className={
                confirmingDelete
                  ? 'flex h-9 items-center gap-1.5 rounded-control bg-danger px-3 text-label font-medium text-white transition disabled:opacity-50'
                  : 'flex h-9 items-center gap-1.5 rounded-control px-3 text-label font-medium text-ink-400 transition hover:bg-danger-soft hover:text-danger disabled:opacity-50'
              }
            >
              <Trash2 size={14} aria-hidden />
              {confirmingDelete ? 'ยืนยันลบ?' : 'ลบ'}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              void onPick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      )}
      {err && <FieldError msg={err} />}

      {zoom && src && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink-900/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onClick={() => setZoom(false)}
        >
          <button
            type="button"
            onClick={() => setZoom(false)}
            aria-label="ปิด"
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink-900"
          >
            <X size={20} aria-hidden />
          </button>
          <img src={src} alt={label} className="max-h-[90vh] max-w-[90vw] rounded-card object-contain" />
        </div>
      )}
    </div>
  )
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-control bg-ink-50 text-ink-400">
      <FileImage size={20} aria-hidden />
      <span className="text-label">{label}</span>
    </div>
  )
}
