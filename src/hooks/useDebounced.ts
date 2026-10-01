import { useEffect, useState } from 'react'

/**
 * Trailing debounce. The value updates instantly for the caller that owns the
 * input, and this lagged copy is what feeds a query key — so typing stays
 * responsive while the network only sees a request once typing pauses.
 */
export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    // A zero delay would still defer a frame; treat it as "no debounce".
    if (delay <= 0) {
      setDebounced(value)
      return
    }
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
