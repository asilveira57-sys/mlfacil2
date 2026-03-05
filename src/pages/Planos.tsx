import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LandingHeader, LandingFooter } from "@/components/landing";
import { useBillingPlans, useBillingCheckout, formatPriceBRL, getPeriodLabel } from "@/hooks/useBillingPlans";
import { useTenantPlanCta } from "@/hooks/useTenantPlanCta";
import { useTenantCheckout } from "@/hooks/useTenantCheckout";
import { useUserAccess } from "@/contexts/UserAccessContext";
import { useUserSalesVolume, isPlanTooSmall } from "@/hooks/useUserSalesVolume";
import { toast } from "sonner";
import {
  Sparkles,
  CheckCircle,
  ArrowLeft,
  ArrowDown,
  AlertTriangle,
  Tag,
  LayoutDashboard,
  DollarSign,
  BarChart3,
  Settings2,
  FileText,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Repeat,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Plan, PlanPrice } from "@/types/billing";

// Tier definitions matching DB slugs
const VOLUME_TIERS = [
  { slug: "ate-50", label: "Até 50 pedidos/mês", desc: "Ideal para quem está começando no marketplace." },
  { slug: "51-300", label: "51 a 300 pedidos/mês", desc: "Para operações em crescimento com volume moderado." },
  { slug: "301-700", label: "301 a 700 pedidos/mês", desc: "Operações consolidadas com bom volume de vendas." },
  { slug: "701-1500", label: "701 a 1.500 pedidos/mês", desc: "Sellers de alto volume com operação robusta." },
  { slug: "1501-3000", label: "1.501 a 3.000 pedidos/mês", desc: "Grandes operações com volume intenso." },
  { slug: "acima-3000", label: "Acima de 3.000 pedidos/mês", desc: "Volume enterprise. Entre em contato.", isEnterprise: true },
];

const INCLUDED_FEATURES = [
  { icon: LayoutDashboard, label: "Dashboard completo" },
  { icon: DollarSign, label: "Precificação inteligente com margem real" },
  { icon: BarChart3, label: "Análise estratégica de anúncios" },
  { icon: Settings2, label: "Gestão operacional" },
  { icon: FileText, label: "Relatórios e indicadores" },
  { icon: RefreshCw, label: "Sincronização automática" },
];

const FAQ_ITEMS = [
  {
    q: "O que muda de um plano para outro?",
    a: "Apenas o limite mensal de pedidos. As funcionalidades são exatamente iguais em todos os planos.",
  },
  {
    q: "Qual a diferença entre Pré-pago e Assinatura?",
    a: "No Pré-pago você paga antecipado pelo período escolhido. Na Assinatura, a cobrança é mensal e recorrente.",
  },
  {
    q: "Posso trocar de plano depois?",
    a: "Sim. Você pode ajustar seu plano a qualquer momento conforme seu volume mudar.",
  },
  {
    q: "O teste grátis exige cartão?",
    a: "Não. Você pode testar por 14 dias sem precisar cadastrar nenhum método de pagamento.",
  },
];

const Planos = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { volumePlans, zplPlan, settings, loading: isLoading, error } = useBillingPlans();
  const { checkout: legacyCheckout, loading: checkoutLoading } = useBillingCheckout();
  const { isAuthenticated, trialActive, trialExpired, flags } = useUserAccess();
  const { getCtaConfig, handleCtaClick, isLoading: ctaLoading } = useTenantPlanCta();
  const { checkout: tenantCheckout, loading: tenantCheckoutLoading } = useTenantCheckout();
  const { totalSales30d } = useUserSalesVolume();

  const [selectedTierSlug, setSelectedTierSlug] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  // Handle payment status from URL
  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "failure") {
      toast.error("Pagamento não concluído", {
        description: "Houve um problema com seu pagamento. Tente novamente.",
      });
    }
    if (paymentStatus === "success") {
      toast.success("Pagamento processado!", {
        description: "Seu plano foi ativado com sucesso.",
      });
    }
  }, [searchParams]);

  // Find the selected plan data
  const selectedPlan = useMemo(
    () => volumePlans.find((p) => p.slug === selectedTierSlug) || null,
    [volumePlans, selectedTierSlug]
  );

  // Split prices into pré-pago and assinatura
  const prePagoPrices = useMemo(() => {
    if (!selectedPlan) return [];
    return selectedPlan.prices
      .filter((p) => p.mode === "avulso" && p.visible)
      .filter((p) => {
        if (p.is_campaign && !settings.enable_annual_campaign) return false;
        return true;
      })
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [selectedPlan, settings]);

  const assinaturaPrices = useMemo(() => {
    if (!selectedPlan) return [];
    return selectedPlan.prices
      .filter((p) => p.mode === "assinatura" && p.visible)
      .filter((p) => {
        // Only show mensal for assinatura (anual only if campaign active)
        if (p.period === "anual" && (!p.is_campaign || !settings.enable_annual_campaign)) return false;
        if (p.period !== "mensal" && p.period !== "anual") return false;
        return true;
      })
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [selectedPlan, settings]);

  const tierInfo = VOLUME_TIERS.find((t) => t.slug === selectedTierSlug);
  const isSelectedEnterprise = tierInfo && (tierInfo as any).isEnterprise === true;
  const ctaConfigTenant = getCtaConfig(isSelectedEnterprise || false);

  const handleSelectTier = (slug: string) => {
    setSelectedTierSlug(slug);
    // Scroll to detail after a tick
    setTimeout(() => {
      document.getElementById("plan-detail")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleBack = () => {
    setSelectedTierSlug(null);
    setTimeout(() => {
      document.getElementById("camadas")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handlePriceClick = (price: PlanPrice, mode: "avulso" | "assinatura") => {
    // Use legacy checkout for price-based flow (ZPL, etc)
    legacyCheckout(price.id);
  };

  const handleTenantPlanClick = (planSlug: string) => {
    handleCtaClick(ctaConfigTenant, planSlug);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <LandingHeader />
        <main className="pt-20">
          <div className="text-center max-w-3xl mx-auto px-4 py-16">
            <Skeleton className="h-10 w-96 mx-auto mb-4" />
            <Skeleton className="h-5 w-[500px] mx-auto mb-8" />
          </div>
          <div className="max-w-5xl mx-auto px-4 py-12">
            <div className="grid md:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="p-6 rounded-xl border border-border bg-card">
                  <Skeleton className="h-6 w-40 mb-2" />
                  <Skeleton className="h-4 w-56 mb-4" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          </div>
        </main>
        <LandingFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <main className="pt-16">
        {/* ─── HERO ─── */}
        <section className="bg-gradient-to-b from-primary/5 to-background py-16 md:py-24 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-4">
              Uma plataforma completa.{" "}
              <span className="text-primary">Você escolhe apenas o volume.</span>
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
              Todos os planos incluem as mesmas funcionalidades. A diferença está apenas na capacidade mensal de pedidos.
            </p>

            <div className="inline-flex items-center gap-2 bg-success/10 text-success px-4 py-2 rounded-full border border-success/20 mb-8">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-semibold">
                Teste grátis por 14 dias, sem cartão.
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button size="lg" className="gap-2 px-8 h-12 text-base" onClick={() => {
                document.getElementById("camadas")?.scrollIntoView({ behavior: "smooth" });
              }}>
                Escolher meu plano
                <ArrowDown className="w-4 h-4" />
              </Button>
              <Button size="lg" variant="outline" className="gap-2 px-6 h-12 text-base bg-background" onClick={() => {
                document.getElementById("incluso")?.scrollIntoView({ behavior: "smooth" });
              }}>
                Ver o que está incluso
              </Button>
            </div>
          </div>
        </section>

        {/* ─── INCLUSO EM TODOS ─── */}
        <section id="incluso" className="py-12 md:py-16 px-4 bg-background">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl md:text-2xl font-bold text-foreground text-center mb-2">
              Incluso em todos os planos
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-8">
              Funcionalidades iguais em todos os planos.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {INCLUDED_FEATURES.map((feat) => (
                <div
                  key={feat.label}
                  className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <feat.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{feat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── ETAPA 1: SELEÇÃO DE CAMADA ─── */}
        <section id="camadas" className="py-12 md:py-16 px-4 bg-muted/40">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-xl md:text-2xl font-bold text-foreground text-center mb-2">
              Escolha sua capacidade mensal
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-10">
              Selecione o volume de pedidos que corresponde à sua operação. Nenhum preço nesta etapa.
            </p>

            {/* Sales volume warning */}
            {isAuthenticated && totalSales30d > 0 && (
              <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5 mb-6 max-w-3xl mx-auto">
                <AlertTriangle className="w-4 h-4 text-primary flex-shrink-0" />
                <p className="text-xs text-foreground">
                  Seu volume nos últimos 30 dias: <strong>{totalSales30d} vendas</strong>. Planos com franquia inferior estão bloqueados.
                </p>
              </div>
            )}

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {VOLUME_TIERS.map((tier) => {
                const plan = volumePlans.find((p) => p.slug === tier.slug);
                const tooSmall = isAuthenticated && plan && isPlanTooSmall(plan.slug, totalSales30d);
                const isSelected = selectedTierSlug === tier.slug;
                const isConsulta = (tier as any).isEnterprise === true;

                return (
                  <div
                    key={tier.slug}
                    className={cn(
                      "relative flex flex-col rounded-2xl border p-6 transition-all duration-200",
                      isSelected
                        ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                        : "border-border bg-card hover:border-primary/30 hover:shadow-md",
                      tooSmall && "opacity-60"
                    )}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Package className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-foreground leading-tight">{tier.label}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{tier.desc}</p>
                      </div>
                    </div>

                    {tooSmall ? (
                      <Button variant="outline" disabled className="w-full mt-auto gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Plano insuficiente
                      </Button>
                    ) : isConsulta ? (
                      <Button
                        variant="outline"
                        className="w-full mt-auto"
                        onClick={() => navigate("/contato")}
                      >
                        Fale conosco
                      </Button>
                    ) : (
                      <Button
                        variant={isSelected ? "default" : "outline"}
                        className="w-full mt-auto gap-2"
                        onClick={() => handleSelectTier(tier.slug)}
                      >
                        Ver opções
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── ETAPA 2: DETALHE DA CAMADA SELECIONADA ─── */}
        {selectedPlan && tierInfo && (
          <section id="plan-detail" className="py-12 md:py-16 px-4 bg-background border-t border-border">
            <div className="max-w-4xl mx-auto">
              {/* Breadcrumb */}
              <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
                <button onClick={handleBack} className="hover:text-foreground transition-colors">
                  Planos
                </button>
                <ChevronRight className="w-3 h-3" />
                <span className="text-foreground font-medium">{tierInfo.label}</span>
              </nav>

              {/* Back button */}
              <Button variant="ghost" size="sm" className="gap-2 mb-6 -ml-2" onClick={handleBack}>
                <ArrowLeft className="w-4 h-4" />
                Voltar para escolher outra camada
              </Button>

              {/* Title */}
              <h2 className="text-xl md:text-2xl font-bold text-foreground mb-2">
                Plano {selectedPlan.name}
              </h2>
              <p className="text-sm text-muted-foreground mb-10">
                As funcionalidades são as mesmas. Você está escolhendo apenas a capacidade mensal.
              </p>

              {/* ─── BLOCO A: PRÉ-PAGO ─── */}
              {prePagoPrices.length > 0 && (
                <div className="mb-10">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <CreditCard className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground">Pagamento Antecipado (Pré-pago)</h3>
                      <p className="text-xs text-muted-foreground">Pague antecipado e use durante o período escolhido.</p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {prePagoPrices.map((price) => {
                      const periodLabel = getPeriodLabel(price.period);
                      return (
                        <Card
                          key={price.id}
                          className={cn(
                            "border-border hover:border-primary/30 transition-all hover:shadow-md"
                          )}
                        >
                          <CardContent className="p-5">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-semibold text-foreground">{periodLabel}</span>
                              {price.badge_text && (
                                <Badge variant="secondary" className="bg-success/10 text-success border-success/20 text-[10px]">
                                  <Tag className="w-3 h-3 mr-1" />
                                  {price.badge_text}
                                </Badge>
                              )}
                            </div>
                            <div className="mb-4">
                              <span className="text-2xl font-bold text-foreground">
                                {formatPriceBRL(price.price_cents)}
                              </span>
                              <span className="text-xs text-muted-foreground ml-1">
                                /{price.period === "mensal" ? "mês" : price.period === "trimestral" ? "trim." : "sem."}
                              </span>
                            </div>
                            <Button
                              className="w-full"
                              variant="default"
                              disabled={ctaLoading || checkoutLoading}
                              onClick={() => handlePriceClick(price, "avulso")}
                            >
                              {ctaConfigTenant.label}
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ─── BLOCO B: ASSINATURA RECORRENTE ─── */}
              {assinaturaPrices.length > 0 && (
                <div className="mb-10">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-9 h-9 rounded-lg bg-accent/50 flex items-center justify-center">
                      <Repeat className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground">Assinatura Recorrente</h3>
                      <p className="text-xs text-muted-foreground">Cobrança automática mensal. Cancele quando quiser.</p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {assinaturaPrices.map((price) => {
                      const periodLabel = price.period === "anual" ? "Anual" : "Mensal";
                      return (
                        <Card
                          key={price.id}
                          className="border-border hover:border-primary/30 transition-all hover:shadow-md"
                        >
                          <CardContent className="p-5">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-semibold text-foreground">Assinatura {periodLabel}</span>
                              {price.badge_text && (
                                <Badge variant="secondary" className="bg-success/10 text-success border-success/20 text-[10px]">
                                  <Tag className="w-3 h-3 mr-1" />
                                  {price.badge_text}
                                </Badge>
                              )}
                            </div>
                            <div className="mb-4">
                              <span className="text-2xl font-bold text-foreground">
                                {formatPriceBRL(price.price_cents)}
                              </span>
                              <span className="text-xs text-muted-foreground ml-1">/mês</span>
                            </div>
                            <Button
                              className="w-full"
                              variant="outline"
                              disabled={ctaLoading || checkoutLoading}
                              onClick={() => handlePriceClick(price, "assinatura")}
                            >
                              {ctaConfigTenant.label}
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Microcopy */}
              <p className="text-xs text-muted-foreground text-center border-t border-border pt-6">
                O MKTP Fácil é o mesmo em qualquer plano. Você paga apenas pela capacidade mensal de pedidos.
              </p>
            </div>
          </section>
        )}

        {/* ─── TABELA COMPARATIVA ─── */}
        {!selectedTierSlug && (
          <section className="py-12 md:py-16 px-4 bg-muted/30">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-xl md:text-2xl font-bold text-foreground text-center mb-8">
                Comparativo de funcionalidades
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-foreground">Funcionalidade</th>
                      {VOLUME_TIERS.slice(0, 5).map((tier) => (
                        <th key={tier.slug} className="text-center py-3 px-4 text-xs font-semibold text-foreground">
                          {tier.label.replace(" pedidos/mês", "")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {INCLUDED_FEATURES.map((feat) => (
                      <tr key={feat.label} className="border-b border-border/50">
                        <td className="py-3 px-4 text-sm text-foreground">{feat.label}</td>
                        {VOLUME_TIERS.slice(0, 5).map((tier) => (
                          <td key={tier.slug} className="text-center py-3 px-4">
                            <CheckCircle className="w-5 h-5 text-success mx-auto" />
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-primary/5">
                      <td className="py-3 px-4 text-sm font-semibold text-foreground">Capacidade mensal</td>
                      {VOLUME_TIERS.slice(0, 5).map((tier) => {
                        const plan = volumePlans.find((p) => p.slug === tier.slug);
                        const label = tier.label.replace(" pedidos/mês", "").replace("Até ", "").replace("Acima de ", "");
                        return (
                          <td key={tier.slug} className="text-center py-3 px-4 text-xs font-bold text-primary">
                            {label}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-center text-xs text-muted-foreground mt-4">
                A única diferença entre os planos é a capacidade mensal de pedidos.
              </p>
            </div>
          </section>
        )}

        {/* ─── MÓDULO ZPL ─── */}
        {zplPlan && zplPlan.prices.length > 0 && (
          <section className="py-12 md:py-16 px-4 bg-background border-t border-border">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-xl md:text-2xl font-bold text-foreground text-center mb-2">
                Módulo ZPL
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-8">
                Plano técnico independente da camada de pedidos. Não faz parte dos limites de vendas dos planos principais.
              </p>
              <Card className="border-border">
                <CardContent className="p-6">
                  <div className="mb-6">
                    <h3 className="text-lg font-bold text-foreground mb-1">{zplPlan.name}</h3>
                    <p className="text-sm text-muted-foreground">{zplPlan.description}</p>
                  </div>

                  {/* ZPL Pré-pago */}
                  {(() => {
                    const zplAvulso = zplPlan.prices.filter(
                      (p) => p.mode === "avulso" && p.visible
                    );
                    if (zplAvulso.length === 0) return null;
                    return (
                      <div className="mb-5">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                          Pré-pago
                        </p>
                        <div className="grid sm:grid-cols-3 gap-3">
                          {zplAvulso.map((price) => (
                            <Button
                              key={price.id}
                              variant="outline"
                              className="justify-between h-auto py-3"
                              onClick={() => legacyCheckout(price.id)}
                              disabled={checkoutLoading}
                            >
                              <span className="text-sm">{getPeriodLabel(price.period)}</span>
                              <div className="flex flex-col items-end">
                                <span className="font-bold">{formatPriceBRL(price.price_cents)}</span>
                                {price.badge_text && (
                                  <span className="text-[10px] text-success">{price.badge_text}</span>
                                )}
                              </div>
                            </Button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ZPL Assinatura */}
                  {(() => {
                    const zplSub = zplPlan.prices.filter(
                      (p) => p.mode === "assinatura" && p.visible && p.period === "mensal"
                    );
                    if (zplSub.length === 0) return null;
                    return (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                          Assinatura Recorrente
                        </p>
                        <div className="grid sm:grid-cols-3 gap-3">
                          {zplSub.map((price) => (
                            <Button
                              key={price.id}
                              variant="outline"
                              className="justify-between h-auto py-3"
                              onClick={() => legacyCheckout(price.id)}
                              disabled={checkoutLoading}
                            >
                              <span className="text-sm">Mensal</span>
                              <span className="font-bold">{formatPriceBRL(price.price_cents)}/mês</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* ─── FAQ ─── */}
        <section className="py-12 md:py-16 px-4 bg-muted/30">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl md:text-2xl font-bold text-foreground text-center mb-8">
              Perguntas frequentes
            </h2>
            <div className="space-y-3">
              {FAQ_ITEMS.map((item, i) => (
                <button
                  key={i}
                  onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                  className="w-full text-left bg-card border border-border rounded-xl p-4 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-medium text-foreground text-sm">{item.q}</h4>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform",
                        expandedFaq === i && "rotate-180"
                      )}
                    />
                  </div>
                  {expandedFaq === i && (
                    <p className="text-muted-foreground text-sm mt-2">{item.a}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA FINAL ─── */}
        <section className="py-12 md:py-16 px-4 bg-gradient-to-t from-primary/5 to-background">
          <div className="text-center max-w-xl mx-auto">
            {isAuthenticated && trialActive && (
              <Badge variant="secondary" className="mb-4 bg-success/10 text-success border-success/20">
                <CheckCircle className="w-3 h-3 mr-1" />
                Teste ativo • {flags?.trial_days_remaining || 0} dias restantes
              </Badge>
            )}
            {isAuthenticated && trialExpired && (
              <Badge variant="secondary" className="mb-4 bg-destructive/10 text-destructive border-destructive/20">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Teste expirado • Escolha um plano
              </Badge>
            )}

            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-2">
              Pronto para começar?
            </h2>
            <p className="text-muted-foreground mb-6 text-sm">
              Teste grátis por 14 dias. Cancele a qualquer momento.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button size="lg" className="h-12 text-base px-8" onClick={() => {
                document.getElementById("camadas")?.scrollIntoView({ behavior: "smooth" });
              }}>
                Escolher meu plano
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/")}
                className="h-12 text-base px-6 bg-background"
              >
                Voltar ao início
              </Button>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
};

export default Planos;
