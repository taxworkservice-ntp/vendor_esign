// Signature image storage for the MOCK path.
//
// This replaces a module-scope `Map`, which held the PNG only in the browser
// tab where the vendor happened to sign. The accountant's tab — a different JS
// runtime — therefore rendered a receipt with an empty signature box, and even
// the vendor lost it on refresh. The mock exists to stand in for the server,
// and the server writes the image to private disk, so the mock persists too.
//
// IndexedDB rather than localStorage: the PNG is a base64 data URL, which is
// large and opaque to quota accounting. Signature pads are small, but several
// transactions' worth would crowd a 5MB localStorage budget shared with the
// auth metadata.

const DB_NAME = 'taxwork-signatures'
const DB_VERSION = 1
const STORE = 'signatures'

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    // Private-mode Safari and some embedded webviews throw on open.
    if (typeof indexedDB === 'undefined') return resolve(null)
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      return resolve(null)
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined)
        try {
          const t = db.transaction(STORE, mode)
          const req = fn(t.objectStore(STORE))
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => resolve(undefined)
        } catch {
          resolve(undefined)
        }
      }),
  )
}

export async function putSignature(txnId: string, dataUrl: string): Promise<void> {
  await tx('readwrite', (s) => s.put(dataUrl, txnId) as IDBRequest<IDBValidKey>)
}

export async function getSignature(txnId: string): Promise<string | undefined> {
  const v = await tx<string>('readonly', (s) => s.get(txnId))
  return v ?? undefined
}

export async function deleteSignature(txnId: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(txnId) as unknown as IDBRequest<undefined>)
}

/** Test seam: drops the cached connection so a new STORAGE_DIR/name takes effect. */
export function __resetSignatureDb(): void {
  dbPromise = null
}
