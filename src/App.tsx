import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import { ActiveAccountProvider } from "@/contexts/ActiveAccountContext";
import { UserAccessProvider } from "@/contexts/UserAccessContext";
import { RefreshPolicyProvider } from "@/contexts/RefreshPolicyContext";
import { CookieConsentGate } from "@/components/cookies/CookieConsentGate";
import { RouteChangeCleanup } from "@/components/layout/RouteChangeCleanup";
import { AccountChangeInvalidator } from "@/components/layout/AccountChangeInvalidator";
import { AppShellLayout } from "@/components/layout/AppShellLayout";
import { queryPersister, PERSIST_MAX_AGE, PERSIST_BUSTER_KEY, shouldPersistQuery } from "@/lib/queryPersister";
import { usePostLoginPrefetch } from "@/hooks/usePostLoginPrefetch";


import { TrialExpiredPaywall, BillingDataGate, ModuleAccessGuard } from "@/components/access";
import { ShippingEligibilityGuard } from "@/components/access/ShippingEligibilityGuard";
import { ScrollToTop } from "@/components/ScrollToTop";
import { SeoHead } from "@/components/seo/SeoHead";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";

// === Eager-loaded routes (critical path) ===
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import CriarAcesso from "./pages/CriarAcesso";
import Verificar from "./pages/Verificar";
import PrimeiroAcesso from "./pages/PrimeiroAcesso";
import Reconnecting from "./pages/Reconnecting";
import Sincronizando from "./pages/Sincronizando";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import PublicLayout from "./components/PublicLayout";
import { AdminRoute } from "./components/auth/AdminRoute";

// === Lazy-loaded routes (heavy modules) ===
const clearLazyReloadFlag = () => {
  try { sessionStorage.removeItem('lazy_module_reloaded'); } catch { /* ignore */ }
};

const lazyRetry = (factory: () => Promise<any>) =>
  lazy(() =>
    factory()
      .then((mod) => { clearLazyReloadFlag(); return mod; })
      .catch(() =>
        new Promise<any>((resolve, reject) => {
          // First retry after 1.5s
          setTimeout(() => {
            factory()
              .then((mod) => { clearLazyReloadFlag(); resolve(mod); })
              .catch(() => {
                // Second retry after another 1.5s
                setTimeout(() => {
                  factory()
                    .then((mod) => { clearLazyReloadFlag(); resolve(mod); })
                    .catch((err) => {
                      // All retries failed — force full page reload once with cache-busting.
                      // If the flag is already set, propagate the error so the
                      // RouteErrorBoundary can render a recovery UI (avoids blank screen).
                      if (!sessionStorage.getItem('lazy_module_reloaded')) {
                        try { sessionStorage.setItem('lazy_module_reloaded', '1'); } catch { /* ignore */ }
                        // Limpa Service Worker / Cache API antes do reload para garantir
                        // que o navegador busque o index.html mais recente.
                        const doReload = () => {
                          try {
                            const url = new URL(window.location.href);
                            url.searchParams.set('_v', String(Date.now()));
                            window.location.replace(url.toString());
                          } catch {
                            window.location.reload();
                          }
                        };
                        (async () => {
                          try {
                            if ('caches' in window) {
                              const keys = await caches.keys();
                              await Promise.all(keys.map((k) => caches.delete(k)));
                            }
                            if ('serviceWorker' in navigator) {
                              const regs = await navigator.serviceWorker.getRegistrations();
                              await Promise.all(regs.map((r) => r.unregister()));
                            }
                          } catch { /* ignore */ }
                          doReload();
                        })();
                      } else {
                        clearLazyReloadFlag();
                        reject(err);
                      }
                    });
                }, 1500);
              });
          }, 1500);
        }),
      ),
  );

const ShippingLabels = lazyRetry(() => import("./pages/ShippingLabels"));
const LabelTeste = lazyRetry(() => import("./pages/LabelTeste"));
const LabelHeaderSettings = lazyRetry(() => import("./pages/LabelHeaderSettings"));
const ZPLConverter = lazyRetry(() => import("./pages/ZPLConverter"));
const AbcAnalysis = lazyRetry(() => import("./pages/AbcAnalysis"));
const TendenciasV2 = lazyRetry(() => import("./pages/TendenciasV2"));
const Mercado = lazyRetry(() => import("./pages/Mercado"));
const Custos = lazyRetry(() => import("./pages/Custos"));
const Concorrencia = lazyRetry(() => import("./pages/Concorrencia"));
const Radiografia = lazyRetry(() => import("./pages/Radiografia"));
const Tarefas = lazyRetry(() => import("./pages/Tarefas"));
const TarefaDetalhe = lazyRetry(() => import("./pages/TarefaDetalhe"));
const Settings = lazyRetry(() => import("./pages/Settings"));
const Blog = lazyRetry(() => import("./pages/Blog"));
const Planos = lazyRetry(() => import("./pages/Planos"));
const AdminPlanos = lazyRetry(() => import("./pages/AdminPlanos"));
const Publicidade = lazyRetry(() => import("./pages/Publicidade"));
const Promocoes = lazyRetry(() => import("./pages/Promocoes"));
const MensagensPosVenda = lazyRetry(() => import("./pages/MensagensPosVenda"));
const Perguntas = lazyRetry(() => import("./pages/Perguntas"));
const Admin = lazyRetry(() => import("./pages/Admin"));
const AdTimelineRadar = lazyRetry(() => import("./pages/AdTimelineRadar"));
const AdTimelineDetail = lazyRetry(() => import("./pages/AdTimelineDetail"));
const AdActionsCenter = lazyRetry(() => import("./pages/AdActionsCenter"));
const Seed = lazyRetry(() => import("./pages/Seed"));
const PostIts = lazyRetry(() => import("./pages/PostIts"));

const FreightManagement = lazyRetry(() => import("./pages/FreightManagement"));
const Precificacao = lazyRetry(() => import("./pages/Precificacao"));
const Comissoes = lazyRetry(() => import("./pages/Comissoes"));
const Financeiro = lazyRetry(() => import("./pages/financeiro/Financeiro"));
const Retrospectiva = lazyRetry(() => import("./pages/Retrospectiva"));
const Consultoria = lazyRetry(() => import("./pages/Consultoria"));
const ModuloDetalhe = lazyRetry(() => import("./pages/ModuloDetalhe"));
const ProductsPage = lazyRetry(() => import("./pages/ProductsPage"));
const ProductDetailPage = lazyRetry(() => import("./pages/ProductDetailPage"));
const TermosDeUso = lazyRetry(() => import("./pages/TermosDeUso"));
const PoliticaPrivacidade = lazyRetry(() => import("./pages/PoliticaPrivacidade"));
const PoliticaCookies = lazyRetry(() => import("./pages/PoliticaCookies"));
const Lgpd = lazyRetry(() => import("./pages/Lgpd"));
const SocialCalendar = lazyRetry(() => import("./pages/SocialCalendar"));
const ConsultantLibrary = lazyRetry(() => import("./pages/ConsultantLibrary"));
const PublicTipPage = lazyRetry(() => import("./pages/PublicTipPage"));
const ClonarAnuncio = lazyRetry(() => import("./pages/ClonarAnuncio"));
const AjustePreco = lazyRetry(() => import("./pages/AjustePreco"));
const Atacado = lazyRetry(() => import("./pages/Atacado"));
const SystemStatus = lazyRetry(() => import("./pages/SystemStatus"));
const Contato = lazyRetry(() => import("./pages/Contato"));
const Suporte = lazyRetry(() => import("./pages/Suporte"));
const CentralDeAjuda = lazyRetry(() => import("./pages/CentralDeAjuda"));
const CentralDeAjudaArtigo = lazyRetry(() => import("./pages/CentralDeAjudaArtigo"));

// Tools - lazy loaded
const ZplViewerTool = lazyRetry(() => import("./pages/tools/ZplViewerTool"));
const TrendsLiteTool = lazyRetry(() => import("./pages/tools/TrendsLiteTool"));
const PricingSimulatorTool = lazyRetry(() => import("./pages/tools/PricingSimulatorTool"));
const CommissionsTool = lazyRetry(() => import("./pages/tools/CommissionsTool"));

// NOTE: GlobalWatchdogs removed to prevent background activity storms on tab focus.
// Cost/orders sync is now triggered only by explicit user actions or module-specific buttons.

const LazyFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
  </div>
);

/** Inner component that uses hooks requiring QueryClient context */
function AppInner() {
  usePostLoginPrefetch();
  return null;
}

const App = () => {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        retryOnMount: false,
        staleTime: Infinity,
        gcTime: 24 * 60 * 60 * 1000,
        retry: 0,
      },
    },
  }));

  const persistOptions = {
    persister: queryPersister,
    maxAge: PERSIST_MAX_AGE,
    buster: PERSIST_BUSTER_KEY,
    dehydrateOptions: {
      shouldDehydrateQuery: (query: any) => {
        // Only persist successful queries that match our whitelist
        return query.state.status === 'success' && shouldPersistQuery(query.queryKey);
      },
    },
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.info("[MOUNT] App");
    return () => { console.info("[UNMOUNT] App"); };
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
      console.debug("[RQ]", event?.type, key, query?.state?.fetchStatus, query?.state?.status);
    });

    return () => unsubscribe();
  }, [queryClient]);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <RefreshPolicyProvider>
        <TooltipProvider>
          <ActiveAccountProvider>
            <UserAccessProvider>
              <Toaster />
              <Sonner />
              <AppInner />
              <BrowserRouter>
              <ScrollToTop />
              <CookieConsentGate>
              <RouteChangeCleanup />
              <AccountChangeInvalidator />
              <SeoHead />
              
              
              <TrialExpiredPaywall />
              <BillingDataGate />
              <ModuleAccessGuard>
              <RouteErrorBoundary>
              <Suspense fallback={<LazyFallback />}>
              <Routes>
                {/* ===== Public routes (no shell, no auth) ===== */}
                <Route path="/" element={<Index />} />
                <Route path="/home" element={<Index />} />
                <Route path="/planos" element={<Planos />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/criar-acesso" element={<CriarAcesso />} />
                <Route path="/verificar" element={<Verificar />} />
                <Route path="/reconnecting" element={<Reconnecting />} />
                <Route path="/blog" element={<Blog />} />
                <Route path="/blog/:slug" element={<Blog />} />
                <Route path="/blog/categoria/:slug" element={<Blog />} />
                <Route path="/consultoria" element={<Consultoria />} />
                <Route path="/termos-de-uso" element={<TermosDeUso />} />
                <Route path="/politica-de-privacidade" element={<PoliticaPrivacidade />} />
                <Route path="/politica-de-cookies" element={<PoliticaCookies />} />
                <Route path="/lgpd" element={<Lgpd />} />
                <Route path="/modulo/:slug" element={<ModuloDetalhe />} />
                <Route path="/dica/:slug" element={<PublicTipPage />} />
                {/* Public Tools */}
                <Route path="/ferramentas/zpl" element={<ZplViewerTool />} />
                <Route path="/ferramentas/tendencias" element={<TrendsLiteTool />} />
                <Route path="/ferramentas/precificacao" element={<PricingSimulatorTool />} />
                <Route path="/ferramentas/comissoes" element={<CommissionsTool />} />
                <Route path="/status" element={<PublicLayout><SystemStatus /></PublicLayout>} />
                <Route path="/contato" element={<PublicLayout><Contato /></PublicLayout>} />
                <Route path="/suporte" element={<Suporte />} />
                <Route path="/central-de-ajuda" element={<PublicLayout><CentralDeAjuda /></PublicLayout>} />
                <Route path="/central-de-ajuda/:slug" element={<PublicLayout><CentralDeAjudaArtigo /></PublicLayout>} />

                {/* ===== First access (auth required, onboarding page) ===== */}
                <Route path="/primeiro-acesso" element={<PrimeiroAcesso />} />
                <Route path="/sincronizando" element={<ProtectedRoute><Sincronizando /></ProtectedRoute>} />

                {/* ===== Protected dashboard routes (with persistent shell) ===== */}
                <Route element={<AppShellLayout />}>
                  <Route path="/inicio" element={<Home />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/shipping-labels" element={<ShippingEligibilityGuard><ShippingLabels /></ShippingEligibilityGuard>} />
                  <Route path="/label-teste" element={<LabelTeste />} />
                  <Route path="/shipping-labels/header-settings" element={<ShippingEligibilityGuard><LabelHeaderSettings /></ShippingEligibilityGuard>} />
                  <Route path="/zpl-converter" element={<ShippingEligibilityGuard><ZPLConverter /></ShippingEligibilityGuard>} />
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
                  <Route path="/anuncios/linha-do-tempo" element={<AdTimelineRadar />} />
                  <Route path="/anuncios/linha-do-tempo/:itemId" element={<AdTimelineDetail />} />
                  <Route path="/anuncios/acoes" element={<AdActionsCenter />} />
                  <Route path="/anuncios/clonar" element={<ClonarAnuncio />} />
                  <Route path="/ajuste-preco" element={<AjustePreco />} />
                  <Route path="/atacado" element={<Atacado />} />
                  <Route path="/seed" element={<Seed />} />
                  <Route path="/postits" element={<PostIts />} />
                  <Route path="/seed/:itemId" element={<Seed />} />
                  <Route path="/seed/sementes" element={<Seed />} />
                  
                  <Route path="/frete" element={<FreightManagement />} />
                  <Route path="/biblioteca-dicas" element={<ConsultantLibrary />} />
                  <Route path="/precificacao" element={<Precificacao />} />
                  <Route path="/calendario-social" element={<SocialCalendar />} />
                  <Route path="/comissoes" element={<Comissoes />} />
                  <Route path="/retrospectiva" element={<Retrospectiva />} />
                  <Route path="/financeiro" element={<Financeiro />} />
                  <Route path="/financeiro/resumo" element={<Financeiro />} />
                  <Route path="/financeiro/recebimentos" element={<Financeiro />} />
                  <Route path="/financeiro/movimentos" element={<Financeiro />} />
                  <Route path="/financeiro/conciliacao" element={<Financeiro />} />
                  <Route path="/financeiro/rotinas" element={<Financeiro />} />
                  <Route path="/financeiro/integracoes" element={<Financeiro />} />
                  <Route path="/produtos" element={<ProductsPage />} />
                  <Route path="/produtos/:id" element={<ProductDetailPage />} />
                  <Route path="/admin/*" element={<AdminRoute><Admin /></AdminRoute>} />
                  <Route path="/admin/planos" element={<AdminRoute><AdminPlanos /></AdminRoute>} />
                </Route>
                
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
              </RouteErrorBoundary>
              </ModuleAccessGuard>
              </CookieConsentGate>
              </BrowserRouter>
            </UserAccessProvider>
          </ActiveAccountProvider>
        </TooltipProvider>
      </RefreshPolicyProvider>
    </PersistQueryClientProvider>
  );
};

export default App;
