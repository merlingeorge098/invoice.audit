import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import { RequireSession } from "@/components/RequireSession";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { authPaths, demoPaths, tenantPaths } from "@/lib/workspace";
import AuthCallbackPage from "./pages/AuthCallbackPage.tsx";
import AuthStartPage from "./pages/AuthStartPage.tsx";
import SignupPage from "./pages/Signup.tsx";
import InviteAcceptPage from "./pages/InviteAccept.tsx";
import VendorPortalPage from "./pages/VendorPortalPage.tsx";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import UploadPage from "./pages/UploadPage.tsx";
import ProcessingPage from "./pages/ProcessingPage.tsx";
import DashboardPage from "./pages/DashboardPage.tsx";
import InvoiceDetailPage from "./pages/InvoiceDetailPage.tsx";
import ComparisonPage from "./pages/ComparisonPage.tsx";
import ReportsPage from "./pages/ReportsPage.tsx";
import ExceptionsPage from "./pages/ExceptionsPage.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";
import UnauthorizedPage from "./pages/UnauthorizedPage.tsx";

// Enterprise Workspace Pages
import EnterpriseDashboardPage from "./pages/enterprise/EnterpriseDashboardPage.tsx";
import EnterpriseUploadPage from "./pages/enterprise/EnterpriseUploadPage.tsx";
import EnterpriseProcessingPage from "./pages/enterprise/EnterpriseProcessingPage.tsx";
import EnterpriseInvoiceDetailPage from "./pages/enterprise/EnterpriseInvoiceDetailPage.tsx";
import EnterpriseComparisonPage from "./pages/enterprise/EnterpriseComparisonPage.tsx";
import EnterpriseReportsPage from "./pages/enterprise/EnterpriseReportsPage.tsx";
import EnterpriseExceptionsPage from "./pages/enterprise/EnterpriseExceptionsPage.tsx";
import EnterpriseSettingsPage from "./pages/enterprise/EnterpriseSettingsPage.tsx";
import EnterpriseReconciliationPage from "./pages/enterprise/EnterpriseReconciliationPage.tsx";

// New app pages
import BillingPage from "./pages/app/BillingPage.tsx";
import TeamPage from "./pages/app/TeamPage.tsx";
import VendorsPage from "./pages/app/VendorsPage.tsx";
import AuditTrailPage from "./pages/app/AuditTrailPage.tsx";
import NotificationsPage from "./pages/app/NotificationsPage.tsx";
import ERPPage from "./pages/app/ERPPage.tsx";
import APIKeysPage from "./pages/app/APIKeysPage.tsx";

// Admin
import SuperAdminPage from "./pages/admin/SuperAdminPage.tsx";

function LegacyInvoiceRedirect() {
  const { id = "" } = useParams();
  return <Navigate to={demoPaths.invoice(id)} replace />;
}

function LegacyComparisonRedirect() {
  const { id = "" } = useParams();
  return <Navigate to={demoPaths.comparison(id)} replace />;
}

function TenantRootRedirect() {
  const { tenantSlug = "" } = useParams();
  return <Navigate to={tenantPaths.dashboard(tenantSlug)} replace />;
}

function withTenantGuard(element: JSX.Element) {
  return <RequireSession>{element}</RequireSession>;
}

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthSessionProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public pages */}
            <Route path="/" element={<Index />} />
            <Route path={authPaths.start} element={<AuthStartPage />} />
            <Route path={authPaths.callback} element={<AuthCallbackPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/invite/:token" element={<InviteAcceptPage />} />
            <Route path="/vendor-portal/:token" element={<VendorPortalPage />} />

            {/* Demo workspace — DO NOT MODIFY */}
            <Route path={demoPaths.root} element={<Navigate to={demoPaths.dashboard} replace />} />
            <Route path={demoPaths.dashboard} element={<DashboardPage />} />
            <Route path={demoPaths.upload} element={<UploadPage />} />
            <Route path={demoPaths.processing} element={<ProcessingPage />} />
            <Route path={demoPaths.exceptions} element={<ExceptionsPage />} />
            <Route path="/demo/invoice/:id" element={<InvoiceDetailPage />} />
            <Route path="/demo/comparison/:id" element={<ComparisonPage />} />
            <Route path={demoPaths.reports} element={<ReportsPage />} />
            <Route path={demoPaths.settings} element={<SettingsPage />} />

            {/* Enterprise tenant workspace */}
            <Route path="/app/:tenantSlug" element={withTenantGuard(<TenantRootRedirect />)} />
            <Route path="/app/:tenantSlug/dashboard" element={withTenantGuard(<EnterpriseDashboardPage />)} />
            <Route path="/app/:tenantSlug/upload" element={withTenantGuard(<EnterpriseUploadPage />)} />
            <Route path="/app/:tenantSlug/processing" element={withTenantGuard(<EnterpriseProcessingPage />)} />
            <Route path="/app/:tenantSlug/exceptions" element={withTenantGuard(<EnterpriseExceptionsPage />)} />
            <Route path="/app/:tenantSlug/invoice/:id" element={withTenantGuard(<EnterpriseInvoiceDetailPage />)} />
            <Route path="/app/:tenantSlug/comparison/:id" element={withTenantGuard(<EnterpriseComparisonPage />)} />
            <Route path="/app/:tenantSlug/reports" element={withTenantGuard(<EnterpriseReportsPage />)} />
            <Route path="/app/:tenantSlug/settings" element={withTenantGuard(<EnterpriseSettingsPage />)} />
            <Route path="/app/:tenantSlug/reconciliation" element={withTenantGuard(<EnterpriseReconciliationPage />)} />

            {/* New enterprise pages */}
            <Route path="/app/:tenantSlug/settings/billing" element={withTenantGuard(<BillingPage />)} />
            <Route path="/app/:tenantSlug/settings/team" element={withTenantGuard(<TeamPage />)} />
            <Route path="/app/:tenantSlug/settings/vendors" element={withTenantGuard(<VendorsPage />)} />
            <Route path="/app/:tenantSlug/settings/erp" element={withTenantGuard(<ERPPage />)} />
            <Route path="/app/:tenantSlug/settings/api-keys" element={withTenantGuard(<APIKeysPage />)} />
            <Route path="/app/:tenantSlug/audit" element={withTenantGuard(<AuditTrailPage />)} />
            <Route path="/app/:tenantSlug/notifications" element={withTenantGuard(<NotificationsPage />)} />

            {/* Super-admin console — session required */}
            <Route path="/admin" element={<RequireSession><SuperAdminPage /></RequireSession>} />

            {/* Misc */}
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            <Route path="/dashboard" element={<Navigate to={demoPaths.dashboard} replace />} />
            <Route path="/upload" element={<Navigate to={demoPaths.upload} replace />} />
            <Route path="/processing" element={<Navigate to={demoPaths.processing} replace />} />
            <Route path="/exceptions" element={<Navigate to={demoPaths.exceptions} replace />} />
            <Route path="/invoice/:id" element={<LegacyInvoiceRedirect />} />
            <Route path="/comparison/:id" element={<LegacyComparisonRedirect />} />
            <Route path="/reports" element={<Navigate to={demoPaths.reports} replace />} />
            <Route path="/settings" element={<Navigate to={demoPaths.settings} replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthSessionProvider>
  </QueryClientProvider>
);

export default App;
