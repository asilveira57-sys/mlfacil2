import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState } from "react";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ShippingLabels from "./pages/ShippingLabels";
import LabelHeaderSettings from "./pages/LabelHeaderSettings";
import ZPLConverter from "./pages/ZPLConverter";
import AbcAnalysis from "./pages/AbcAnalysis";
import Tendencias from "./pages/Tendencias";
import NotFound from "./pages/NotFound";

const App = () => {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/shipping-labels" element={<ShippingLabels />} />
            <Route path="/shipping-labels/header-settings" element={<LabelHeaderSettings />} />
            <Route path="/zpl-converter" element={<ZPLConverter />} />
            <Route path="/abc-analysis" element={<AbcAnalysis />} />
            <Route path="/tendencias" element={<Tendencias />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
