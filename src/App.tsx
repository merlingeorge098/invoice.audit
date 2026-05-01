import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { authPaths, demoPaths } from "@/lib/workspace";
import AuthCallbackPage from "./pages/AuthCallbackPage.tsx";
import AuthStartPage from "./pages/AuthStartPage.tsx";
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

function LegacyInvoiceRedirect() {
  const { id = "" } = useParams();
  return <Navigate to={demoPaths.invoice(id)} replace />;
}

function LegacyComparisonRedirect() {
  const { id = "" } = useParams();
  return <Navigate to={demoPaths.comparison(id)} replace />;
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
            <Route path="/" element={<Index />} />
            <Route path={authPaths.start} element={<AuthStartPage />} />
            <Route path={authPaths.callback} element={<AuthCallbackPage />} />
            <Route path={demoPaths.root} element={<Navigate to={demoPaths.dashboard} replace />} />
            <Route path={demoPaths.dashboard} element={<DashboardPage />} />
            <Route path={demoPaths.upload} element={<UploadPage />} />
            <Route path={demoPaths.processing} element={<ProcessingPage />} />
            <Route path={demoPaths.exceptions} element={<ExceptionsPage />} />
            <Route path="/demo/invoice/:id" element={<InvoiceDetailPage />} />
            <Route path="/demo/comparison/:id" element={<ComparisonPage />} />
            <Route path={demoPaths.reports} element={<ReportsPage />} />
            <Route path={demoPaths.settings} element={<SettingsPage />} />

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
