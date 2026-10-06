import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Download, FileStack, Loader2 } from 'lucide-react'
import { useReceiptRegister } from '../hooks/useReceiptRegister'
import { useSettings } from '../hooks/useSettings'
import { fetchReceiptAuthorization } from '../hooks/useReceiptAuthorization'
import { defaultSettings } from '../lib/settings'
import { signatureState } from '../lib/signature-state'
import { normalizeLineItem } from '../lib/line-items'
import { receiptSheetToA4PdfBytes } from '../lib/receipt-to-a4-pdf'
import { ReceiptSheet, type ReceiptSheetData } from '../components/receipt/receipt-sheet'
import { apiDownload, apiGet, hasServer, saveBlob } from '../lib/api-client'
import { documentFileName, stamp } from '../lib/download-name'
import { loadTxns } from '../lib/mock'
import type { PaymentTransaction, LineItem } from '../lib/types'
import type { ReceiptRegisterRow } from '../lib/receipts-register'
import type { ReceiptAuthorization } from '../hooks/useReceiptAuthorization'
import { Card, CardBody } from '../components/ui/card'
import { Button } from '../components/ui/button'

// Batch receipt export — one PDF per issued receipt, zipped. Each PDF is a
// raster of the same ReceiptSheet the client sees, so it matches the preview.
// A receipt whose signature image cannot be retrieved falls back to the archived
// server PDF (which embeds the signature) rather than shipping a placeholder.

interface Prepared {
  row: ReceiptRegisterRow
  data: ReceiptSheetData
  missingSig: boolean
}

async function fetchTxn(id: string): Promise<PaymentTransaction | undefined> {
  if (hasServer) {
    try {
      return (await apiGet<{ transaction: PaymentTransaction }>(`/api/client/transactions/${id}`)).transaction
    } catch {
      return undefined
    }
  }
  return loadTxns().find((t) => t.id === id)
}

function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ''
  let n = 2
  while (used.has(`${stem}-${n}${ext}`)) n++
  const name = `${stem}-${n}${ext}`
  used.add(name)
  return name
}

type Phase = 'loading' | 'ready' | 'exporting' | 'done' | 'error'

export function ReceiptsDownload() {
  const [params] = useSearchParams()
  const month = params.get('month') ?? ''
  const q = params.get('q') ?? ''
  const auto = params.get('download') === '1'
  const { data: settings } = useSettings()
  const client = settings ?? defaultSettings()

  const { data, isLoading, isError } = useReceiptRegister({ month, q, sort: 'date-desc', limit: 0, offset: 0 })
  const rows = useMemo(() => data?.receipts ?? [], [data])

  const [prepared, setPrepared] = useState<Prepared[] | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [progress, setProgress] = useState(0)
  const [fallbacks, setFallbacks] = useState(0)
  const [err, setErr] = useState('')
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const started = useRef(false)

  // Fetch each receipt's authorization + transaction, bounded to 4 in flight.
  useEffect(() => {
    if (isLoading) return
    if (isError) {
      setPhase('error')
      setErr('โหลดทะเบียนใบเสร็จไม่สำเร็จ')
      return
    }
    if (rows.length === 0) {
      setPrepared([])
      setPhase('ready')
      return
    }
    let cancelled = false
    setPhase('loading')
    ;(async () => {
      const queue = [...rows]
      const out: Prepared[] = []
      const worker = async () => {
        while (queue.length) {
          const row = queue.shift()!
          const [auth, txn] = await Promise.all([
            fetchReceiptAuthorization(row.id).catch(() => null),
            fetchTxn(row.id),
          ])
          out.push(build(row, auth, txn, client))
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker))
      if (cancelled) return
      out.sort((a, b) => (a.row.issueDate < b.row.issueDate ? 1 : a.row.issueDate > b.row.issueDate ? -1 : 0))
      setPrepared(out)
      setPhase('ready')
    })()
    return () => {
      cancelled = true
    }
    // `client` is derived from settings; re-run only when the set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, isLoading, isError])

  // Auto-run once, when opened with ?download=1.
  useEffect(() => {
    if (!auto || started.current || phase !== 'ready' || !prepared) return
    started.current = true
    void exportZip()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, phase, prepared])

  async function exportZip() {
    if (!prepared || prepared.length === 0) return
    setPhase('exporting')
    setProgress(0)
    setErr('')
    try {
      const files: Record<string, Uint8Array> = {}
      const used = new Set<string>()
      let fell = 0
      for (let i = 0; i < prepared.length; i++) {
        const p = prepared[i]
        const el = refs.current[i]
        const name = uniqueName(
          documentFileName({ number: p.row.number, vendorName: p.row.vendorName, amount: p.row.grossAmount }),
          used,
        )
        if (p.missingSig && hasServer) {
          const { blob } = await apiDownload(`/api/client/transactions/${p.row.id}/receipt.pdf`)
          files[name] = new Uint8Array(await blob.arrayBuffer())
          fell++
        } else if (el) {
          files[name] = await receiptSheetToA4PdfBytes(el)
        } else if (hasServer) {
          const { blob } = await apiDownload(`/api/client/transactions/${p.row.id}/receipt.pdf`)
          files[name] = new Uint8Array(await blob.arrayBuffer())
          fell++
        }
        setProgress(i + 1)
      }
      const { zipSync } = await import('fflate')
      const zipped = zipSync(files, { level: 0 })
      saveBlob(
        new Blob([zipped.slice().buffer], { type: 'application/zip' }),
        `receipts-${month || 'all'}-${prepared.length}-docs-${stamp()}.zip`,
      )
      setFallbacks(fell)
      setPhase('done')
    } catch {
      setPhase('error')
      setErr('สร้างไฟล์ ZIP ไม่สำเร็จ — โปรดลองใหม่อีกครั้ง')
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 py-6">
      <Card>
        <CardBody className="space-y-4 text-center">
          {phase === 'loading' && (
            <>
              <Loader2 size={28} className="mx-auto animate-spin text-ink-400" aria-hidden />
              <h1 className="text-title font-semibold">กำลังเตรียมใบเสร็จ…</h1>
              <p className="text-body text-ink-500">กำลังรวบรวมข้อมูลและลายเซ็นของใบเสร็จทั้งหมด</p>
            </>
          )}

          {phase === 'ready' && !auto && (
            <>
              <FileStack size={28} className="mx-auto text-ink-400" aria-hidden />
              <h1 className="text-title font-semibold">พร้อมดาวน์โหลด {prepared?.length ?? 0} ใบเสร็จ</h1>
              <p className="text-body text-ink-500">ไฟล์ ZIP — หนึ่ง PDF ต่อหนึ่งใบเสร็จ</p>
              <Button onClick={() => void exportZip()} disabled={!prepared?.length}>
                <Download size={16} /> ดาวน์โหลด ZIP
              </Button>
            </>
          )}

          {phase === 'exporting' && (
            <>
              <Loader2 size={28} className="mx-auto animate-spin text-ink-400" aria-hidden />
              <h1 className="text-title font-semibold">กำลังสร้างใบเสร็จ {prepared?.length ?? 0} ฉบับ…</h1>
              <div className="mx-auto h-2 w-full max-w-sm overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${prepared?.length ? Math.round((progress / prepared.length) * 100) : 0}%` }}
                />
              </div>
              <p className="text-body tabular-nums text-ink-500">
                {progress} / {prepared?.length ?? 0}
              </p>
            </>
          )}

          {phase === 'done' && (
            <>
              <CheckCircle2 size={30} className="mx-auto text-success" aria-hidden />
              <h1 className="text-title font-semibold">ดาวน์โหลดแล้ว</h1>
              <p className="text-body text-ink-500">
                {prepared?.length ?? 0} ใบเสร็จ
                {fallbacks > 0 ? ` · ${fallbacks} ใช้สำเนาเก็บถาวร` : ''}
              </p>
              <Button variant="secondary" onClick={() => window.close()}>
                ปิดหน้าต่างนี้
              </Button>
            </>
          )}

          {phase === 'error' && (
            <>
              <h1 className="text-title font-semibold text-danger">เกิดข้อผิดพลาด</h1>
              <p className="text-body text-ink-500">{err || 'ไม่สามารถสร้างไฟล์ได้'}</p>
              {prepared && prepared.length > 0 && (
                <Button onClick={() => void exportZip()}>
                  <Download size={16} /> ลองอีกครั้ง
                </Button>
              )}
            </>
          )}

          {phase === 'ready' && auto && !started.current && (
            <p className="text-body text-ink-500">กำลังเริ่มดาวน์โหลด…</p>
          )}
          {phase === 'ready' && (prepared?.length ?? 0) === 0 && (
            <p className="text-body text-ink-500">ไม่พบใบเสร็จในรอบนี้</p>
          )}
        </CardBody>
      </Card>

      {/* Offscreen sheets — the exact renderer used for download. */}
      <div aria-hidden style={{ position: 'absolute', left: '-10000px', top: 0, width: '210mm' }}>
        {prepared?.map((p, i) => (
          <ReceiptSheet
            key={p.row.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            data={p.data}
          />
        ))}
      </div>
    </div>
  )
}

function build(
  row: ReceiptRegisterRow,
  auth: ReceiptAuthorization | null,
  txn: PaymentTransaction | undefined,
  client: { displayName: string; address: string; taxId: string },
): Prepared {
  const rawItems = txn?.lineItems ?? []
  const items: LineItem[] = (rawItems.some((it) => it.description || it.amount)
    ? rawItems
    : [{ description: txn?.description ?? '', amount: txn?.grossAmount ?? row.grossAmount }]
  ).map(normalizeLineItem)
  const sig = signatureState({ status: 'issued' }, auth?.signaturePng ?? null)
  return {
    row,
    missingSig: sig.kind === 'missing',
    data: {
      number: row.number,
      transferDate: txn?.transferDate ?? row.transferDate,
      items,
      grossAmount: row.grossAmount,
      whtRate: txn?.whtRate ?? row.whtRate,
      whtAmount: row.whtAmount,
      netAmount: row.netAmount,
      note: txn?.note,
      client: { displayName: client.displayName, address: client.address, taxId: client.taxId },
      vendor: {
        prefix: auth?.vendorPrefix || txn?.vendor.prefix,
        name: auth?.vendorName || txn?.vendor.name || row.vendorName || '',
        address: auth?.vendorAddress || txn?.vendor.address || '',
        phone: auth?.vendorPhone || txn?.vendor.phone,
        email: auth?.vendorEmail || txn?.vendor.email,
        taxId: txn?.vendor.taxId,
        maskedId: txn?.vendor.maskedId ?? '',
      },
      sig,
      signedAt: auth?.signedAt,
    },
  }
}
