import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ClientAuthProvider } from '../lib/client-auth'
import { GlobalMonthProvider, useGlobalMonth } from './useGlobalMonth'
import { currentMonth } from '../lib/txn-filters'

function MonthEcho({ id }: { id: string }) {
  const { month } = useGlobalMonth()
  return <span data-testid={id}>{month}</span>
}

// Regression guard for the forked-state bug: every consumer under one
// provider must read the same shared month (previously each useGlobalMonth()
// call owned a private useState, so the bar and the lists never synced).
describe('GlobalMonthProvider', () => {
  it('supplies one valid month to all consumers', () => {
    const html = renderToString(
      <ClientAuthProvider>
        <GlobalMonthProvider>
          <MonthEcho id="a" />
          <MonthEcho id="b" />
        </GlobalMonthProvider>
      </ClientAuthProvider>,
    )
    const expected = currentMonth()
    expect(html).toContain(`data-testid="a">${expected}</span>`)
    expect(html).toContain(`data-testid="b">${expected}</span>`)
  })

  it('fails loudly outside the provider', () => {
    expect(() => renderToString(<MonthEcho id="x" />)).toThrow(
      'useGlobalMonth outside GlobalMonthProvider',
    )
  })
})
