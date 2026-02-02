import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LandingHeader, LandingFooter } from "@/components/landing";
import { TierPlanCard } from "@/components/pricing/TierPlanCard";
import { useTierPlans, formatPriceBRL, type PricingMode, type BillingCycle } from "@/hooks/useTierPlans";
import { usePlanCta } from "@/hooks/usePlanCta";
import { useBillingCheckout } from "@/hooks/useBillingPlans";
import { useUserAccess } from "@/contexts/UserAccessContext";
import { EditableText } from "@/components/admin/EditableText";
import { toast } from "sonner";
import { 
  Info, 
  Sparkles,
  MessageSquare,
  CreditCard,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";

// Map URL params to internal types
const mapUrlPeriod = (urlCycle: string | null): BillingCycle => {
  const map: Record<string, BillingCycle> = {
    'monthly': 'mensal',
    'quarterly': 'trimestral', 
    'semiannual': 'semestral',
    'annual': 'anual',
    'mensal': 'mensal',
    'trimestral': 'trimestral',
    'semestral': 'semestral',
    'anual': 'anual',
  };
  return map[urlCycle || ''] || 'mensal';
};

const mapUrlMode = (urlMode: string | null): PricingMode => {
  if (urlMode === 'prepaid' || urlMode === 'avulso') return 'avulso';
  if (urlMode === 'recurring' || urlMode === 'assinatura') return 'assinatura';
  return 'avulso';
};

const Planos = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation('landing');
  const { data, isLoading, error } = useTierPlans();
  const { checkout, loading: checkoutLoading } = useBillingCheckout();
  const { isAuthenticated, trialActive, trialExpired, flags } = useUserAccess();
  const { getCtaConfig, handleCtaClick } = usePlanCta();

  // Initialize from URL params
  const initialMode = mapUrlMode(searchParams.get('mode'));
  const initialCycle = mapUrlPeriod(searchParams.get('cycle'));
  const selectedPlanSlug = searchParams.get('plan');

  const [paymentMode, setPaymentMode] = useState<PricingMode>(initialMode);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(initialCycle);

  // Handle payment status from URL
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    if (paymentStatus === 'failure') {
      toast.error('Pagamento não concluído', {
        description: 'Houve um problema com seu pagamento. Tente novamente.',
      });
    }
    if (paymentStatus === 'success') {
      toast.success('Pagamento processado!', {
        description: 'Seu plano foi ativado com sucesso.',
      });
    }
  }, [searchParams]);

  // Get mode description text
  const modeDescription = paymentMode === 'avulso'
    ? t('planos.prepaid_desc')
    : t('planos.recurring_desc');

  // Determine hero CTA based on user state
  const heroCtaConfig = getCtaConfig(paymentMode);

  const handleCheckout = async (priceId: string) => {
    await checkout(priceId);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <LandingHeader />
        <main className="pt-16">
          <div className="bg-background py-8">
            <div className="text-center max-w-3xl mx-auto px-4">
              <Skeleton className="h-8 w-64 mx-auto mb-2" />
              <Skeleton className="h-4 w-96 mx-auto" />
            </div>
          </div>
          <div className="bg-muted/50 py-8 px-4">
            <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-6 rounded-xl border bg-card">
                  <Skeleton className="h-6 w-32 mb-2" />
                  <Skeleton className="h-4 w-48 mb-4" />
                  <Skeleton className="h-10 w-24 mb-4" />
                  <div className="space-y-2 mb-4">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
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

  const volumePlans = data?.volumePlans || [];
  const zplPlan = data?.zplPlan;
  const trialPolicy = data?.trialPolicy;

  // Split volume plans into rows for layout
  const firstRowPlans = volumePlans.slice(0, 3);
  const secondRowPlans = volumePlans.slice(3);

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <main className="pt-16">
        {/* Hero - White background, compact */}
        <div className="bg-background">
          <div className="text-center max-w-3xl mx-auto px-4 pt-4 pb-6">
            <h1 className="text-xl md:text-2xl font-bold text-foreground mb-2">
              {t('planos.title')}
            </h1>
            <p className="text-sm text-muted-foreground mb-4">
              {t('planos.subtitle')}
              {trialPolicy && ` ${t('planos.trial_info', { days: trialPolicy.trial_days })}`}
            </p>
            
            {trialPolicy && (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <div className="inline-flex items-center gap-1.5 bg-success/15 text-success px-3 py-1.5 rounded-full border border-success/20">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">
                    {t('pricing.trial_badge', { days: trialPolicy.trial_days })}
                    {!trialPolicy.requires_card && t('pricing.trial_no_card')}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Atualmente, as análises consideram dados do Mercado Livre.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Volume Plans Section */}
        <div className="bg-muted/50 pt-6 pb-6">
          <div className="text-center mb-5">
            <h2 className="text-lg md:text-xl font-bold text-foreground mb-2">
              {t('planos.volume_title')}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t('planos.volume_subtitle')}
            </p>
          </div>

          {/* Payment Mode Toggle */}
          <div className="flex justify-center mb-4">
            <div className="inline-flex rounded-lg border border-primary/20 p-0.5 bg-background shadow-sm">
              <button
                onClick={() => setPaymentMode('avulso')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium transition-all ${
                  paymentMode === 'avulso'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                {t('planos.mode_prepaid')}
              </button>
              <button
                onClick={() => setPaymentMode('assinatura')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium transition-all ${
                  paymentMode === 'assinatura'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('planos.mode_recurring')}
              </button>
            </div>
          </div>

          {/* Mode Description */}
          <div className="flex flex-col items-center gap-2 mb-5">
            <span className="text-[10px] text-muted-foreground">
              {modeDescription}
            </span>
          </div>

          {/* Period Selector (only for avulso mode) */}
          {paymentMode === 'avulso' && (
            <div className="flex flex-col items-center gap-2 mb-6">
              <Tabs value={billingCycle} onValueChange={(v) => setBillingCycle(v as BillingCycle)}>
                <TabsList className="grid grid-cols-3 w-auto h-9 bg-background">
                  <TabsTrigger value="mensal" className="px-4 text-xs">{t('planos.period_monthly')}</TabsTrigger>
                  <TabsTrigger value="trimestral" className="px-4 text-xs">{t('planos.period_quarterly')}</TabsTrigger>
                  <TabsTrigger value="semestral" className="px-4 text-xs">{t('planos.period_semiannual')}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}

          {/* Volume Plans Grid */}
          {error ? (
            <div className="text-center py-8 text-destructive text-sm">
              Erro ao carregar planos. Tente novamente.
            </div>
          ) : (
            <div className="max-w-5xl mx-auto px-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                {firstRowPlans.map((plan, index) => {
                  const isHighlighted = plan.slug === '51-300-vendas' || 
                    (firstRowPlans.length >= 2 && index === 1);
                  
                  return (
                    <TierPlanCard
                      key={plan.id}
                      plan={plan}
                      mode={paymentMode}
                      period={paymentMode === 'assinatura' ? 'mensal' : billingCycle}
                      highlighted={isHighlighted}
                    />
                  );
                })}
              </div>
              
              {secondRowPlans.length > 0 && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {secondRowPlans.map((plan) => (
                    <TierPlanCard
                      key={plan.id}
                      plan={plan}
                      mode={paymentMode}
                      period={paymentMode === 'assinatura' ? 'mensal' : billingCycle}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Enterprise Card */}
          <div className="mt-4 max-w-2xl mx-auto px-4">
            <Card className="bg-background border-border">
              <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-3 py-3 px-4">
                <div className="text-center sm:text-left">
                  <span className="font-semibold text-foreground text-sm">
                    {t('planos.enterprise_title')}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {t('planos.enterprise_subtitle')}
                  </span>
                </div>
                <Button variant="outline" className="gap-1.5 h-8 text-xs" size="sm">
                  <MessageSquare className="w-3.5 h-3.5" />
                  {t('planos.enterprise_cta')}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ZPL FULL Section - simplified for tier plans */}
        {zplPlan && zplPlan.prices.length > 0 && (
          <div className="py-8 px-4 bg-gradient-to-b from-primary/8 to-primary/3 border-t border-primary/10">
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-4">
                <h3 className="text-xl font-bold text-foreground">{zplPlan.name}</h3>
                <p className="text-sm text-muted-foreground">{zplPlan.description}</p>
              </div>
              <div className="grid md:grid-cols-2 gap-4 items-center">
                <ul className="space-y-2">
                  {zplPlan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col gap-2">
                  {zplPlan.prices.slice(0, 3).map((price) => (
                    <Button
                      key={price.id}
                      variant="outline"
                      className="justify-between"
                      onClick={() => handleCheckout(price.id)}
                      disabled={checkoutLoading}
                    >
                      <span>{price.period}</span>
                      <span className="font-bold">{formatPriceBRL(price.price_cents)}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FAQ Section */}
        <div className="py-8 px-4 bg-background">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-base font-bold text-foreground text-center mb-4">
              <EditableText contentKey="planos.faq.title" as="span" />
            </h2>
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-muted/30 border border-border/50 rounded-lg p-3">
                  <h4 className="font-medium text-foreground text-sm">
                    <EditableText contentKey={`planos.faq.item${i}.question`} as="span" />
                  </h4>
                  <p className="text-muted-foreground text-xs mt-1">
                    <EditableText contentKey={`planos.faq.item${i}.answer`} as="span" />
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="py-8 px-4 bg-muted/40">
          <div className="text-center max-w-xl mx-auto">
            {/* Trial status badge */}
            {isAuthenticated && trialActive && (
              <Badge variant="secondary" className="mb-3 bg-success/10 text-success border-success/20">
                <CheckCircle className="w-3 h-3 mr-1" />
                Teste ativo • {flags?.trial_days_remaining || 0} dias restantes
              </Badge>
            )}
            {isAuthenticated && trialExpired && (
              <Badge variant="secondary" className="mb-3 bg-destructive/10 text-destructive border-destructive/20">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Teste expirado • Escolha um plano para continuar
              </Badge>
            )}

            <h2 className="text-base font-bold text-foreground mb-1">
              {t('planos.ready_title')}
            </h2>
            <p className="text-muted-foreground mb-4 text-sm">
              {trialPolicy 
                ? t('planos.ready_subtitle', { days: trialPolicy.trial_days })
                : t('planos.subtitle')
              }
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button 
                size="sm" 
                className="h-10 text-sm px-6 shadow-sm" 
                onClick={() => handleCtaClick(heroCtaConfig)}
              >
                {heroCtaConfig.label}
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => navigate("/")} 
                className="gap-1.5 h-10 text-sm px-5 bg-background"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {t('planos.back_home')}
              </Button>
            </div>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
};

export default Planos;
