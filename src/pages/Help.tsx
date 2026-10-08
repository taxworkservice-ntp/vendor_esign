import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Search } from 'lucide-react'
import { PageHeader } from '../components/ui/page-header'
import { Card, CardBody } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { EmptyState } from '../components/ui/empty-state'
import { sectionsFor, type GuideSection } from '../lib/guide-sections'

// In-app user guide. Content lives in src/lib/guide-sections.ts; this page only
// renders + filters it. Kept static (no data fetching) so it cannot fail or
// block. The client and admin consoles share it via the `kind` prop.

export function Help({ kind }: { kind: 'client' | 'admin' }) {
  const sections = sectionsFor(kind)
  const [q, setQ] = useState('')
  const loc = useLocation()

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return sections
    return sections.filter((s) =>
      [s.title, s.intro ?? '', ...s.steps, s.note ?? ''].join(' ').toLowerCase().includes(needle),
    )
  }, [sections, q])

  // Deep links (/help#wht) and TOC jumps scroll to the section.
  useEffect(() => {
    const id = loc.hash.replace('#', '')
    if (!id) return
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [loc.hash])

  const jump = (id: string) => {
    setQ('')
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="คู่มือการใช้งาน"
        sub={kind === 'admin' ? 'วิธีใช้งานคอนโซลผู้ให้บริการ' : 'วิธีใช้งานระบบออกใบเสร็จรับเงินผู้ขาย'}
      />

      <Card className="no-print">
        <CardBody className="space-y-3">
          <div className="relative">
            <label htmlFor="guide-search" className="sr-only">
              ค้นหาคู่มือ
            </label>
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
            <Input
              id="guide-search"
              className="pl-10"
              placeholder="ค้นหาหัวข้อ เช่น ออกใบเสร็จ, ยกเลิก, ภาษี…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {!q && (
            <nav aria-label="สารบัญ">
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-body">
                {sections.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => jump(s.id)}
                      className="text-primary-text underline-offset-2 hover:underline"
                    >
                      {s.title}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </CardBody>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState icon={Search} title="ไม่พบหัวข้อที่ค้นหา" description="ลองพิมพ์คำอื่น หรือล้างคำค้นหา" />
      ) : (
        <div className="space-y-4">
          {filtered.map((s) => (
            <Section key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  )
}

function Section({ s }: { s: GuideSection }) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <h2 id={s.id} className="scroll-mt-24 text-title font-semibold">
          {s.title}
        </h2>
        {s.intro && <p className="text-body text-ink-600">{s.intro}</p>}
        <ol className="ml-5 list-decimal space-y-1.5 text-body text-ink-700">
          {s.steps.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
        {s.note && <p className="rounded-control bg-warning-soft p-3 text-body text-warning">{s.note}</p>}
        {s.link && (
          <Link to={s.link.to} className="inline-block text-body font-medium text-primary-text underline-offset-2 hover:underline">
            {s.link.label} →
          </Link>
        )}
      </CardBody>
    </Card>
  )
}
