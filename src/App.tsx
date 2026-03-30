import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import UploadPage from "./pages/UploadPage.tsx";
import ProcessingPage from "./pages/ProcessingPage.tsx";
import DashboardPage from "./pages/DashboardPage.tsx";
import InvoiceDetailPage from "./pages/InvoiceDetailPage.tsx";
import ComparisonPage from "./pages/ComparisonPage.tsx";
import ReportsPage from "./pages/ReportsPage.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/processing" element={<ProcessingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/invoice/:id" element={<InvoiceDetailPage />} />
          <Route path="/comparison" element={<ComparisonPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
