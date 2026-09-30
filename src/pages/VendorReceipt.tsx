import { Link, useParams } from 'react-router-dom'
import { ReceiptView } from './ReceiptView'
import { Card, CardBody } from '../components/ui/card'
import { Button } from '../components/ui/button'

// Vendor-facing receipt copy. The single-use invite token is consumed on
// signing, so access is granted to the browser that just signed (session flag)
// rather than exposing receipts to anyone who guesses a transaction id.
export function VendorReceipt() {
  const { id } = useParams()
  const allowed = (() => {
    try {
      return !!id && sessionStorage.getItem(`taxwork-vendor-signed-${id}`) === '1'
    } catch {
      return false
    }
  })()

  if (!allowed) {
    return (
      <div className="min-h-screen bg-paper px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-md pt-10">
          <Card>
            <CardBody className="space-y-4 text-center">
              <h1 className="text-title font-semibold">ไม่สามารถเปิดสำเนาใบเสร็จได้</h1>
              <p className="text-body text-ink-500">
                สำเนานี้เปิดได้เฉพาะอุปกรณ์ที่เพิ่งลงนามในลิงก์นี้ · โปรดติดต่อลูกค้าผู้จ่ายหากต้องการสำเนา
              </p>
              <Link to="/" className="inline-block">
                <Button>กลับหน้าแรก</Button>
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper px-4 py-8 sm:px-6">
      <ReceiptView />
    </div>
  )
}
