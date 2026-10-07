// Shared batch-export chunking. Vercel Hobby runs each API call as a
// serverless function (10s timeout, limited concurrency), so a 50-receipt
// export must not fire 100+ calls at once. Processing in chunks of 20 keeps
// concurrency bounded and lets the browser paint + GC between chunks.

export const EXPORT_CHUNK_SIZE = 20

export function chunk<T>(arr: T[], size: number = EXPORT_CHUNK_SIZE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}
