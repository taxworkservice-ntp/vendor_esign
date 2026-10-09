// Vendor document storage for the MOCK path. Documents uploaded during
// onboarding are copied here on approval so the vendor detail page can show them
// (the server keeps them in R2, referenced by vendor_payees.id_doc_path).

const KEY = 'taxwork-vendor-docs-v1'

type Docs = Record<string, { id?: string; bank?: string }>

function read(): Docs {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Docs
  } catch {
    /* ignore */
  }
  return {}
}

function write(all: Docs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

export function saveVendorDoc(vendorId: string, kind: 'id' | 'bank', dataUrl: string) {
  const all = read()
  all[vendorId] = { ...(all[vendorId] ?? {}), [kind]: dataUrl }
  write(all)
}

export function getVendorDoc(vendorId: string, kind: 'id' | 'bank'): string | undefined {
  return read()[vendorId]?.[kind]
}
