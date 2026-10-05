import { useEffect, useState } from 'react'
import { Megaphone, Plus, Save, Wrench } from 'lucide-react'
import { usePlatformSettingsAdmin, useSavePlatformSettings, type PlatformSettingsAdmin } from '../../hooks/useAdmin'
import type { AnnouncementLevel, MaintenanceMode } from '../../hooks/usePlatformNotice'
import { Card, CardBody } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { Label, Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { Button } from '../../components/ui/button'
import { useToast } from '../../components/ui/toast'
import { cn } from '../../lib/cn'

export function Settings() {
  const { data } = usePlatformSettingsAdmin()
  const save = useSavePlatformSettings()
  const toast = useToast()

  const [form, setForm] = useState<PlatformSettingsAdmin>({
    announcement: { active: false, level: 'info', message: '' },
    maintenance: { mode: 'off', message: '' },
    flags: {},
  })
  const [newFlag, setNewFlag] = useState('')

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const submit = async () => {
    try {
      await save.mutateAsync(form)
      toast.show('บันทึกการตั้งค่าระบบแล้ว')
    } catch {
      toast.show('บันทึกไม่สำเร็จ', 'error')
    }
  }

  const flags = Object.entries(form.flags)

  return (
    <div className="space-y-5">
      <PageHeader
        title="ตั้งค่าระบบ"
        sub="ประกาศจากผู้ให้บริการ · โหมดปิดปรับปรุง · สวิตช์คุณสมบัติทั้งแพลตฟอร์ม"
        actions={
          <Button onClick={() => void submit()} loading={save.isPending}>
            <Save size={16} aria-hidden /> บันทึก
          </Button>
        }
      />

      <Card>
        <CardBody className="space-y-4">
          <h2 className="flex items-center gap-2 text-body font-semibold">
            <Megaphone size={16} className="text-ink-400" aria-hidden /> ประกาศ (announcement)
          </h2>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.announcement.active}
              onChange={(e) => setForm({ ...form, announcement: { ...form.announcement, active: e.target.checked } })}
              className="h-4 w-4 cursor-pointer accent-ink-900"
            />
            <span className="text-body">แสดงประกาศบนพอร์ทัลลูกค้าทุกเวิร์กสเปซ</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div>
              <Label>ระดับความสำคัญ</Label>
              <Select
                value={form.announcement.level}
                onChange={(e) => setForm({ ...form, announcement: { ...form.announcement, level: e.target.value as AnnouncementLevel } })}
              >
                <option value="info">ข้อมูล (info)</option>
                <option value="warning">เตือน (warning)</option>
                <option value="critical">สำคัญ (critical)</option>
              </Select>
            </div>
            <div>
              <Label hint="≤ 500 ตัวอักษร">ข้อความ</Label>
              <Input
                value={form.announcement.message}
                onChange={(e) => setForm({ ...form, announcement: { ...form.announcement, message: e.target.value.slice(0, 500) } })}
                placeholder="เช่น ปรับปรุงระบบวันที่ … เวลา … น."
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h2 className="flex items-center gap-2 text-body font-semibold">
            <Wrench size={16} className="text-ink-400" aria-hidden /> โหมดปิดปรับปรุง (maintenance)
          </h2>
          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div>
              <Label>ระดับ</Label>
              <Select
                value={form.maintenance.mode}
                onChange={(e) => setForm({ ...form, maintenance: { ...form.maintenance, mode: e.target.value as MaintenanceMode } })}
              >
                <option value="off">ปิด (ใช้งานปกติ)</option>
                <option value="read_only">อ่านได้อย่างเดียว (บล็อกการบันทึก)</option>
                <option value="full">ปิดทั้งระบบ</option>
              </Select>
            </div>
            <div>
              <Label hint="แสดงเมื่อไม่ใช่ off">ข้อความ</Label>
              <Input
                value={form.maintenance.message}
                onChange={(e) => setForm({ ...form, maintenance: { ...form.maintenance, message: e.target.value.slice(0, 500) } })}
                placeholder="เช่น ระบบจะกลับมาใช้งานได้ในเวลา 18:00 น."
              />
            </div>
          </div>
          {form.maintenance.mode !== 'off' && (
            <p className={cn('rounded-control p-3 text-body', form.maintenance.mode === 'full' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
              {form.maintenance.mode === 'full'
                ? 'ผู้ใช้ทั้งหมดจะไม่สามารถใช้งานพอร์ทัลลูกค้าได้ (ยกเว้นผู้ให้บริการ)'
                : 'ผู้ใช้จะดูข้อมูลได้ แต่บันทึก/แก้ไขไม่ได้'}
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h2 className="text-body font-semibold">สวิตช์คุณสมบัติ (feature flags)</h2>
          {flags.length === 0 ? (
            <p className="text-body text-ink-400">ยังไม่มีสวิตช์</p>
          ) : (
            <div className="space-y-2">
              {flags.map(([key, value]) => (
                <label key={key} className="flex items-center justify-between gap-3 rounded-control border border-card-border px-3 py-2">
                  <span className="font-mono text-body">{key}</span>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => setForm({ ...form, flags: { ...form.flags, [key]: e.target.checked } })}
                    className="h-4 w-4 cursor-pointer accent-ink-900"
                  />
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={newFlag}
              onChange={(e) => setNewFlag(e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase())}
              placeholder="ชื่อสวิตช์ใหม่ เช่น vendorMemory"
              className="flex-1 font-mono"
            />
            <Button
              variant="secondary"
              disabled={!newFlag.trim()}
              onClick={() => {
                setForm({ ...form, flags: { ...form.flags, [newFlag.trim()]: true } })
                setNewFlag('')
              }}
            >
              <Plus size={16} aria-hidden /> เพิ่ม
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
