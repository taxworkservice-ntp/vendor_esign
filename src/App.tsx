import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReceiptText } from 'lucide-react'
import { Layout } from './components/layout'
import { AdminLayout } from './components/admin/admin-layout'
import { GlobalMonthProvider } from './hooks/useGlobalMonth'
import { ErrorBoundary } from './components/error-boundary'
import { Spinner } from './components/ui/spinner'
import { ToastProvider } from './components/ui/toast'
import { NotFound } from './pages/NotFound'
import { useAuth } from './lib/auth'
import { useClientAuth } from './lib/client-auth'
import { TransactionList } from './pages/TransactionList'
import { TransactionNew } from './pages/TransactionNew'
import { TransactionDetail } from './pages/TransactionDetail'
import { VendorSign } from './pages/VendorSign'
import { VendorReceipt } from './pages/VendorReceipt'
import { ReceiptView } from './pages/ReceiptView'
import { ReceiptsList } from './pages/ReceiptsList'
import { ReceiptsDownload } from './pages/ReceiptsDownload'
import { MetricsPage } from './pages/MetricsPage'
import { VerifyPage } from './pages/VerifyPage'
import { VendorsList } from './pages/VendorsList'
import { VendorNew } from './pages/VendorNew'
import { VendorDetail } from './pages/VendorDetail'
import { ItemsList } from './pages/ItemsList'
import { Settings } from './pages/Settings'
import { WhtList } from './pages/WhtList'
import { WhtPrint } from './pages/WhtPrint'
import { ClientLogin } from './pages/ClientLogin'
import { ClientChangePassword } from './pages/ClientChangePassword'
import { ClientsList } from './pages/admin/ClientsList'
import { ClientNew } from './pages/admin/ClientNew'
import { ClientDetail } from './pages/admin/ClientDetail'
import { ChangePassword } from './pages/admin/ChangePassword'
import { Dashboard as AdminDashboard } from './pages/admin/Dashboard'
import { Users as AdminUsers } from './pages/admin/Users'
import { AuditLog as AdminAuditLog } from './pages/admin/AuditLog'
import { Settings as AdminSettings } from './pages/admin/Settings'
import { Account as AdminAccount } from './pages/admin/Account'

const qc = new QueryClient()

const Loading = () => (
  <div className="flex items-center justify-center gap-2 py-16 text-body text-ink-500">
    <Spinner /> กำลังโหลด…
  </div>
)

// Standalone shell for auth pages — no portal nav/chrome.
const AuthShell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-paper">
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-8 sm:py-12">
      <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-control bg-ink-900 text-white">
          <ReceiptText size={17} />
        </span>
        <span className="text-title font-semibold tracking-tight">Taxwork</span>
      </Link>
      <div className="flex-1">{children}</div>
    </div>
  </div>
)

function RequireClient({ children }: { children: React.ReactNode }) {
  const { ready, email, mustChangePw } = useClientAuth()
  if (!ready) return <Loading />
  if (!email) return <Navigate to="/login" replace />
  if (mustChangePw) return <Navigate to="/change-password" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { ready, email, mustChangePw, isPlatformAdmin } = useAuth()
  if (!ready) return <Loading />
  if (!email || !isPlatformAdmin) return <Navigate to="/login" replace />
  if (mustChangePw) return <Navigate to="/admin/change-password" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={qc}>
        <ToastProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Vendor + public verify + receipt copy: no account, standalone */}
          <Route path="/v/:token" element={<VendorSign />} />
          <Route path="/v/receipt/:id" element={<VendorReceipt />} />
          <Route path="/verify/:code" element={<AuthShell><VerifyPage /></AuthShell>} />

          {/* Auth pages: standalone, no portal chrome */}
          <Route path="/login" element={<AuthShell><ClientLogin /></AuthShell>} />
          <Route path="/change-password" element={<AuthShell><ClientChangePassword /></AuthShell>} />
          {/* Unified login: /admin/login is kept only as a redirect */}
          <Route path="/admin/login" element={<Navigate to="/login" replace />} />
          <Route path="/admin/change-password" element={<AuthShell><ChangePassword /></AuthShell>} />

          {/* Provider / operator workspace — its own shell, not the client Layout */}
          <Route
            path="/admin/*"
            element={
              <RequireAdmin>
                <AdminLayout>
                  <Routes>
                    <Route path="/" element={<AdminDashboard />} />
                    <Route path="/clients" element={<ClientsList />} />
                    <Route path="/clients/new" element={<ClientNew />} />
                    <Route path="/clients/:id" element={<ClientDetail />} />
                    <Route path="/users" element={<AdminUsers />} />
                    <Route path="/audit" element={<AdminAuditLog />} />
                    <Route path="/settings" element={<AdminSettings />} />
                    <Route path="/account" element={<AdminAccount />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </AdminLayout>
              </RequireAdmin>
            }
          />

          {/* Client portal */}
          <Route
            path="/*"
            element={
              <GlobalMonthProvider>
              <Layout>
                <Routes>
                  <Route path="/receipts" element={<RequireClient><ReceiptsList /></RequireClient>} />
                  <Route path="/receipts/download" element={<RequireClient><ReceiptsDownload /></RequireClient>} />
                  <Route path="/receipts/:id" element={<RequireClient><ReceiptView /></RequireClient>} />

                  <Route path="/" element={<RequireClient><TransactionList /></RequireClient>} />
                  <Route path="/transactions/new" element={<RequireClient><TransactionNew /></RequireClient>} />
                  <Route path="/transactions/:id" element={<RequireClient><TransactionDetail /></RequireClient>} />
                  <Route path="/vendors" element={<RequireClient><VendorsList /></RequireClient>} />
                  <Route path="/vendors/new" element={<RequireClient><VendorNew /></RequireClient>} />
                  <Route path="/vendors/:id" element={<RequireClient><VendorDetail /></RequireClient>} />
                  <Route path="/items" element={<RequireClient><ItemsList /></RequireClient>} />
                  <Route path="/wht" element={<RequireClient><WhtList /></RequireClient>} />
                  <Route path="/wht/print" element={<RequireClient><WhtPrint /></RequireClient>} />
                  <Route path="/settings" element={<RequireClient><Settings /></RequireClient>} />
                  <Route path="/metrics" element={<RequireClient><MetricsPage /></RequireClient>} />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Layout>
              </GlobalMonthProvider>
            }
          />
        </Routes>
      </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
