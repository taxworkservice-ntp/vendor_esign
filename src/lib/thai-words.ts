// Thai amount-in-words. Tested rules: satang, zero, millions, เอ็ด/ยี่.
// Example: 2910.00 → สองพันเก้าร้อยสิบบาทถ้วน

const DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']

function underMillion(n: number): string {
  if (n === 0) return ''
  let out = ''
  const parts: [number, string][] = [
    [100000, 'แสน'],
    [10000, 'หมื่น'],
    [1000, 'พัน'],
    [100, 'ร้อย'],
  ]
  for (const [v, w] of parts) {
    const d = Math.floor(n / v)
    if (d > 0) {
      out += DIGITS[d] + w
      n %= v
    }
  }
  const tens = Math.floor(n / 10)
  const ones = n % 10
  if (tens > 0) {
    if (tens === 1) out += 'สิบ'
    else if (tens === 2) out += 'ยี่สิบ'
    else out += DIGITS[tens] + 'สิบ'
    if (ones === 1) out += 'เอ็ด'
    else if (ones > 0) out += DIGITS[ones]
  } else if (ones > 0) {
    out += DIGITS[ones]
  }
  return out
}

export function integerToThaiWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('integerToThaiWords: non-negative safe integer required')
  if (n === 0) return 'ศูนย์'
  if (n < 1000000) return underMillion(n)
  const high = Math.floor(n / 1000000)
  const low = n % 1000000
  return integerToThaiWords(high) + 'ล้าน' + (low > 0 ? underMillion(low) : '')
}

export function amountToThaiWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('amountToThaiWords: non-negative finite amount required')
  const total = Math.round(amount * 100)
  const baht = Math.floor(total / 100)
  const satang = total % 100
  if (baht === 0 && satang === 0) return 'ศูนย์บาทถ้วน'
  if (baht === 0) return integerToThaiWords(satang) + 'สตางค์'
  if (satang === 0) return integerToThaiWords(baht) + 'บาทถ้วน'
  return integerToThaiWords(baht) + 'บาท' + integerToThaiWords(satang) + 'สตางค์'
}

// Thai 13-digit national ID checksum (mod-11).
export function validateThaiId(id: string): boolean {
  const d = id.replace(/\D/g, '')
  if (!/^[1-9]\d{12}$/.test(d)) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i)
  return (11 - (sum % 11)) % 10 === Number(d[12])
}
