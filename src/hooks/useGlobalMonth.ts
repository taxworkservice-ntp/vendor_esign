import { useCallback, useEffect, useState } from 'react'
import { useClientAuth } from '../lib/client-auth'
import { currentMonth, previousMonth } from '../lib/txn-filters'
import { isValidMonth, readStoredMonth, resolveMonth, writeStoredMonth } from '../lib/global-month'

// Global accounting-period state. Tenant-scoped localStorage persistence;
// an explicit ?month= in the URL wins once (shareable links) and is then
// adopted as the stored pick. '' = all time (deliberate, persisted).
export function useGlobalMonth() {
  const { activeTenant } = useClientAuth()
  const [month, setMonthState] = useState<string>(() => {
    let urlMonth: string | null = null
    try {
      urlMonth = new URLSearchParams(window.location.search).get('month')
    } catch {
      urlMonth = null
    }
    return resolveMonth({ urlMonth, tenantId: activeTenant })
  })

  // Tenant switch: re-resolve for the new workspace (URL still wins, so a
  // shared link keeps working across workspaces without leaking one tenant's
  // last pick into another).
  useEffect(() => {
    let urlMonth: string | null = null
    try {
      urlMonth = new URLSearchParams(window.location.search).get('month')
    } catch {
      urlMonth = null
    }
    const next = resolveMonth({ urlMonth, tenantId: activeTenant })
    setMonthState((prev) => {
      // Adopt the URL override into storage so refresh keeps it.
      if (isValidMonth(urlMonth) && urlMonth !== readStoredMonth(activeTenant)) {
        writeStoredMonth(activeTenant, urlMonth as string)
      }
      return prev === next ? prev : next
    })
  }, [activeTenant])

  const setMonth = useCallback(
    (m: string) => {
      // Custom date ranges clear the month (mutual exclusion) by passing ''.
      // Invalid values are ignored — never applied, never persisted.
      if (m !== '' && !isValidMonth(m)) return
      setMonthState(m)
      writeStoredMonth(activeTenant, m)
    },
    [activeTenant],
  )

  const clearMonth = useCallback(() => setMonth(''), [setMonth])

  return {
    month,
    setMonth,
    clearMonth,
    isAllTime: month === '',
    isCurrentMonth: month === currentMonth(),
    thisMonth: currentMonth(),
    prevMonth: previousMonth(),
  }
}
