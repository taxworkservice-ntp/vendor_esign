import { useEffect, useState } from 'react'
import { Check, Copy, Link2 } from 'lucide-react'
import { useCreateVendorInvite } from '../../hooks/useVendorInvites'
import { useSettings } from '../../hooks/useSettings'
import { inviteUrl } from '../../lib/vendor-invite-source'
import { renderVendorInviteMessage } from '../../lib/settings'
import type { VendorInvite } from '../../lib/vendor-invite'
import { Card, CardBody } from '../ui/card'
import { Button } from '../ui/button'
import { Input, Label, Textarea } from '../ui/input'
import { useToast } from '../ui/toast'

// Create an onboarding invite: an optional note (who it's for), then a one-time
// reveal of the link + a copy-ready message rendered from the tenant template
// (editable per invite, like the transaction "ข้อความส่งผู้ขาย").

export function CreateInviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateVendorInvite()
  const { data: settings } = useSettings()
  const toast = useToast()
  const [recipientName, setRecipientName] = useState('')
  const [recipientLine, setRecipientLine] = useState('')
  const [created, setCreated] = useState<VendorInvite | null>(null)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState<'message' | 'link' | null>(null)

  const link = created?.token ? inviteUrl(created.token) : ''

  useEffect(() => {
    if (!open) return
    setRecipientName('')
    setRecipientLine('')
    setCreated(null)
    setMessage('')
    setCopied(null)
  }, [open])

  useEffect(() => {
    if (!created?.token) return
    const template = settings?.vendorInviteMessageTemplate ?? ''
    setMessage(renderVendorInviteMessage(template, { client: settings?.displayName ?? '', link: inviteUrl(created.token) }))
  }, [created, settings])

  if (!open) return null

  const copy = async (text: string, which: 'message' | 'link') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      toast.show(which === 'message' ? 'คัดลอกข้อความแล้ว' : 'คัดลอกลิงก์แล้ว')
    } catch {
      toast.show('คัดลอกไม่สำเร็จ — กรุณาคัดลอกด้วยตนเอง', 'error')
    }
  }

  const doCreate = () => {
    create.mutate(
      { label: recipientName.trim() || undefined, recipientLine: recipientLine.trim() || undefined },
      {
        onSuccess: (inv) => setCreated(inv),
        onError: () => toast.show('สร้างลิงก์ไม่สำเร็จ', 'error'),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="create-invite-title">
      <Card className="my-auto w-full max-w-lg">
        <CardBody className="space-y-4">
          <h2 id="create-invite-title" className="flex items-center gap-2 text-title font-semibold">
            <Link2 size={17} aria-hidden /> สร้างลิงก์เชิญผู้ขาย
          </h2>

          {!created ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label hint="ไม่บังคับ">ชื่อผู้ขาย</Label>
                  <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="เช่น สมชาย การช่าง" />
                </div>
                <div>
                  <Label hint="ไม่บังคับ">LINE ID ของผู้ขาย (ถ้าทราบ)</Label>
                  <Input value={recipientLine} onChange={(e) => setRecipientLine(e.target.value)} placeholder="U…" className="font-mono" autoCapitalize="none" spellCheck={false} />
                </div>
              </div>
              <p className="text-label text-ink-500">ไว้ให้ลูกค้าจำได้ว่าส่งลิงก์นี้ให้ผู้ขายรายใด และใช้เติมช่อง LINE ของผู้ขายให้อัตโนมัติ</p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
                <Button onClick={doCreate} loading={create.isPending}>สร้างลิงก์</Button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-control bg-warning-soft p-3 text-body text-warning">
                <p className="font-semibold">ลิงก์เชิญ (ส่งให้ผู้ขาย)</p>
                <p className="mt-1 break-all font-mono text-label">{link}</p>
              </div>
              <div>
                <Label hint="แก้ไขได้ก่อนส่ง">ข้อความเชิญผู้ขาย</Label>
                <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => void copy(message, 'message')}>
                  <Copy size={15} /> {copied === 'message' ? 'คัดลอกข้อความแล้ว' : 'คัดลอกข้อความ'}
                </Button>
                <Button variant="secondary" onClick={() => void copy(link, 'link')}>
                  {copied === 'link' ? <Check size={15} /> : <Copy size={15} />} {copied === 'link' ? 'คัดลอกลิงก์แล้ว' : 'คัดลอกลิงก์'}
                </Button>
              </div>
              <p className="rounded-control bg-ink-50 p-3 text-label text-ink-500">
                ระบบ<b>ไม่ส่งข้อความเอง</b> — โปรดคัดลอกข้อความด้านบนแล้ววางในแชท (LINE) ของท่าน · ปรับข้อความเริ่มต้นได้ที่เมนู “ตั้งค่า”
              </p>
              <div className="flex justify-end">
                <Button onClick={onClose}>เสร็จสิ้น</Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
