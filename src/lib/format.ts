export const fmtTHB = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtDateTH = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

/** Short date + time (e.g. 2 ต.ค. 69 14:30) — for "last edited" columns. */
export const fmtDateTimeTH = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('th-TH', {
      year: '2-digit',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function maskId(masked: string) {
  return masked // already masked in mock; real API masks server-side
}
