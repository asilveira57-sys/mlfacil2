import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LandingHeader, LandingFooter, Section } from "@/components/landing";
import { useSiteContent } from "@/hooks/useSiteContent";
import { usePlans, formatPrice, formatPricePerMonth } from "@/hooks/usePlans";
import { EditableText } from "@/components/admin/EditableText";
import { 
  ArrowLeft, 
  Check, 
  Info, 
  Printer, 
  ShoppingCart, 
  Sparkles,
  MessageSquare,
  Star,
  CreditCard,
  RefreshCw
} from "lucide-react";

type BillingCycle = 'monthly' | 'quarterly' | 'semiannual' | 'annual';
type PaymentMode = 'prepaid' | 'subscription';

const Planos = () => {
  const navigate = useNavigate();
  const { getText } = useSiteContent();
  const { volumePlans, zplPlan, customPlan, loading } = usePlans();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('prepaid');

  // Split volume plans into two rows: first 3, then remaining
  const firstRowPlans = volumePlans.slice(0, 3);
  const secondRowPlans = volumePlans.slice(3);

  // Calculate annual subscription price: pay 10 months, use 12 (2 free months)
  const getAnnualSubscriptionPrice = (monthlyPrice: number) => {
    return monthlyPrice * 10; // Pay for 10 months only
  };

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <main className="pt-16">
        {/* Hero - White background, compact with micro-breathing */}
        <div className="bg-background">
          <div className="text-center max-w-3xl mx-auto px-4 pt-4 pb-6">
            <h1 className="text-xl md:text-2xl font-bold text-foreground mb-2">
              <EditableText contentKey="planos.hero.title" as="span" />
            </h1>
            <p className="text-sm text-muted-foreground mb-4">
              <EditableText contentKey="planos.hero.subtitle" as="span" />
            </p>
            
            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="inline-flex items-center gap-1.5 bg-success/15 text-success px-3 py-1.5 rounded-full border border-success/20">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold">
                  <EditableText contentKey="planos.trial.description" as="span" />
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
                <Info className="w-3 h-3" />
                <EditableText contentKey="planos.scope.notice" as="span" />
              </span>
            </div>
          </div>
        </div>

        {/* Volume Plans Section - Light gray/blue background */}
        <div className="bg-muted/50 pt-6 pb-6">
          <div className="text-center mb-5">
            <h2 className="text-lg md:text-xl font-bold text-foreground mb-2">
              <EditableText contentKey="planos.volume.title" as="span" />
            </h2>
            <p className="text-muted-foreground text-sm">
              <EditableText contentKey="planos.volume.subtitle" as="span" />
            </p>
          </div>

          {/* Payment Mode Toggle */}
          <div className="flex flex-col items-center gap-2 mb-5">
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-background shadow-sm">
              <button
                onClick={() => setPaymentMode('prepaid')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium transition-all ${
                  paymentMode === 'prepaid'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                Pagamento Antecipado
              </button>
              <button
                onClick={() => setPaymentMode('subscription')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium transition-all ${
                  paymentMode === 'subscription'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Assinatura Recorrente
              </button>
            </div>
            <span className="text-[10px] text-muted-foreground">
              Troque de plano ou cancele a qualquer momento
            </span>
          </div>

          {/* Payment mode options */}
          {paymentMode === 'prepaid' ? (
            <div className="flex flex-col items-center gap-2 mb-6">
              <Tabs value={billingCycle} onValueChange={(v) => setBillingCycle(v as BillingCycle)}>
                <TabsList className="grid grid-cols-4 w-auto h-9 bg-background">
                  <TabsTrigger value="monthly" className="px-3 text-xs">Mensal</TabsTrigger>
                  <TabsTrigger value="quarterly" className="px-3 text-xs">
                    Trimestral 
                    <Badge className={`ml-1 text-[9px] hidden sm:inline-flex px-1.5 py-0 ${billingCycle === 'quarterly' ? 'bg-success text-white' : 'bg-success/20 text-success border-0'}`}>
                      -5%
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="semiannual" className="px-3 text-xs">
                    Semestral 
                    <Badge className={`ml-1 text-[9px] hidden sm:inline-flex px-1.5 py-0 ${billingCycle === 'semiannual' ? 'bg-success text-white' : 'bg-success/20 text-success border-0'}`}>
                      -15%
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="annual" className="px-3 text-xs">
                    Anual 
                    <Badge className={`ml-1 text-[9px] hidden sm:inline-flex px-1.5 py-0 ${billingCycle === 'annual' ? 'bg-success text-white' : 'bg-success/20 text-success border-0'}`}>
                      -20%
                    </Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <span className="text-[11px] text-muted-foreground/60">
                Pagamento único. Sem renovação automática.
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="inline-flex items-center gap-1.5 bg-success text-white px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-sm">
                <Sparkles className="w-3 h-3" />
                2 meses grátis no plano anual
              </div>
              <span className="text-[11px] text-muted-foreground">
                Pague 10 meses, use 12
              </span>
            </div>
          )}

          {/* Volume Plans Grid */}
          {loading ? (
            <div className="text-center py-4 text-muted-foreground text-sm">Carregando...</div>
          ) : (
            <div className="max-w-5xl mx-auto px-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
                {firstRowPlans.map((plan) => (
                  <VolumePlanCard 
                    key={plan.id} 
                    plan={plan} 
                    billingCycle={paymentMode === 'subscription' ? 'annual' : billingCycle}
                    paymentMode={paymentMode}
                    getAnnualSubscriptionPrice={getAnnualSubscriptionPrice}
                    onSelect={() => navigate("/auth")}
                  />
                ))}
              </div>
              
              {secondRowPlans.length > 0 && (
                <div className="flex justify-center gap-3 flex-wrap">
                  {secondRowPlans.map((plan) => (
                    <div key={plan.id} className="w-full sm:w-[calc(50%-0.375rem)] lg:w-[calc(33.333%-0.375rem)]">
                      <VolumePlanCard 
                        plan={plan} 
                        billingCycle={paymentMode === 'subscription' ? 'annual' : billingCycle}
                        paymentMode={paymentMode}
                        getAnnualSubscriptionPrice={getAnnualSubscriptionPrice}
                        onSelect={() => navigate("/auth")}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Enterprise - Continuation with slight breathing */}
          {customPlan && (
            <div className="mt-4 max-w-2xl mx-auto px-4">
              <Card className="bg-background border-border">
                <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-3 py-3 px-4">
                  <div className="text-center sm:text-left">
                    <span className="font-semibold text-foreground text-sm">
                      <EditableText contentKey="planos.custom.title" as="span" />
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      <EditableText contentKey="planos.custom.description" as="span" />
                    </span>
                  </div>
                  <Button variant="outline" className="gap-1.5 h-8 text-xs" size="sm">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <EditableText contentKey="planos.custom.cta" as="span" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

        </div>

        {/* ZPL FULL - Distinct section, prepaid only, no subscription */}
        {zplPlan && (
          <div className="py-8 px-4 bg-gradient-to-b from-primary/8 to-primary/3 border-t border-primary/10">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-primary/15 rounded-xl">
                  <Printer className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">
                    <EditableText contentKey="planos.zpl.title" as="span" />
                  </h3>
                  <span className="text-sm text-muted-foreground">
                    <EditableText contentKey="planos.zpl.subtitle" as="span" />
                  </span>
                </div>
              </div>

              <Card className="border-primary/25 bg-background shadow-md">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                      <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                        {zplPlan.features.slice(0, 4).map((feature, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <Check className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                            <span className="text-foreground">{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 flex flex-col gap-1">
                        <p className="text-xs text-muted-foreground">
                          <EditableText contentKey="planos.zpl.not_included" as="span" />
                        </p>
                        <p className="text-xs text-muted-foreground/80 flex items-center gap-1">
                          <Info className="w-3 h-3" />
                          Plano avulso, sem renovação automática
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 min-w-[180px]">
                      <span className="text-[10px] text-muted-foreground text-center mb-1">
                        Pagamento único por período
                      </span>
                      <ZplPriceSection zplPlan={zplPlan} onSelect={() => navigate("/auth")} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* FAQ section - White background */}
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

        {/* CTA - Light gray background */}
        <div className="py-8 px-4 bg-muted/40">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="text-base font-bold text-foreground mb-1">
              <EditableText contentKey="planos.cta.title" as="span" />
            </h2>
            <p className="text-muted-foreground mb-4 text-sm">
              <EditableText contentKey="planos.cta.subtitle" as="span" />
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button size="sm" className="h-10 text-sm px-6 shadow-sm" onClick={() => navigate("/auth")}>
                <EditableText contentKey="planos.cta.btn_primary" as="span" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/")} className="gap-1.5 h-10 text-sm px-5 bg-background">
                <ArrowLeft className="w-3.5 h-3.5" />
                <EditableText contentKey="planos.cta.btn_secondary" as="span" />
              </Button>
            </div>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
};

// Extracted component for volume plan cards
interface VolumePlanCardProps {
  plan: ReturnType<typeof usePlans>['volumePlans'][number];
  billingCycle: BillingCycle;
  paymentMode: PaymentMode;
  getAnnualSubscriptionPrice: (price: number) => number;
  onSelect: () => void;
}

function VolumePlanCard({ plan, billingCycle, paymentMode, getAnnualSubscriptionPrice, onSelect }: VolumePlanCardProps) {
  const isPopular = plan.code === 'volume_300' || plan.code === 'volume_700';
  const isSubscription = paymentMode === 'subscription';
  
  // For subscription mode, calculate monthly installment (pay 10, use 12)
  const monthlyPrice = plan.prices['monthly']?.price_cents;
  const price = plan.prices[billingCycle];
  
  // Calculate display price based on mode
  // Subscription: show monthly installment (total/12), Prepaid: show period total
  const annualTotal = monthlyPrice ? getAnnualSubscriptionPrice(monthlyPrice) : 0;
  const monthlyInstallment = Math.round(annualTotal / 12);
  const displayPrice = isSubscription ? monthlyInstallment : price?.price_cents;

  // Show "2 meses grátis" badge only for subscription mode
  const showAnnualSavings = isSubscription;
  
  return (
    <Card className={`relative h-full transition-all ${isPopular ? 'border-primary shadow-md ring-2 ring-primary/30' : 'hover:shadow-sm'}`}>
      {isPopular && (
        <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary text-[9px] px-1.5 py-0 shadow-sm">
          Popular
        </Badge>
      )}
      {showAnnualSavings && (
        <Badge className="absolute -top-2 right-1.5 bg-success text-white text-[9px] px-1.5 py-0 shadow-sm">
          2 meses grátis
        </Badge>
      )}
      <CardHeader className="pb-2 pt-3 px-3">
        <div className="flex items-center gap-1.5 mb-0.5">
          <ShoppingCart className="w-3.5 h-3.5 text-primary" />
          <CardTitle className="text-sm">{plan.name}</CardTitle>
        </div>
        <CardDescription className="text-xs line-clamp-1">
          {plan.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 px-3 pb-3">
        <div className="mb-2">
          {displayPrice ? (
            <>
              <div className="text-lg font-bold text-foreground">
                {formatPrice(displayPrice)}
                <span className="text-xs font-normal text-muted-foreground ml-0.5">/mês</span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                {isSubscription 
                  ? 'Cobrança mensal • Plano anual com 2 meses grátis' 
                  : (billingCycle === 'monthly' ? 'Pagamento único mensal' : `Pagamento único • ${formatPricePerMonth(price!.price_cents, price!.duration_days)}/mês equiv.`)}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">-</div>
          )}
        </div>
        
        <ul className="space-y-0.5 mb-2">
          {plan.features.slice(0, 2).map((feature, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs">
              <Check className="w-3 h-3 text-success mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground line-clamp-1">{feature}</span>
            </li>
          ))}
        </ul>
        
        <Button 
          className="w-full h-9 text-xs font-medium shadow-sm"
          size="sm"
          variant="default"
          onClick={onSelect}
        >
          {isSubscription ? 'Assinar plano' : 'Começar trial'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ZPL Price Section - Supports both Prepaid and Subscription modes
type ZplPaymentMode = 'prepaid' | 'subscription';

interface ZplPriceSectionProps {
  zplPlan: ReturnType<typeof usePlans>['zplPlan'];
  onSelect: () => void;
}

function ZplPriceSection({ zplPlan, onSelect }: ZplPriceSectionProps) {
  const [zplMode, setZplMode] = useState<ZplPaymentMode>('prepaid');
  const [selectedCycle, setSelectedCycle] = useState<'monthly' | 'quarterly' | 'semiannual'>('monthly');
  
  if (!zplPlan) return null;
  
  const monthlyPrice = zplPlan.prices['monthly']?.price_cents || 2490; // R$ 24,90
  
  // Annual subscription: pay 10 months, use 12 (2 free months)
  const annualTotalPrice = monthlyPrice * 10;
  const monthlyInstallment = Math.round(annualTotalPrice / 12);
  
  const prepaidCycles = [
    { key: 'monthly' as const, label: 'Mensal' },
    { key: 'quarterly' as const, label: 'Trimestral' },
    { key: 'semiannual' as const, label: 'Semestral' },
  ];
  
  return (
    <div className="flex flex-col gap-4">
      {/* ZPL Mode Toggle */}
      <div className="inline-flex rounded-lg border border-primary/20 p-0.5 bg-background self-center shadow-sm">
        <button
          onClick={() => setZplMode('prepaid')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
            zplMode === 'prepaid'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <CreditCard className="w-3 h-3" />
          Pagamento Avulso
        </button>
        <button
          onClick={() => setZplMode('subscription')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
            zplMode === 'subscription'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <RefreshCw className="w-3 h-3" />
          Assinatura
        </button>
      </div>

      {zplMode === 'prepaid' ? (
        /* Prepaid Mode - One-time payment per period */
        <div className="flex flex-col gap-2">
          <span className="text-[10px] text-muted-foreground text-center">
            Pagamento único por período • Sem renovação automática
          </span>
          {prepaidCycles.map(({ key, label }) => {
            const price = zplPlan.prices[key];
            if (!price) return null;
            const isSelected = selectedCycle === key;
            
            return (
              <Button 
                key={key}
                variant="default"
                size="sm"
                className={`h-9 text-xs px-4 justify-between transition-all ${
                  isSelected 
                    ? 'bg-primary shadow-md ring-2 ring-primary/30' 
                    : 'bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground'
                }`}
                onClick={() => {
                  setSelectedCycle(key);
                  onSelect();
                }}
              >
                <span>{label}</span>
                <span className="font-semibold">{formatPrice(price.price_cents)}</span>
              </Button>
            );
          })}
        </div>
      ) : (
        /* Subscription Mode - Annual only with monthly billing */
        <div className="flex flex-col gap-3">
          {/* Annual Subscription - 2 free months, monthly billing */}
          <div className="relative">
            <Badge className="absolute -top-2 right-2 bg-success text-white text-[9px] px-1.5 py-0 z-10 shadow-sm">
              2 meses grátis
            </Badge>
            <Button 
              variant="default"
              size="sm"
              className="h-14 w-full text-xs px-4 flex flex-col items-center gap-1 shadow-md ring-2 ring-primary/30"
              onClick={onSelect}
            >
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold">{formatPrice(monthlyInstallment)}</span>
                <span className="text-sm font-normal">/mês</span>
              </div>
              <span className="text-[10px] text-primary-foreground/80">
                Plano anual • 12 cobranças • 2 meses grátis
              </span>
            </Button>
          </div>
          
          <p className="text-[10px] text-muted-foreground/80 text-center">
            Cobrança mensal recorrente • Cancele quando quiser
          </p>
        </div>
      )}
    </div>
  );
}

export default Planos;
