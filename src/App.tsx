import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index          from "./pages/Index";
import Portal         from "./pages/Portal";
import Dashboard      from "./pages/Dashboard";
import Admin          from "./pages/Admin";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound       from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/"                  element={<Index />} />
          <Route path="/portal"            element={<Portal />} />
          <Route path="/portal/dashboard"  element={<Dashboard />} />
          <Route path="/admin"             element={<Admin />} />
          <Route path="/admin/dashboard"   element={<AdminDashboard />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
