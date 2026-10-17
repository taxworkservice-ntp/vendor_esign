// Payment-slip file storage for the MOCK path (server mode stores the file under
// `slips/` in R2). Mirrors src/lib/vendor-doc-mock.ts: a data URL per txn id.

const KEY = 'taxwork-slips-v1'

type Slips = Record<string, string>

function read(): Slips {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Slips
  } catch {
    /* ignore */
  }
  return {}
}

function write(all: Slips) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

export function saveSlip(txnId: string, dataUrl: string): void {
  write({ ...read(), [txnId]: dataUrl })
}

export function getSlip(txnId: string): string | undefined {
  return read()[txnId]
}

export function removeSlip(txnId: string): void {
  const all = read()
  if (all[txnId]) {
    delete all[txnId]
    write(all)
  }
}
