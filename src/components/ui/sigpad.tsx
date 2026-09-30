import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { cn } from '../../lib/cn'
import { colors } from '../../design/tokens'

export interface SigPadHandle {
  clear: () => void
  isEmpty: () => boolean
  toPng: () => string
}

// Touch + mouse canvas pad. Empty-canvas submit is rejected by the page.
const SigPad = forwardRef<SigPadHandle, { className?: string; onDraw?: () => void }>(
  ({ className, onDraw }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawing = useRef(false)
    const strokes = useRef(0)
    // Latest callback without re-running setup: parent re-renders (typing,
    // ticking consent) must NEVER reset canvas size — that wipes the drawing.
    const onDrawRef = useRef(onDraw)
    onDrawRef.current = onDraw

    useImperativeHandle(ref, () => ({
      clear() {
        const c = canvasRef.current!
        c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
        strokes.current = 0
      },
      isEmpty: () => strokes.current === 0,
      toPng: () => canvasRef.current!.toDataURL('image/png'),
    }))

    useEffect(() => {
      const c = canvasRef.current!
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = c.getBoundingClientRect()
      c.width = rect.width * dpr
      c.height = 200 * dpr
      const ctx = c.getContext('2d')!
      ctx.scale(dpr, dpr)
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.strokeStyle = colors.ink[900]

      const pos = (e: PointerEvent) => {
        const r = c.getBoundingClientRect()
        return { x: e.clientX - r.left, y: e.clientY - r.top }
      }
      const start = (e: PointerEvent) => {
        e.preventDefault()
        drawing.current = true
        const p = pos(e)
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        c.setPointerCapture(e.pointerId)
      }
      const move = (e: PointerEvent) => {
        if (!drawing.current) return
        e.preventDefault()
        const p = pos(e)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
        strokes.current += 1
        onDrawRef.current?.()
      }
      const end = () => (drawing.current = false)
      c.addEventListener('pointerdown', start)
      c.addEventListener('pointermove', move)
      c.addEventListener('pointerup', end)
      c.addEventListener('pointercancel', end)
      return () => {
        c.removeEventListener('pointerdown', start)
        c.removeEventListener('pointermove', move)
        c.removeEventListener('pointerup', end)
        c.removeEventListener('pointercancel', end)
      }
    }, [])

    return (
      <canvas
        ref={canvasRef}
        className={cn('h-[200px] w-full touch-none rounded-control bg-white', className)}
        aria-label="ช่องลงนาม"
      />
    )
  },
)
SigPad.displayName = 'SigPad'
export default SigPad
