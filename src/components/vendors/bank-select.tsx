import { useState } from 'react'
import { BANK_OTHER, THAI_BANKS, isCustomBank } from '../../lib/banks'
import { Input } from '../ui/input'
import { Select } from '../ui/select'

// Bank name picker: a dropdown of the common Thai banks with an "อื่น ๆ"
// escape hatch. The free-text input is shown for a value not in the list (so a
// legacy/custom stored bank is never lost) or when the user explicitly picks
// "อื่น ๆ". Controlled: the parent owns the string value.

export function BankSelect({
  value,
  onChange,
  id,
}: {
  value: string
  onChange: (v: string) => void
  id?: string
}) {
  const [pickedOther, setPickedOther] = useState(false)
  const showOther = isCustomBank(value) || (pickedOther && value.trim() === '')

  const onSelect = (v: string) => {
    if (v === BANK_OTHER) {
      setPickedOther(true)
      return
    }
    setPickedOther(false)
    onChange(v)
  }

  return (
    <div className="space-y-1.5">
      <Select id={id} value={showOther ? BANK_OTHER : value} onChange={(e) => onSelect(e.target.value)}>
        <option value="">— เลือกธนาคาร —</option>
        {THAI_BANKS.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
        <option value={BANK_OTHER}>อื่น ๆ (ระบุเอง)</option>
      </Select>
      {showOther && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="พิมพ์ชื่อธนาคาร"
          autoComplete="off"
        />
      )}
    </div>
  )
}
