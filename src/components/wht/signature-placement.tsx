import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus, Plus, RotateCcw, Save } from 'lucide-react'
import { PAGE_H, PAGE_W, type Placement } from '../../lib/wht-form'
import { Input } from '../ui/input'
import { Button } from '../ui/button'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * An absolutely-positioned image on the WHT preview that can be dragged when
 * `editable`. The sheet renders at 1:1 form pixels, but the ratio is measured so
 * dragging stays correct if a browser/zoom scales it. Moves are reported upward
 * so the placement is shared across every sheet in the batch.
 */
export function PositionableImage({
  url,
  label,
  placement,
  editable,
  opacity,
  dataRole,
  onChange,
}: {
  url: string
  label: string
  placement: Placement
  editable: boolean
  opacity?: number
  /** Marks the image so the exporter can draw it itself instead of inlining it. */
  dataRole?: string
  onChange: (p: Placement) => void
}) {
  const onPointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    if (!editable) return
    e.preventDefault()
    const sheet = e.currentTarget.closest('.print-sheet') as HTMLElement | null
    if (!sheet) return
    const rect = sheet.getBoundingClientRect()
    const sx = PAGE_W / rect.width
    const sy = PAGE_H / rect.height
    const startX = e.clientX
    const startY = e.clientY
    const start = { ...placement }
    const move = (ev: PointerEvent) => {
      const x = clamp(start.x + (ev.clientX - startX) * sx, 0, PAGE_W - start.w)
      const y = clamp(start.y + (ev.clientY - startY) * sy, 0, PAGE_H - start.h)
      onChange({ ...start, x: Math.round(x), y: Math.round(y) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <img
      src={url}
      alt={label}
      data-role={dataRole}
      draggable={false}
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute',
        left: placement.x,
        top: placement.y,
        width: placement.w,
        height: placement.h,
        objectFit: 'contain',
        opacity: opacity ?? 1,
        cursor: editable ? 'grab' : 'default',
        touchAction: editable ? 'none' : undefined,
        outline: editable ? '1.5px dashed rgba(0,117,222,0.6)' : undefined,
      }}
    />
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-label text-ink-500">{label}</span>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.round(Number(e.target.value) || 0))}
        className="h-9 w-20 text-right tabular-nums"
        inputMode="numeric"
      />
    </label>
  )
}

function Nudge({ p, onChange }: { p: Placement; onChange: (p: Placement) => void }) {
  const nudge = (dx: number, dy: number) =>
    onChange({ ...p, x: clamp(p.x + dx, 0, PAGE_W - p.w), y: clamp(p.y + dy, 0, PAGE_H - p.h) })
  const size = (dw: number, dh: number) =>
    onChange({ ...p, w: clamp(p.w + dw, 20, PAGE_W), h: clamp(p.h + dh, 20, PAGE_H) })
  const btn = 'grid h-8 w-8 place-items-center rounded-control border border-card-border text-ink-600 transition hover:bg-ink-100'
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className={btn} aria-label="ขึ้น" title="ขึ้น" onClick={() => nudge(0, -1)}><ArrowUp size={14} /></button>
      <button type="button" className={btn} aria-label="ลง" title="ลง" onClick={() => nudge(0, 1)}><ArrowDown size={14} /></button>
      <button type="button" className={btn} aria-label="ซ้าย" title="ซ้าย" onClick={() => nudge(-1, 0)}><ArrowLeft size={14} /></button>
      <button type="button" className={btn} aria-label="ขวา" title="ขวา" onClick={() => nudge(1, 0)}><ArrowRight size={14} /></button>
      <span className="mx-1 h-4 w-px bg-card-border" aria-hidden />
      <button type="button" className={btn} aria-label="ลดขนาด" title="ลดขนาด" onClick={() => size(-10, -10)}><Minus size={14} /></button>
      <button type="button" className={btn} aria-label="เพิ่มขนาด" title="เพิ่มขนาด" onClick={() => size(10, 10)}><Plus size={14} /></button>
    </div>
  )
}

function Row({
  title,
  present,
  p,
  onChange,
}: {
  title: string
  present: boolean
  p: Placement
  onChange: (p: Placement) => void
}) {
  return (
    <div className="space-y-2 rounded-control border border-card-border p-3">
      <div className="flex items-center justify-between">
        <p className="text-body font-semibold">{title}</p>
        {!present && <span className="text-label text-ink-400">ยังไม่ได้อัปโหลด — ปรับตำแหน่งได้หลังอัปโหลด</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <NumberField label="X" value={p.x} onChange={(x) => onChange({ ...p, x: clamp(x, 0, PAGE_W - p.w) })} />
        <NumberField label="Y" value={p.y} onChange={(y) => onChange({ ...p, y: clamp(y, 0, PAGE_H - p.h) })} />
        <NumberField label="กว้าง" value={p.w} onChange={(w) => onChange({ ...p, w: clamp(w, 20, PAGE_W) })} />
        <NumberField label="สูง" value={p.h} onChange={(h) => onChange({ ...p, h: clamp(h, 20, PAGE_H) })} />
      </div>
      <Nudge p={p} onChange={onChange} />
    </div>
  )
}

/** Controls for positioning the signature/stamp on the WHT form. */
export function SignaturePlacementPanel({
  signature,
  stamp,
  hasSignature,
  hasStamp,
  onChangeSignature,
  onChangeStamp,
  onReset,
  onSave,
  saving,
}: {
  signature: Placement
  stamp: Placement
  hasSignature: boolean
  hasStamp: boolean
  onChangeSignature: (p: Placement) => void
  onChangeStamp: (p: Placement) => void
  onReset: () => void
  onSave: () => void
  saving: boolean
}) {
  return (
    <div className="space-y-3 rounded-card border border-card-border bg-white p-4">
      <p className="text-body text-ink-500">
        ลากลายเซ็น/ตราประทับบนฟอร์มเพื่อย้าย หรือปรับค่าด้านล่าง แล้วกด “บันทึกตำแหน่ง” เพื่อใช้กับการพิมพ์ WHT ครั้งต่อไป
      </p>
      <Row title="ลายเซ็นผู้มีอำนาจ" present={hasSignature} p={signature} onChange={onChangeSignature} />
      <Row title="ตราประทับ" present={hasStamp} p={stamp} onChange={onChangeStamp} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onReset}><RotateCcw size={15} /> รีเซ็ต</Button>
        <Button onClick={onSave} loading={saving}><Save size={15} /> บันทึกตำแหน่ง</Button>
      </div>
    </div>
  )
}
