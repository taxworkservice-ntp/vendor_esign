import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Archive, ArchiveRestore, ChevronLeft, ReceiptText, Users } from 'lucide-react'
import { useDeleteVendor, useForgetVendorId, useSetVendorActive, useUpdateVendor, useVendor } from '../hooks/useVendors'
import { useTransactions } from '../hooks/useTransactions'
import { displayTaxId } from '../lib/vendors-mock'
import { VENDOR_PREFIXES, isVendorPrefix, prefixRequired, vendorDisplayName } from '../lib/vendor-name'
import { emptyFilters } from '../lib/txn-filters'
import { fmtDateTH, fmtTHB } from '../lib/format'
import { Card, CardBody } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { FieldError, Input, Label } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { EmptyState } from '../components/ui/empty-state'
import { ErrorState } from '../components/ui/error-state'
import { PanelSkeleton } from '../components/ui/table-skeleton'
import { StatusBadge } from '../components/ui/badge'

export function VendorDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data: v, isLoading, isError, error, refetch } = useVendor(id)
  const update = useUpdateVendor(id)
  const forget = useForgetVendorId()
  const del = useDeleteVendor()
  const setActive = useSetVendorActive()
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
  const [confirmArchive, setConfirmArchive] = useState(false)

  // This vendor's transactions, via the vendorId filter the list endpoint
  // already pushes down. The page used to show no history at all, so seeing what
  // you had paid a supplier meant leaving for the transaction list and searching
  // by hand.
  const historyFilters = useMemo(() => ({ ...emptyFilters(), vendorId: id ?? '' }), [id])
  const { data: history } = useTransactions(historyFilters, 0, 5)
  const recent = history?.rows ?? []
  const archived = v?.isActive === false

  // Loading, not-found and failure are three different things. The previous
  // version collapsed all three into "กำลังโหลด…", so a bad URL looked like a slow
  // page forever and a failed request was indistinguishable from a wait.
  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader title="กำลังโหลดข้อมูลผู้ขาย" sub="—" />
        <Card>
          <CardBody>
            <PanelSkeleton rows={5} cols={2} />
          </CardBody>
        </Card>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader title="โหลดข้อมูลผู้ขายไม่สำเร็จ" sub="—" />
        <Card>
          <ErrorState
            title="ไม่สามารถโหลดข้อมูลผู้ขายได้"
            description={error instanceof Error && error.message ? `รายละเอียด: ${error.message}` : undefined}
            onRetry={() => void refetch()}
          />
        </Card>
      </div>
    )
  }

  if (!v) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader title="ไม่พบผู้ขาย" sub="—" />
        <Card>
          <EmptyState
            icon={Users}
            title="ไม่พบผู้ขายรายนี้"
            description={
              id
                ? `ไม่มีผู้ขายที่มีรหัส ${id} ในทะเบียนนี้ — อาจถูกลบไปแล้ว หรือลิงก์ไม่ถูกต้อง`
                : 'ไม่พบรหัสผู้ขายในลิงก์'
            }
            action={
              <Link to="/vendors">
                <Button>
                  <ChevronLeft size={16} /> กลับทะเบียนผู้ขาย
                </Button>
              </Link>
            }
          />
        </Card>
      </div>
    )
  }

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
    <div className="mx-auto max-w-3xl space-y-5">
      {archived && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-control border border-card-border bg-ink-50 px-3.5 py-2.5 text-body"
          role="status"
        >
          <Archive size={16} className="shrink-0 text-ink-500" aria-hidden />
          <span className="min-w-0 flex-1 text-ink-600">
            ผู้ขายรายนี้ถูก<strong>ปิดการใช้งาน</strong> — ไม่แสดงในทะเบียน แต่เอกสารเดิมทั้งหมดยังอยู่ครบ
          </span>
          <Button variant="secondary" className="h-9" onClick={() => setConfirmArchive(true)} loading={setActive.isPending}>
            <ArchiveRestore size={14} /> เปิดการใช้งาน
          </Button>
        </div>
      )}
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
                  <span className="ml-2 font-sans text-body text-success">เข้ารหัส (AES-256-GCM)</span>
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
        <>
          {/* Money context, from the same aggregate the register shows. */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-card-border bg-card-border sm:grid-cols-3">
            <div className="bg-white px-4 py-3">
              <p className="text-label text-ink-500">ยอดค้างชำระ</p>
              <p className="mt-0.5 text-title font-semibold tabular-nums">
                {v.outstanding ? fmtTHB(v.outstanding) : '—'}
              </p>
              <p className="text-micro text-ink-400">ไม่รวมรายการที่ยกเลิก/เพิกถอน</p>
            </div>
            <div className="bg-white px-4 py-3">
              <p className="text-label text-ink-500">จำนวนรายการทั้งหมด</p>
              <p className="mt-0.5 text-title font-semibold tabular-nums">
                {v.txnCount ? v.txnCount.toLocaleString('th-TH') : '—'}
              </p>
            </div>
            <div className="bg-white px-4 py-3">
              <p className="text-label text-ink-500">เคลื่อนไหวล่าสุด</p>
              <p className="mt-0.5 text-title font-semibold tabular-nums">
                {v.lastActivity ? fmtDateTH(v.lastActivity) : '—'}
              </p>
            </div>
          </div>

          <Card>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-semibold">
                  <ReceiptText size={16} className="text-ink-500" aria-hidden /> ธุรกรรมล่าสุด
                </h2>
                {history && history.total > recent.length && (
                  <Link
                    to={`/?vendor=${v.id}`}
                    className="text-label font-medium text-ink-500 underline-offset-2 hover:underline"
                  >
                    ดูทั้งหมด ({history.total})
                  </Link>
                )}
              </div>

              {recent.length === 0 ? (
                <p className="rounded-control bg-ink-50 px-3.5 py-3 text-body text-ink-500">
                  ยังไม่มีธุรกรรมกับผู้ขายรายนี้
                </p>
              ) : (
                <ul className="divide-y divide-card-border">
                  {recent.map((t) => (
                    <li key={t.id}>
                      <Link
                        to={`/transactions/${t.id}`}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control px-1 py-2 transition hover:bg-ink-50"
                      >
                        <span className="font-mono text-label text-ink-400">{t.id}</span>
                        <StatusBadge status={t.status} />
                        <span className="min-w-0 flex-1 truncate text-body">
                          {t.note?.trim() || t.lineItems[0]?.description || t.description}
                        </span>
                        <span className="whitespace-nowrap text-label tabular-nums text-ink-500">
                          {fmtDateTH(t.transferDate)}
                        </span>
                        <span className="whitespace-nowrap font-semibold tabular-nums">{fmtTHB(t.netAmount)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </>
      )}

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
        open={confirmArchive}
        title={archived ? 'ยืนยันการเปิดใช้งานผู้ขาย' : 'ยืนยันการปิดการใช้งานผู้ขาย'}
        message={
          archived
            ? <>ผู้ขาย “<b>{vendorDisplayName(v.prefix, v.name)}</b>” จะกลับมาแสดงในทะเบียนอีกครั้ง</>
            : <>ผู้ขาย “<b>{vendorDisplayName(v.prefix, v.name)}</b>” จะถูกซ่อนจากทะเบียน<br />เอกสารเดิมทั้งหมดยังอยู่ครบ และกู้คืนได้ภายหลัง</>
        }
        confirmLabel={archived ? 'เปิดการใช้งาน' : 'ปิดใช้งาน'}
        busy={setActive.isPending}
        onConfirm={async () => {
          setConfirmArchive(false)
          try {
            await setActive.mutateAsync({ id: v.id, isActive: !archived })
          } catch {
            setDeleteErr('อัปเดตสถานะผู้ขายไม่สำเร็จ')
          }
        }}
        onCancel={() => setConfirmArchive(false)}
      />
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
