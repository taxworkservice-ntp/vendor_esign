import { Link } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { Card, CardBody } from '../components/ui/card'
import { Button } from '../components/ui/button'

export function NotFound() {
  return (
    <div className="mx-auto max-w-md pt-10">
      <Card>
        <CardBody className="space-y-4 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ink-100 text-ink-400">
            <FileQuestion size={22} />
          </span>
          <h1 className="text-title font-semibold">ไม่พบหน้าที่ต้องการ</h1>
          <p className="text-body text-ink-500">ลิงก์อาจไม่ถูกต้อง ถูกย้าย หรือไม่มีอยู่แล้ว</p>
          <Link to="/" className="inline-block">
            <Button>กลับหน้าแรก</Button>
          </Link>
        </CardBody>
      </Card>
    </div>
  )
}
