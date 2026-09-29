import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from './components/layout'
import { useAuth } from './lib/auth'
import { useClientAuth } from './lib/client-auth'
import { TransactionList } from './pages/TransactionList'
import { TransactionNew } from './pages/TransactionNew'
import { TransactionDetail } from './pages/TransactionDetail'
import { VendorSign } from './pages/VendorSign'
import { ReceiptView } from './pages/ReceiptView'
import { ReviewList } from './pages/ReviewList'
import { MetricsPage } from './pages/MetricsPage'
import { VerifyPage } from './pages/VerifyPage'
import { VendorsList } from './pages/VendorsList'
import { VendorNew } from './pages/VendorNew'
import { VendorDetail } from './pages/VendorDetail'
import { ItemsList } from './pages/ItemsList'
import { Settings } from './pages/Settings'
import { ClientLogin } from './pages/ClientLogin'
import { ClientChangePassword } from './pages/ClientChangePassword'
import { ClientsList } from './pages/admin/ClientsList'
import { ClientNew } from './pages/admin/ClientNew'
import { ClientDetail } from './pages/admin/ClientDetail'
import { Login } from './pages/admin/Login'
import { ChangePassword } from './pages/admin/ChangePassword'

const qc = new QueryClient()

const Loading = () => <p className="py-10 text-center text-sm text-ink-500">กำลังโหลด…</p>

// Standalone shell for auth pages — no portal nav/chrome.
const AuthShell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-paper">
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</div>
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
  const { ready, email, mustChangePw } = useAuth()
  if (!ready) return <Loading />
  if (!email) return <Navigate to="/admin/login" replace />
  if (mustChangePw) return <Navigate to="/admin/change-password" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Vendor + public verify + receipt copy: no account, standalone */}
          <Route path="/v/:token" element={<VendorSign />} />
          <Route path="/verify/:code" element={<AuthShell><VerifyPage /></AuthShell>} />

          {/* Auth pages: standalone, no portal chrome */}
          <Route path="/login" element={<AuthShell><ClientLogin /></AuthShell>} />
          <Route path="/change-password" element={<AuthShell><ClientChangePassword /></AuthShell>} />
          <Route path="/admin/login" element={<AuthShell><Login /></AuthShell>} />
          <Route path="/admin/change-password" element={<AuthShell><ChangePassword /></AuthShell>} />

          <Route
            path="/*"
            element={
              <Layout>
                <Routes>
                  <Route path="/receipts/:id" element={<ReceiptView />} />

                  <Route path="/" element={<RequireClient><TransactionList /></RequireClient>} />
                  <Route path="/transactions/new" element={<RequireClient><TransactionNew /></RequireClient>} />
                  <Route path="/transactions/:id" element={<RequireClient><TransactionDetail /></RequireClient>} />
                  <Route path="/vendors" element={<RequireClient><VendorsList /></RequireClient>} />
                  <Route path="/vendors/new" element={<RequireClient><VendorNew /></RequireClient>} />
                  <Route path="/vendors/:id" element={<RequireClient><VendorDetail /></RequireClient>} />
                  <Route path="/items" element={<RequireClient><ItemsList /></RequireClient>} />
                  <Route path="/settings" element={<RequireClient><Settings /></RequireClient>} />
                  <Route path="/review" element={<RequireClient><ReviewList /></RequireClient>} />
                  <Route path="/metrics" element={<RequireClient><MetricsPage /></RequireClient>} />

                  <Route path="/admin/clients" element={<RequireAdmin><ClientsList /></RequireAdmin>} />
                  <Route path="/admin/clients/new" element={<RequireAdmin><ClientNew /></RequireAdmin>} />
                  <Route path="/admin/clients/:id" element={<RequireAdmin><ClientDetail /></RequireAdmin>} />

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
