import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { ActiveAccountProvider } from "@/contexts/ActiveAccountContext";
import { UserAccessProvider } from "@/contexts/UserAccessContext";
import { RefreshPolicyProvider } from "@/contexts/RefreshPolicyContext";
import { FacebookTrackingProvider } from "@/contexts/FacebookTrackingContext";
import { RouteChangeCleanup } from "@/components/layout/RouteChangeCleanup";
import { AccountChangeInvalidator } from "@/components/layout/AccountChangeInvalidator";
import { AppShellLayout } from "@/components/layout/AppShellLayout";
import { OnboardingWizard } from "@/components/onboarding";
import { TrialExpiredPaywall, ModuleAccessGuard } from "@/components/access";
import { ScrollToTop } from "@/components/ScrollToTop";
import { SeoHead } from "@/components/seo/SeoHead";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import ShippingLabels from "./pages/ShippingLabels";
import LabelHeaderSettings from "./pages/LabelHeaderSettings";
import ZPLConverter from "./pages/ZPLConverter";
import AbcAnalysis from "./pages/AbcAnalysis";
import TendenciasV2 from "./pages/TendenciasV2";
import Mercado from "./pages/Mercado";
import Custos from "./pages/Custos";
import Concorrencia from "./pages/Concorrencia";
import Radiografia from "./pages/Radiografia";
import Tarefas from "./pages/Tarefas";
import TarefaDetalhe from "./pages/TarefaDetalhe";
import Settings from "./pages/Settings";
import Blog from "./pages/Blog";
import Planos from "./pages/Planos";
import AdminPlanos from "./pages/AdminPlanos";
import Publicidade from "./pages/Publicidade";
import Promocoes from "./pages/Promocoes";
import MensagensPosVenda from "./pages/MensagensPosVenda";
import Perguntas from "./pages/Perguntas";
import Admin from "./pages/Admin";
import AdTimelineRadar from "./pages/AdTimelineRadar";
import AdTimelineDetail from "./pages/AdTimelineDetail";
import AdActionsCenter from "./pages/AdActionsCenter";
import Seed from "./pages/Seed";
import FreightManagement from "./pages/FreightManagement";
import ProductsPage from "./pages/ProductsPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import NotFound from "./pages/NotFound";
import { ZplViewerTool, TrendsLiteTool, PricingSimulatorTool, CommissionsTool } from "./pages/tools";
import { AdminRoute } from "./components/auth/AdminRoute";

// NOTE: GlobalWatchdogs removed to prevent background activity storms on tab focus.
// Cost/orders sync is now triggered only by explicit user actions or module-specific buttons.

const App = () => {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // CRITICAL: Disable automatic refetching on window focus
        refetchOnWindowFocus: false,
        // Disable refetch on reconnect (network recovery)
        refetchOnReconnect: false,
        // STATIC MODE: Data never becomes stale automatically
        staleTime: Infinity,
        // Keep unused data in cache for 24 hours
        gcTime: 24 * 60 * 60 * 1000,
        // Don't retry failed queries automatically
        retry: 0,
        // Prevent refetch on mount if data exists
        refetchOnMount: false,
      },
    },
  }));
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.info("[MOUNT] App");
    return () => {
      // eslint-disable-next-line no-console
      console.info("[UNMOUNT] App");
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    let lastLogAt = 0;
    const unsubscribe = queryClient.getQueryCache().subscribe((event: any) => {
      const now = Date.now();
      if (now - lastLogAt < 250) return;
      lastLogAt = now;

      const query = event?.query;
      const key = query?.queryKey ? JSON.stringify(query.queryKey) : undefined;
      // eslint-disable-next-line no-console
      console.debug(
        "[RQ]",
        event?.type,
        key,
        query?.state?.fetchStatus,
        query?.state?.status,
      );
    });

    return () => unsubscribe();
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <RefreshPolicyProvider>
        <TooltipProvider>
          <ActiveAccountProvider>
            <UserAccessProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
              <ScrollToTop />
              <FacebookTrackingProvider>
              <RouteChangeCleanup />
              <AccountChangeInvalidator />
              <SeoHead />
              <OnboardingWizard />
              <TrialExpiredPaywall />
              <ModuleAccessGuard>
              <Routes>
                {/* Public routes (no shell) */}
                <Route path="/" element={<Index />} />
                <Route path="/home" element={<Index />} />
                <Route path="/planos" element={<Planos />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/blog" element={<Blog />} />
                <Route path="/blog/:slug" element={<Blog />} />
                <Route path="/blog/categoria/:slug" element={<Blog />} />
                
                {/* Public Tools routes (no shell) */}
                <Route path="/ferramentas/zpl" element={<ZplViewerTool />} />
                <Route path="/ferramentas/tendencias" element={<TrendsLiteTool />} />
                <Route path="/ferramentas/precificacao" element={<PricingSimulatorTool />} />
                <Route path="/ferramentas/comissoes" element={<CommissionsTool />} />

                {/* Dashboard routes (with persistent shell) */}
                <Route element={<AppShellLayout />}>
                  <Route path="/inicio" element={<Home />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/shipping-labels" element={<ShippingLabels />} />
                  <Route path="/shipping-labels/header-settings" element={<LabelHeaderSettings />} />
                  <Route path="/zpl-converter" element={<ZPLConverter />} />
                  <Route path="/abc-analysis" element={<AbcAnalysis />} />
                  <Route path="/tendencias" element={<TendenciasV2 />} />
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
                  <Route path="/mensagens" element={<MensagensPosVenda />} />
                  <Route path="/perguntas" element={<Perguntas />} />
                  {/* Ad Timeline routes */}
                  <Route path="/anuncios/linha-do-tempo" element={<AdTimelineRadar />} />
                  <Route path="/anuncios/linha-do-tempo/:itemId" element={<AdTimelineDetail />} />
                  <Route path="/anuncios/acoes" element={<AdActionsCenter />} />
                  {/* Seed routes */}
                  <Route path="/seed" element={<Seed />} />
                  <Route path="/seed/:itemId" element={<Seed />} />
                  <Route path="/seed/sementes" element={<Seed />} />
                  <Route path="/frete" element={<FreightManagement />} />
                  {/* Products module */}
                  <Route path="/produtos" element={<ProductsPage />} />
                  <Route path="/produtos/:id" element={<ProductDetailPage />} />
                  {/* Admin routes (also inside persistent shell) */}
                  <Route path="/admin/*" element={<AdminRoute><Admin /></AdminRoute>} />
                  <Route path="/admin/planos" element={<AdminRoute><AdminPlanos /></AdminRoute>} />
                </Route>
                
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              </ModuleAccessGuard>
              </FacebookTrackingProvider>
              </BrowserRouter>
            </UserAccessProvider>
          </ActiveAccountProvider>
        </TooltipProvider>
      </RefreshPolicyProvider>
    </QueryClientProvider>
  );
};

export default App;
