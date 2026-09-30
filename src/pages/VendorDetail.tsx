import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDeleteVendor, useForgetVendorId, useUpdateVendor, useVendor } from '../hooks/useVendors'
import { displayTaxId } from '../lib/vendors-mock'
import { VENDOR_PREFIXES, isVendorPrefix, prefixRequired, vendorDisplayName } from '../lib/vendor-name'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { FieldError, Input, Label } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { ConfirmDialog } from '../components/ui/confirm-dialog'

export function VendorDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data: v } = useVendor(id)
  const update = useUpdateVendor(id)
  const forget = useForgetVendorId()
  const del = useDeleteVendor()
  const [prefix, setPrefix] = useState('')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [newTaxId, setNewTaxId] = useState('')
  const [lineUserId, setLineUserId] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [editing, setEditing] = useState(false)
  const [err, setErr] = useState('')
  const [deleteErr, setDeleteErr] = useState('')
  const [confirmForget, setConfirmForget] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!v) return <p className="py-10 text-center text-body text-ink-500">กำลังโหลด…</p>

  const startEdit = () => {
    setPrefix(v.prefix ?? '')
    setName(v.name)
    setAddress(v.address)
    setNewTaxId('')
    setLineUserId(v.lineUserId ?? '')
    setPhone(v.phone ?? '')
    setEmail(v.email ?? '')
    setErr('')
    setEditing(true)
  }

  const save = async () => {
    setErr('')
    if (name.trim().length < 2) {
      setErr('กรุณากรอกชื่อ')
      return
    }
    if (prefixRequired(name) && !isVendorPrefix(prefix)) {
      setErr('กรุณาเลือกคำนำหน้าชื่อ (เว้นว่างได้เฉพาะนิติบุคคล)')
      return
    }
    if (address.trim().length < 4) {
      setErr('กรุณากรอกที่อยู่')
      return
    }
    if (newTaxId.trim() && newTaxId.replace(/\D/g, '').length !== 13) {
      setErr('เลขบัตรประชาชนต้องเป็นเลข 13 หลัก')
      return
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr('รูปแบบอีเมลไม่ถูกต้อง')
      return
    }
    try {
      await update.mutateAsync({
        prefix: isVendorPrefix(prefix) ? prefix : '',
        name: name.trim(),
        address: address.trim(),
        lineUserId: lineUserId.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        ...(newTaxId.trim() ? { idNumber: newTaxId } : {}),
      })
      setEditing(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
  }

  const remove = async () => {
    setConfirmDelete(false)
    setDeleteErr('')
    try {
      await del.mutateAsync(v.id)
      nav('/vendors')
    } catch (e) {
      const code = e instanceof Error ? e.message : ''
      setDeleteErr(code === 'vendor-in-use' ? 'มีธุรกรรมอ้างอิงผู้ขายรายนี้ — ลบไม่ได้' : 'ลบผู้ขายไม่สำเร็จ')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title={vendorDisplayName(v.prefix, v.name)}
        sub={`รหัสผู้ขาย ${String(v.vendorNo ?? 0).padStart(3, '0')} · ${displayTaxId(v)} · ผู้ขายรายย่อย (ไม่จด VAT)`}
        actions={
          editing
            ? <Button onClick={save} loading={update.isPending}>{update.isPending ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
            : <Button variant="secondary" onClick={startEdit}>แก้ไข</Button>
        }
      />
      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
            <div>
              <Label>คำนำหน้าชื่อ</Label>
              {editing
                ? (
                  <Select value={prefix} onChange={(e) => setPrefix(e.target.value)}>
                    <option value="">—</option>
                    {VENDOR_PREFIXES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </Select>
                )
                : <p className="py-2.5">{v.prefix || '—'}</p>}
            </div>
            <div>
              <Label required>ชื่อ</Label>
              {editing
                ? <Input value={name} onChange={(e) => setName(e.target.value)} />
                : <p className="py-2.5 font-semibold">{v.name}</p>}
            </div>
          </div>
          <div>
            <Label required>ที่อยู่</Label>
            {editing
              ? <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              : <p>{v.address}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label required>เลขบัตรประชาชน</Label>
              {editing
                ? (
                  <>
                    <Input
                      value={newTaxId}
                      onChange={(e) => setNewTaxId(e.target.value.replace(/\D/g, '').slice(0, 13))}
                      placeholder="เว้นว่างเพื่อไม่เปลี่ยน"
                      inputMode="numeric"
                      className="font-mono"
                    />
                    <p className="mt-1.5 text-label text-ink-400">ปัจจุบัน: {displayTaxId(v)}</p>
                  </>
                )
                : <p className="font-mono">{displayTaxId(v)}</p>}
            </div>
            <div>
              <Label>LINE user id</Label>
              {editing
                ? <Input value={lineUserId} onChange={(e) => setLineUserId(e.target.value)} className="font-mono" />
                : <p className="font-mono">{v.lineUserId || '—'}</p>}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>เบอร์โทรศัพท์</Label>
              {editing
                ? <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08x-xxx-xxxx" inputMode="tel" />
                : <p>{v.phone || '—'}</p>}
            </div>
            <div>
              <Label>อีเมล</Label>
              {editing
                ? <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
                : <p>{v.email || '—'}</p>}
            </div>
          </div>
          <FieldError msg={err} />
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
                  onClick={() => setConfirmForget(true)}
                >
                  ลบเลขที่บันทึกไว้
                </Button>
              </div>
            ) : (
              <p className="text-body text-ink-500">ยังไม่บันทึก — ระบบจะบันทึกแบบเข้ารหัสอัตโนมัติเมื่อสร้างรายการแรก</p>
            )}
          </div>
          {editing && (
            <Button variant="ghost" onClick={() => { setEditing(false); setErr('') }}>ยกเลิกการแก้ไข</Button>
          )}
        </CardBody>
      </Card>

      {!editing && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">ลบผู้ขาย</p>
              <p className="text-body text-ink-500">ลบได้เฉพาะผู้ขายที่ยังไม่มีธุรกรรมอ้างอิงเท่านั้น</p>
              <FieldError msg={deleteErr} />
            </div>
            <Button variant="danger" onClick={() => setConfirmDelete(true)} loading={del.isPending}>
              ลบผู้ขาย
            </Button>
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={confirmForget}
        title="ยืนยันการลบเลขบัตรที่บันทึกไว้"
        message="ระบบจะลบเลขบัตรประชาชนที่เข้ารหัสไว้ของผู้ขายรายนี้ การออกใบเสร็จครั้งถัดไปจะต้องกรอกเลขบัตรใหม่"
        confirmLabel="ลบเลขที่บันทึกไว้"
        onConfirm={() => { setConfirmForget(false); forget.mutate(v.id) }}
        onCancel={() => setConfirmForget(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="ยืนยันการลบผู้ขาย"
        message={<>ต้องการลบ “<b>{vendorDisplayName(v.prefix, v.name)}</b>” ออกจากทะเบียนผู้ขายหรือไม่<br />การลบไม่สามารถเรียกคืนได้</>}
        confirmLabel="ลบผู้ขาย"
        busy={del.isPending}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
