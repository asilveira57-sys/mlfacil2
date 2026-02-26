import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { LandingHeader, LandingFooter } from "@/components/landing";
import { useTierPlans, formatPriceBRL, getPlanPrice, type PricingMode, type BillingCycle, type TierPlan } from "@/hooks/useTierPlans";
import { usePlanCta } from "@/hooks/usePlanCta";
import { useBillingCheckout } from "@/hooks/useBillingPlans";
import { useUserAccess } from "@/contexts/UserAccessContext";
import { useUserSalesVolume, isPlanTooSmall } from "@/hooks/useUserSalesVolume";
import { toast } from "sonner";
import {
  Sparkles,
  Check,
  CheckCircle,
  ArrowDown,
  AlertTriangle,
  Tag,
  LayoutDashboard,
  DollarSign,
  BarChart3,
  Settings2,
  FileText,
  RefreshCw,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// The 3 main volume tiers for the comparator
const VOLUME_TIERS = [
  { slug: "ate-50-vendas", min: 0, max: 50, label: "Até 50" },
  { slug: "51-300-vendas", min: 51, max: 300, label: "51 a 300" },
  { slug: "301-700-vendas", min: 301, max: 700, label: "301 a 700" },
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
    a: "Apenas o limite mensal de vendas/pedidos. As funcionalidades são exatamente iguais em todos os planos.",
  },
  {
    q: "Posso trocar de plano depois?",
    a: "Sim. Você pode ajustar seu plano a qualquer momento conforme seu volume de vendas mudar.",
  },
  {
    q: "O teste grátis exige cartão?",
    a: "Não. Você pode testar por 14 dias sem precisar cadastrar nenhum método de pagamento.",
  },
];

function sliderValueToTierIndex(value: number): number {
  if (value <= 50) return 0;
  if (value <= 300) return 1;
  return 2;
}

const Planos = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation("landing");
  const { data, isLoading, error } = useTierPlans();
  const { checkout, loading: checkoutLoading } = useBillingCheckout();
  const { isAuthenticated, trialActive, trialExpired, flags } = useUserAccess();
  const { getCtaConfig, handleCtaClick, isLoading: ctaLoading } = usePlanCta();
  const { totalSales30d } = useUserSalesVolume();

  const [billingCycle, setBillingCycle] = useState<BillingCycle>("mensal");
  const [sliderValue, setSliderValue] = useState([150]);
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

  const volumePlans = data?.volumePlans || [];
  const zplPlan = data?.zplPlan;
  const trialPolicy = data?.trialPolicy;

  // Get only the first 3 volume plans for the comparator
  const mainPlans = useMemo(
    () => volumePlans.filter((p) => VOLUME_TIERS.some((t) => t.slug === p.slug)),
    [volumePlans]
  );

  const recommendedIndex = sliderValueToTierIndex(sliderValue[0]);
  const recommendedTier = VOLUME_TIERS[recommendedIndex];
  const recommendedPlan = mainPlans.find((p) => p.slug === recommendedTier?.slug);

  const ctaConfig = getCtaConfig("avulso");

  // Get discount percentage for non-monthly periods
  const getDiscount = (plan: TierPlan, period: BillingCycle): number | null => {
    if (period === "mensal") return null;
    const monthlyPrice = getPlanPrice(plan, "avulso", "mensal");
    const periodPrice = getPlanPrice(plan, "avulso", period);
    if (!monthlyPrice || !periodPrice) return null;

    const periodMonths = period === "trimestral" ? 3 : period === "semestral" ? 6 : 1;
    const monthlyEquiv = periodPrice.price_cents / periodMonths;
    const discount = Math.round(((monthlyPrice.price_cents - monthlyEquiv) / monthlyPrice.price_cents) * 100);
    return discount > 0 ? discount : null;
  };

  const scrollToComparator = () => {
    document.getElementById("comparador")?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToFeatures = () => {
    document.getElementById("incluso")?.scrollIntoView({ behavior: "smooth" });
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
            <Skeleton className="h-12 w-48 mx-auto" />
          </div>
          <div className="max-w-5xl mx-auto px-4 py-12">
            <div className="grid md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-6 rounded-xl border border-border bg-card">
                  <Skeleton className="h-6 w-32 mb-2" />
                  <Skeleton className="h-10 w-24 mb-4" />
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
              Todos os planos incluem as mesmas funcionalidades do MKTP Fácil. A diferença está na capacidade mensal de vendas.
            </p>

            {trialPolicy && (
              <div className="inline-flex items-center gap-2 bg-success/10 text-success px-4 py-2 rounded-full border border-success/20 mb-8">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-semibold">
                  Teste grátis por {trialPolicy.trial_days} dias, sem cartão.
                </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button size="lg" className="gap-2 px-8 h-12 text-base" onClick={scrollToComparator}>
                Escolher meu plano
                <ArrowDown className="w-4 h-4" />
              </Button>
              <Button size="lg" variant="outline" className="gap-2 px-6 h-12 text-base bg-background" onClick={scrollToFeatures}>
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

        {/* ─── COMPARADOR INTERATIVO ─── */}
        <section id="comparador" className="py-12 md:py-16 px-4 bg-muted/40">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl md:text-2xl font-bold text-foreground text-center mb-2">
              Selecione seu volume mensal
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-10">
              Arraste para simular a quantidade de vendas/pedidos por mês. O plano recomendado muda automaticamente.
            </p>

            {/* Sales volume warning */}
            {isAuthenticated && totalSales30d > 0 && (
              <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5 mb-6">
                <AlertTriangle className="w-4 h-4 text-primary flex-shrink-0" />
                <p className="text-xs text-foreground">
                  Seu volume nos últimos 30 dias: <strong>{totalSales30d} vendas</strong>. Planos com franquia inferior estão bloqueados.
                </p>
              </div>
            )}

            {/* Slider */}
            <div className="bg-card border border-border rounded-2xl p-6 md:p-8 mb-8">
              <div className="text-center mb-6">
                <span className="text-3xl md:text-4xl font-bold text-primary">{sliderValue[0]}</span>
                <span className="text-base text-muted-foreground ml-2">vendas/mês</span>
              </div>

              <div className="px-2 mb-4">
                <Slider
                  value={sliderValue}
                  onValueChange={setSliderValue}
                  min={0}
                  max={700}
                  step={1}
                  className="w-full"
                />
              </div>

              {/* Markers */}
              <div className="flex justify-between px-2 text-xs text-muted-foreground">
                {VOLUME_TIERS.map((tier) => (
                  <button
                    key={tier.slug}
                    onClick={() => setSliderValue([Math.floor((tier.min + tier.max) / 2)])}
                    className={cn(
                      "transition-colors hover:text-foreground",
                      recommendedTier?.slug === tier.slug && "text-primary font-semibold"
                    )}
                  >
                    {tier.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Period Toggle */}
            <div className="flex flex-col items-center gap-3 mb-8">
              <Tabs value={billingCycle} onValueChange={(v) => setBillingCycle(v as BillingCycle)}>
                <TabsList className="h-10 bg-background border border-border">
                  <TabsTrigger value="mensal" className="px-5 text-sm">Mensal</TabsTrigger>
                  <TabsTrigger value="trimestral" className="px-5 text-sm">Trimestral</TabsTrigger>
                  <TabsTrigger value="semestral" className="px-5 text-sm">Semestral</TabsTrigger>
                </TabsList>
              </Tabs>
              {recommendedPlan && billingCycle !== "mensal" && (() => {
                const disc = getDiscount(recommendedPlan, billingCycle);
                return disc ? (
                  <Badge variant="secondary" className="bg-success/10 text-success border-success/20">
                    <Tag className="w-3 h-3 mr-1" />
                    Economize {disc}% no {billingCycle}
                  </Badge>
                ) : null;
              })()}
            </div>

            {/* Recommended Plan Card */}
            {recommendedPlan && (() => {
              const price = getPlanPrice(recommendedPlan, "avulso", billingCycle);
              const tooSmall = isAuthenticated && isPlanTooSmall(recommendedPlan.slug, totalSales30d);
              return (
                <div className="bg-primary/5 border-2 border-primary rounded-2xl p-6 md:p-8 text-center">
                  <Badge className="mb-3 bg-primary/10 text-primary border-primary/20">
                    Recomendado para seu volume
                  </Badge>
                  <h3 className="text-xl md:text-2xl font-bold text-foreground mb-1">
                    {recommendedPlan.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Mesmas funcionalidades. Maior capacidade mensal.
                  </p>
                  {price && (
                    <div className="mb-5">
                      <span className="text-4xl md:text-5xl font-bold text-foreground">
                        {formatPriceBRL(price.price_cents)}
                      </span>
                      <span className="text-muted-foreground ml-1">
                        /{billingCycle === "mensal" ? "mês" : billingCycle === "trimestral" ? "trim." : "sem."}
                      </span>
                    </div>
                  )}
                  {tooSmall ? (
                    <div className="inline-flex items-center gap-2 text-destructive text-sm mb-3">
                      <AlertTriangle className="w-4 h-4" />
                      Seu volume excede este plano
                    </div>
                  ) : (
                    <Button
                      size="lg"
                      className="px-10 h-12 text-base"
                      disabled={ctaLoading}
                      onClick={() => {
                        if (price) {
                          handleCtaClick(ctaConfig, price.id, recommendedPlan.slug, "avulso", billingCycle);
                        }
                      }}
                    >
                      {ctaConfig.label === "Iniciar teste grátis" ? "Fazer Teste" : ctaConfig.label}
                    </Button>
                  )}
                </div>
              );
            })()}

            {/* Microcopy */}
            <p className="text-center text-xs text-muted-foreground mt-6">
              O MKTP Fácil é o mesmo em qualquer plano. Você paga apenas pela capacidade mensal de vendas.
            </p>
          </div>
        </section>

        {/* ─── CARDS DOS PLANOS ─── */}
        <section className="py-12 md:py-16 px-4 bg-background">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-xl md:text-2xl font-bold text-foreground text-center mb-8">
              Todos os planos
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {mainPlans.map((plan) => {
                const price = getPlanPrice(plan, "avulso", billingCycle);
                const isRecommended = plan.slug === recommendedTier?.slug;
                const tooSmall = isAuthenticated && isPlanTooSmall(plan.slug, totalSales30d);

                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "relative flex flex-col rounded-2xl border transition-all duration-300 p-6",
                      isRecommended
                        ? "border-primary shadow-lg ring-2 ring-primary/20 bg-card"
                        : "border-border bg-card hover:border-primary/30 hover:shadow-md"
                    )}
                  >
                    {isRecommended && (
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1">
                        Recomendado
                      </Badge>
                    )}

                    <h3 className="text-lg font-bold text-foreground mb-1">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>

                    {price ? (
                      <div className="mb-4">
                        <span className="text-3xl font-bold text-foreground">
                          {formatPriceBRL(price.price_cents)}
                        </span>
                        <span className="text-sm text-muted-foreground ml-1">
                          /{billingCycle === "mensal" ? "mês" : billingCycle === "trimestral" ? "trim." : "sem."}
                        </span>
                      </div>
                    ) : (
                      <div className="mb-4">
                        <span className="text-lg font-semibold text-muted-foreground">Consulte-nos</span>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground mb-5 flex-1">
                      Inclui todas as funcionalidades do MKTP Fácil.
                    </p>

                    {tooSmall ? (
                      <Button variant="outline" disabled className="w-full gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Plano insuficiente
                      </Button>
                    ) : (
                      <Button
                        variant={isRecommended ? "default" : "outline"}
                        className="w-full"
                        disabled={ctaLoading}
                        onClick={() => {
                          if (price) {
                            handleCtaClick(ctaConfig, price.id, plan.slug, "avulso", billingCycle);
                          }
                        }}
                      >
                        {ctaConfig.label === "Iniciar teste grátis" ? "Fazer Teste" : ctaConfig.label}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── TABELA COMPARATIVA ─── */}
        <section className="py-12 md:py-16 px-4 bg-muted/30">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl md:text-2xl font-bold text-foreground text-center mb-8">
              Comparativo de planos
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-foreground">Funcionalidade</th>
                    {mainPlans.map((plan) => (
                      <th
                        key={plan.id}
                        className={cn(
                          "text-center py-3 px-4 text-sm font-semibold",
                          plan.slug === recommendedTier?.slug ? "text-primary" : "text-foreground"
                        )}
                      >
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {INCLUDED_FEATURES.map((feat) => (
                    <tr key={feat.label} className="border-b border-border/50">
                      <td className="py-3 px-4 text-sm text-foreground">{feat.label}</td>
                      {mainPlans.map((plan) => (
                        <td key={plan.id} className="text-center py-3 px-4">
                          <CheckCircle className="w-5 h-5 text-success mx-auto" />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* Capacity row */}
                  <tr className="bg-primary/5">
                    <td className="py-3 px-4 text-sm font-semibold text-foreground">Capacidade mensal</td>
                    {mainPlans.map((plan, i) => (
                      <td key={plan.id} className="text-center py-3 px-4 text-sm font-bold text-primary">
                        {VOLUME_TIERS[i]?.max || "—"}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-4">
              A única diferença é a capacidade mensal.
            </p>
          </div>
        </section>

        {/* ─── MÓDULO ZPL ─── */}
        {zplPlan && zplPlan.prices.length > 0 && (
          <section className="py-12 md:py-16 px-4 bg-background border-t border-border">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-xl md:text-2xl font-bold text-foreground text-center mb-2">
                Módulo ZPL
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-8">
                Módulo técnico específico para geração e gestão de etiquetas em ZPL.
              </p>
              <Card className="border-border">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-foreground mb-1">{zplPlan.name}</h3>
                      <p className="text-sm text-muted-foreground mb-2">{zplPlan.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Não faz parte dos limites de vendas dos planos principais.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 md:min-w-[200px]">
                      {zplPlan.prices.slice(0, 3).map((price) => (
                        <Button
                          key={price.id}
                          variant="outline"
                          className="justify-between"
                          onClick={() => checkout(price.id)}
                          disabled={checkoutLoading}
                        >
                          <span className="text-sm">{price.period}</span>
                          <span className="font-bold">{formatPriceBRL(price.price_cents)}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
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
              {trialPolicy
                ? `Teste grátis por ${trialPolicy.trial_days} dias. Cancele a qualquer momento.`
                : "Escolha o plano ideal para o seu negócio."}
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button size="lg" className="h-12 text-base px-8" onClick={scrollToComparator}>
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
