import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useClientAuth } from '../lib/client-auth'
import { currentMonth, monthOffset } from '../lib/txn-filters'
import { isValidMonth, readStoredMonth, resolveMonth, shiftMonth, writeStoredMonth } from '../lib/global-month'

// Global accounting-period state. ONE instance per app via GlobalMonthProvider
// (a module-level hook would fork per call site and pages would never update).
// Tenant-scoped localStorage persistence; an explicit ?month= in the URL wins
// once (shareable links) and is then adopted as the stored pick.
// '' = all time (deliberate, persisted).
// Stepping forward stops at the current month — no future periods.

const MAX_AHEAD = 0

export interface GlobalMonth {
  month: string
  setMonth: (m: string) => void
  clearMonth: () => void
  step: (delta: number) => void
  canStepNext: boolean
  isAllTime: boolean
  isCurrentMonth: boolean
  thisMonth: string
}

const Ctx = createContext<GlobalMonth | null>(null)

function useGlobalMonthState(): GlobalMonth {
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

  const maxMonth = monthOffset(MAX_AHEAD)
  // From "all time", stepping starts at the current month (most likely
  // intent); forward is clamped so › never enters a future period.
  const step = useCallback(
    (delta: number) => {
      const eff = month || currentMonth()
      const next = shiftMonth(eff, delta)
      setMonth(delta > 0 && next > maxMonth ? maxMonth : next)
    },
    [month, maxMonth, setMonth],
  )

  return {
    month,
    setMonth,
    clearMonth,
    step,
    canStepNext: (month || currentMonth()) < maxMonth,
    isAllTime: month === '',
    isCurrentMonth: month === currentMonth(),
    thisMonth: currentMonth(),
  }
}

export function GlobalMonthProvider({ children }: { children: React.ReactNode }) {
  const value = useGlobalMonthState()
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useGlobalMonth(): GlobalMonth {
  const v = useContext(Ctx)
  if (!v) throw new Error('useGlobalMonth outside GlobalMonthProvider')
  return v
}
