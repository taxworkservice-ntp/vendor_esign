import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from './components/layout'
import { TransactionList } from './pages/TransactionList'
import { TransactionNew } from './pages/TransactionNew'
import { TransactionDetail } from './pages/TransactionDetail'
import { VendorSign } from './pages/VendorSign'
import { ReceiptView } from './pages/ReceiptView'
import { ReviewList } from './pages/ReviewList'
import { MetricsPage } from './pages/MetricsPage'
import { VerifyPage } from './pages/VerifyPage'

const qc = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Vendor + public verify: no account, standalone pages (no portal chrome) */}
          <Route path="/v/:token" element={<VendorSign />} />
          <Route path="/verify/:code" element={<div className="min-h-screen bg-paper"><div className="mx-auto max-w-6xl px-4 py-6 sm:px-6"><VerifyPage /></div></div>} />
          <Route
            path="/*"
            element={
              <Layout>
                <Routes>
                  <Route path="/" element={<TransactionList />} />
                  <Route path="/transactions/new" element={<TransactionNew />} />
                  <Route path="/transactions/:id" element={<TransactionDetail />} />
                  <Route path="/receipts/:id" element={<ReceiptView />} />
                  <Route path="/review" element={<ReviewList />} />
                  <Route path="/metrics" element={<MetricsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
