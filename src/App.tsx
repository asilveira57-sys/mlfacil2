import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCostSyncWatchdog } from "@/hooks/useCostSyncWatchdog";
import { useOrdersSyncWatchdog } from "@/hooks/useOrdersSyncWatchdog";
import { ActiveAccountProvider } from "@/contexts/ActiveAccountContext";
import { UserAccessProvider } from "@/contexts/UserAccessContext";
import { RouteChangeCleanup } from "@/components/layout/RouteChangeCleanup";
import { OnboardingWizard } from "@/components/onboarding";
import { TrialExpiredPaywall } from "@/components/access";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ShippingLabels from "./pages/ShippingLabels";
import LabelHeaderSettings from "./pages/LabelHeaderSettings";
import ZPLConverter from "./pages/ZPLConverter";
import AbcAnalysis from "./pages/AbcAnalysis";
import Tendencias from "./pages/Tendencias";
import Mercado from "./pages/Mercado";
import Custos from "./pages/Custos";
import Concorrencia from "./pages/Concorrencia";
import Radiografia from "./pages/Radiografia";
import Tarefas from "./pages/Tarefas";
import TarefaDetalhe from "./pages/TarefaDetalhe";
import Settings from "./pages/Settings";
import Blog from "./pages/Blog";
import BlogAdmin from "./pages/BlogAdmin";
import Planos from "./pages/Planos";
import AdminPlanos from "./pages/AdminPlanos";
import Publicidade from "./pages/Publicidade";
import Promocoes from "./pages/Promocoes";
import NotFound from "./pages/NotFound";
import { AdminRoute } from "./components/auth/AdminRoute";

// Global watchdog provider component - handles both cost and orders sync
function GlobalWatchdogs() {
  const [sellerId, setSellerId] = useState<string | null>(() => {
    return localStorage.getItem("cost_watchdog_seller_id");
  });
  const [enabled, setEnabled] = useState(() => {
    return localStorage.getItem("cost_watchdog_enabled") !== "false";
  });

  useEffect(() => {
    const syncFromStorage = () => {
      setSellerId(localStorage.getItem("cost_watchdog_seller_id"));
      setEnabled(localStorage.getItem("cost_watchdog_enabled") !== "false");
    };

    // Initial sync
    syncFromStorage();

    // Check auth and get first active seller (only if none is stored)
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSellerId(null);
        setEnabled(false);
        return;
      }

      const storedSellerId = localStorage.getItem("cost_watchdog_seller_id");
      if (!storedSellerId) {
        const { data: accounts } = await supabase
          .from("ml_accounts")
          .select("ml_user_id")
          .eq("user_id", session.user.id)
          .eq("is_active", true)
          .limit(1);

        if (accounts?.[0]) {
          localStorage.setItem("cost_watchdog_seller_id", accounts[0].ml_user_id);
          localStorage.setItem("cost_watchdog_enabled", "true");
          syncFromStorage();
        }
      }
    };

    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setSellerId(null);
        setEnabled(false);
        localStorage.removeItem("cost_watchdog_seller_id");
      } else if (event === "SIGNED_IN") {
        checkAuth();
      }
    });

    // Cross-tab updates
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "cost_watchdog_enabled" || e.key === "cost_watchdog_seller_id") {
        syncFromStorage();
      }
    };

    // Same-tab updates (CostSettings dispatches this)
    const handleWatchdogUpdate = () => syncFromStorage();

    // Also resync when tab regains focus
    const handleFocus = () => syncFromStorage();

    window.addEventListener("storage", handleStorage);
    window.addEventListener("cost_watchdog_update", handleWatchdogUpdate as EventListener);
    window.addEventListener("focus", handleFocus);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("cost_watchdog_update", handleWatchdogUpdate as EventListener);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // Run both global watchdogs
  useCostSyncWatchdog(sellerId, enabled);
  useOrdersSyncWatchdog(sellerId, enabled);

  return null;
}

const App = () => {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ActiveAccountProvider>
          <UserAccessProvider>
            <Toaster />
            <Sonner />
            <GlobalWatchdogs />
            <BrowserRouter>
              <RouteChangeCleanup />
              <OnboardingWizard />
              <TrialExpiredPaywall />
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/home" element={<Index />} />
                <Route path="/planos" element={<Planos />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/shipping-labels" element={<ShippingLabels />} />
                <Route path="/shipping-labels/header-settings" element={<LabelHeaderSettings />} />
                <Route path="/zpl-converter" element={<ZPLConverter />} />
                <Route path="/abc-analysis" element={<AbcAnalysis />} />
                <Route path="/tendencias" element={<Tendencias />} />
                <Route path="/mercado" element={<Mercado />} />
                <Route path="/custos" element={<Custos />} />
                <Route path="/concorrencia" element={<Concorrencia />} />
                <Route path="/radiografia" element={<Radiografia />} />
                <Route path="/tarefas" element={<Tarefas />} />
                <Route path="/tarefas/quadro" element={<Tarefas />} />
                <Route path="/tarefas/inbox" element={<Tarefas />} />
                <Route path="/tarefas/regras" element={<Tarefas />} />
                <Route path="/tarefas/:id" element={<TarefaDetalhe />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/publicidade" element={<Publicidade />} />
                <Route path="/promocoes" element={<Promocoes />} />
                {/* Blog routes */}
                <Route path="/blog" element={<Blog />} />
                <Route path="/blog/:slug" element={<Blog />} />
                <Route path="/blog/categoria/:slug" element={<Blog />} />
                {/* Admin routes - protected by AdminRoute guard */}
                <Route path="/admin/blog/*" element={<AdminRoute><BlogAdmin /></AdminRoute>} />
                <Route path="/admin/planos" element={<AdminRoute><AdminPlanos /></AdminRoute>} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </UserAccessProvider>
        </ActiveAccountProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
