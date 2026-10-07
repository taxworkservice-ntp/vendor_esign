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

/** Date + time down to the second (e.g. 2 ต.ค. 69 14:30:05) — for audit/
 *  last-activity columns, where two rows in the same minute must be ordered. */
export const fmtDateTimeTHSec = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('th-TH', {
      year: '2-digit',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

/** Full date + time (e.g. 7 ต.ค. 2569 14:32) — for the signing record on
 *  legal documents, where the four-digit Buddhist year matters. */
export const fmtDateTimeTHLong = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export function maskId(masked: string) {
  return masked // already masked in mock; real API masks server-side
}
