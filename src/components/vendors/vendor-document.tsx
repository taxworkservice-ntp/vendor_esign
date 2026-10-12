import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileImage, X } from 'lucide-react'
import { fetchVendorDoc, type DocKind, type DocOwner } from '../../lib/vendor-doc-source'
import { Spinner } from '../ui/spinner'

// One vendor document thumbnail, loaded on demand (never in a list payload),
// owner-only on the server, click to enlarge. Used by both the invite review and
// the vendor detail page.

export function VendorDocument({
  owner,
  doc,
  label,
  hasDoc = true,
}: {
  owner: DocOwner
  doc: DocKind
  label: string
  hasDoc?: boolean
}) {
  const [zoom, setZoom] = useState(false)
  const { data: src, isLoading } = useQuery({
    queryKey: ['vendor-doc', owner.kind, owner.id, doc],
    enabled: hasDoc,
    staleTime: 5 * 60_000,
    queryFn: () => fetchVendorDoc(owner, doc),
  })

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
