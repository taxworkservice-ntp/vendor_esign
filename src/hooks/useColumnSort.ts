import { useCallback, useState } from 'react'
import type { SortDir } from '../lib/sort'

/**
 * Click-to-sort header state shared by every table.
 *
 * First click on a column sorts ascending; clicking the active column flips the
 * direction; clicking a new column starts ascending again.
 */
export function useColumnSort(initialKey: string | null = null, initialDir: SortDir = 'asc') {
  const [key, setKey] = useState<string | null>(initialKey)
  const [dir, setDir] = useState<SortDir>(initialDir)

  const onSort = useCallback((next: string) => {
    setKey((prev) => {
      if (prev === next) {
        setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setDir('asc')
      return next
    })
  }, [])

  return { key, dir, onSort }
}
