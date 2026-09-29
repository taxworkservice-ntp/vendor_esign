import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useForgetVendorId, useUpdateVendor, useVendor } from '../hooks/useVendors'
import { displayTaxId } from '../lib/vendors-mock'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { Input, Label } from '../components/ui/input'

export function VendorDetail() {
  const { id } = useParams()
  const { data: v } = useVendor(id)
  const update = useUpdateVendor(id)
  const forget = useForgetVendorId()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [lineUserId, setLineUserId] = useState('')
  const [editing, setEditing] = useState(false)

  if (!v) return <p className="py-10 text-center text-body text-ink-500">กำลังโหลด…</p>
  const curName = editing && name ? name : v.name
  const curAddr = editing && address ? address : v.address

  const save = async () => {
    await update.mutateAsync({
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(address.trim() ? { address: address.trim() } : {}),
      lineUserId: (editing ? lineUserId || v.lineUserId : v.lineUserId)?.trim() || undefined,
    })
    setEditing(false)
    setName('')
    setAddress('')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title={v.name}
        sub={`${displayTaxId(v)} · ผู้ขายรายย่อย (ไม่จด VAT)`}
        actions={
          editing
            ? <Button onClick={save} disabled={update.isPending}>{update.isPending ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
            : <Button variant="secondary" onClick={() => { setLineUserId(v.lineUserId ?? ''); setEditing(true) }}>แก้ไข</Button>
        }
      />
      <Card>
        <CardBody className="space-y-4">
          <div>
            <Label>ชื่อ</Label>
            {editing
              ? <Input value={curName} onChange={(e) => setName(e.target.value)} />
              : <p className="font-semibold">{v.name}</p>}
          </div>
          <div>
            <Label>ที่อยู่</Label>
            {editing
              ? <Input value={curAddr} onChange={(e) => setAddress(e.target.value)} />
              : <p>{v.address}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>เลขบัตรประชาชน</Label>
              <p className="font-mono">{displayTaxId(v)}</p>
            </div>
            <div>
              <Label>LINE user id</Label>
              {editing
                ? <Input value={lineUserId} onChange={(e) => setLineUserId(e.target.value)} className="font-mono" />
                : <p className="font-mono">{v.lineUserId || '—'}</p>}
            </div>
          </div>
          <div className="rounded-control bg-ink-50 p-3.5 text-body">
            <Label>เลขบัตรประชาชนที่บันทึกไว้</Label>
            {v.encryptedId ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono">
                  {v.taxLast4 ? `x-xxxx-xxxxx-${v.taxLast4.slice(0, 2)}-${v.taxLast4.slice(2)}` : 'บันทึกไว้'}
                  <span className="ml-2 font-sans text-body text-emerald-700">เข้ารหัส (AES-256-GCM)</span>
                </p>
                <Button
                  variant="ghost"
                  className="h-9 px-3 text-body"
                  disabled={forget.isPending}
                  onClick={() => forget.mutate(v.id)}
                >
                  ลบเลขที่บันทึกไว้
                </Button>
              </div>
            ) : (
              <p className="text-body text-ink-500">ยังไม่บันทึก — ระบบจะบันทึกแบบเข้ารหัสอัตโนมัติเมื่อสร้างรายการแรก</p>
            )}
          </div>
          {editing && (
            <Button variant="ghost" onClick={() => setEditing(false)}>ยกเลิกการแก้ไข</Button>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
