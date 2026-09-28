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

export function maskId(masked: string) {
  return masked // already masked in mock; real API masks server-side
}
