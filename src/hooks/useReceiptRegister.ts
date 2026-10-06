import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useClientAuth } from '../lib/client-auth'
import { fetchReceiptRegister, type ReceiptRegisterQuery } from '../lib/receipts-register'

// Receipt register query. Keyed by every field so a sort/month/search change
// refetches, with the previous page kept on screen while it loads.
export function useReceiptRegister(query: ReceiptRegisterQuery) {
  const { activeTenant } = useClientAuth()
  return useQuery({
    queryKey: ['receipts', 'register', activeTenant, query],
    queryFn: () => fetchReceiptRegister(activeTenant, query),
    placeholderData: keepPreviousData,
  })
}
