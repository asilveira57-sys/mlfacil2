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

  // Calculate subscription discount (10% off monthly prepaid)
  const getSubscriptionPrice = (monthlyPrice: number) => {
    return Math.round(monthlyPrice * 0.9); // 10% discount
  };

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <main className="pt-16">
        {/* Hero - Compact with micro-breathing */}
        <div className="text-center max-w-3xl mx-auto px-4 pt-4 pb-6">
          <h1 className="text-xl md:text-2xl font-bold text-foreground mb-2">
            <EditableText contentKey="planos.hero.title" as="span" />
          </h1>
          <p className="text-sm text-muted-foreground mb-4">
            <EditableText contentKey="planos.hero.subtitle" as="span" />
          </p>
          
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex items-center gap-1.5 bg-success/10 text-success px-3 py-1 rounded-full">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">
                <EditableText contentKey="planos.trial.description" as="span" />
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
              <Info className="w-3 h-3" />
              <EditableText contentKey="planos.scope.notice" as="span" />
            </span>
          </div>
        </div>

        {/* Volume Plans Section - Clear transition from Hero */}
        <div className="bg-muted/30 pt-6 pb-6">
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
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-background">
              <button
                onClick={() => setPaymentMode('prepaid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  paymentMode === 'prepaid'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                Pagamento Antecipado
              </button>
              <button
                onClick={() => setPaymentMode('subscription')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  paymentMode === 'subscription'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
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
                <TabsList className="grid grid-cols-4 w-auto h-9">
                  <TabsTrigger value="monthly" className="px-3 text-xs">Mensal</TabsTrigger>
                  <TabsTrigger value="quarterly" className="px-3 text-xs">
                    Trimestral <Badge variant="secondary" className="ml-1 text-[9px] hidden sm:inline-flex px-1 py-0">-5%</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="semiannual" className="px-3 text-xs">
                    Semestral <Badge variant="secondary" className="ml-1 text-[9px] hidden sm:inline-flex px-1 py-0">-15%</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="annual" className="px-3 text-xs">
                    Anual <Badge variant="secondary" className="ml-1 text-[9px] hidden sm:inline-flex px-1 py-0">-20%</Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <span className="text-[11px] text-muted-foreground/60">
                Pagamento único. Sem renovação automática.
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="inline-flex items-center gap-1.5 bg-success/10 text-success px-2.5 py-1 rounded-full text-[11px] font-medium">
                <Sparkles className="w-3 h-3" />
                10% de economia
              </div>
              <span className="text-[11px] text-muted-foreground">
                Cobrança mensal recorrente
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
                    billingCycle={paymentMode === 'subscription' ? 'monthly' : billingCycle}
                    paymentMode={paymentMode}
                    getSubscriptionPrice={getSubscriptionPrice}
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
                        billingCycle={paymentMode === 'subscription' ? 'monthly' : billingCycle}
                        paymentMode={paymentMode}
                        getSubscriptionPrice={getSubscriptionPrice}
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

        {/* ZPL FULL - Alternative option with clear separation */}
        {zplPlan && (
          <div className="py-6 px-4 border-t border-border/50">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center gap-2 mb-3">
                <Printer className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-base font-semibold text-foreground">
                  <EditableText contentKey="planos.zpl.title" as="span" />
                </h3>
                <span className="text-xs text-muted-foreground">
                  <EditableText contentKey="planos.zpl.subtitle" as="span" />
                </span>
              </div>

              <Card className="border-border">
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {zplPlan.features.slice(0, 4).map((feature, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs">
                            <Check className="w-3 h-3 text-success mt-0.5 flex-shrink-0" />
                            <span className="text-muted-foreground">{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[10px] text-muted-foreground/70">
                        <EditableText contentKey="planos.zpl.not_included" as="span" />
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {(['monthly', 'quarterly', 'semiannual'] as const).map(cycle => {
                        const price = zplPlan.prices[cycle];
                        if (!price) return null;
                        const labels = { monthly: 'Mensal', quarterly: 'Trim.', semiannual: 'Sem.' };
                        
                        return (
                          <Button 
                            key={cycle}
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs px-3"
                            onClick={() => navigate("/auth")}
                          >
                            {labels[cycle]} {formatPrice(price.price_cents)}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* FAQ section */}
        <div className="py-6 px-4 bg-muted/20">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-base font-bold text-foreground text-center mb-4">
              <EditableText contentKey="planos.faq.title" as="span" />
            </h2>
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-background border border-border rounded-lg p-3">
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

        {/* CTA */}
        <div className="py-6 px-4">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="text-base font-bold text-foreground mb-1">
              <EditableText contentKey="planos.cta.title" as="span" />
            </h2>
            <p className="text-muted-foreground mb-4 text-sm">
              <EditableText contentKey="planos.cta.subtitle" as="span" />
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button size="sm" className="h-9 text-sm px-4" onClick={() => navigate("/auth")}>
                <EditableText contentKey="planos.cta.btn_primary" as="span" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/")} className="gap-1.5 h-9 text-sm px-4">
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
  getSubscriptionPrice: (price: number) => number;
  onSelect: () => void;
}

function VolumePlanCard({ plan, billingCycle, paymentMode, getSubscriptionPrice, onSelect }: VolumePlanCardProps) {
  const price = plan.prices[billingCycle];
  const isPopular = plan.code === 'volume_300' || plan.code === 'volume_700';
  const isSubscription = paymentMode === 'subscription';
  
  const displayPrice = isSubscription && price 
    ? getSubscriptionPrice(price.price_cents) 
    : price?.price_cents;

  const originalMonthlyPrice = plan.prices['monthly']?.price_cents;
  const savingsPercent = isSubscription && originalMonthlyPrice && displayPrice
    ? Math.round((1 - displayPrice / originalMonthlyPrice) * 100)
    : null;
  
  return (
    <Card className={`relative h-full ${isPopular ? 'border-primary shadow-sm ring-1 ring-primary/20' : ''}`}>
      {isPopular && (
        <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary text-[9px] px-1.5 py-0">
          Popular
        </Badge>
      )}
      {isSubscription && savingsPercent && savingsPercent > 0 && (
        <Badge className="absolute -top-2 right-1.5 bg-success/90 text-[9px] px-1 py-0">
          -{savingsPercent}%
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
              </div>
              <div className="text-[10px] text-muted-foreground">
                {isSubscription ? 'Recorrente' : (billingCycle === 'monthly' ? '/mês' : `${formatPricePerMonth(price!.price_cents, price!.duration_days)}/mês`)}
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
          className="w-full h-8 text-xs" 
          size="sm"
          variant={isPopular ? "default" : "outline"}
          onClick={onSelect}
        >
          {isSubscription ? 'Assinar' : 'Trial grátis'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default Planos;
