import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { ConfirmProvider } from '@/components/ui/Confirm';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { ProtectedRoute, AdminRoute, PublicOnlyRoute } from '@/features/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { MorePage } from '@/features/more/MorePage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { GuestsPage } from '@/features/guests/GuestsPage';
import { NewInvoicePage } from '@/features/invoices/NewInvoicePage';
import { InvoicesPage } from '@/features/invoices/InvoicesPage';
import { InvoiceDetailPage } from '@/features/invoices/InvoiceDetailPage';
import { CompliancePage } from '@/features/compliance/CompliancePage';
import { CalculatorsPage } from '@/features/compliance/CalculatorsPage';
import { KprPage } from '@/features/kpr/KprPage';
import { StaysPage } from '@/features/stays/StaysPage';
import { CheckInPage } from '@/features/stays/CheckInPage';
import { StayDetailPage } from '@/features/stays/StayDetailPage';
import { AdminPage } from '@/admin/AdminPage';
import { TenantDetailPage } from '@/admin/TenantDetailPage';

// Analytics pulls in the charting library — load it only when visited so the
// initial PWA bundle stays lean.
const AnalyticsPage = lazy(() =>
  import('@/features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
);

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AuthProvider>
              <Routes>
                {/* Public (redirects to app if already signed in) */}
                <Route element={<PublicOnlyRoute />}>
                  <Route path="/prijava" element={<LoginPage />} />
                  <Route path="/registracija" element={<RegisterPage />} />
                </Route>

                {/* Authenticated app */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppShell />}>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/racuni" element={<InvoicesPage />} />
                    <Route path="/racuni/novi" element={<NewInvoicePage />} />
                    <Route path="/racuni/:id" element={<InvoiceDetailPage />} />
                    <Route path="/gosti" element={<GuestsPage />} />
                    <Route path="/boravci" element={<StaysPage />} />
                    <Route path="/boravci/prijava" element={<CheckInPage />} />
                    <Route path="/boravci/:id" element={<StayDetailPage />} />
                    <Route path="/obveze" element={<CompliancePage />} />
                    <Route path="/kalkulatori" element={<CalculatorsPage />} />
                    <Route path="/kpr" element={<KprPage />} />
                    <Route
                      path="/analitika"
                      element={
                        <Suspense
                          fallback={
                            <div className="flex justify-center py-16">
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                          }
                        >
                          <AnalyticsPage />
                        </Suspense>
                      }
                    />
                    <Route path="/postavke" element={<SettingsPage />} />
                    <Route path="/vise" element={<MorePage />} />
                  </Route>
                </Route>

                {/* Admin backoffice */}
                <Route element={<AdminRoute />}>
                  <Route element={<AppShell />}>
                    <Route path="/admin" element={<AdminPage />} />
                    <Route path="/admin/korisnici/:id" element={<TenantDetailPage />} />
                  </Route>
                </Route>
              </Routes>
            </AuthProvider>
          </BrowserRouter>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
