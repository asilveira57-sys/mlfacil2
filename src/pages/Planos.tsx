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

      <main className="pt-20">
        {/* Hero - Ultra Compact */}
        <Section className="pb-2">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
              <EditableText contentKey="planos.hero.title" as="span" />
            </h1>
            <p className="text-sm text-muted-foreground mb-2">
              <EditableText contentKey="planos.hero.subtitle" as="span" />
            </p>
            
            {/* Trial Badge + Scope Notice inline */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mb-0">
              <div className="inline-flex items-center gap-1.5 bg-success/10 text-success px-2.5 py-1 rounded-full">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">
                  <EditableText contentKey="planos.trial.description" as="span" />
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground/80 flex items-center gap-1">
                <Info className="w-3 h-3 flex-shrink-0" />
                <EditableText contentKey="planos.scope.notice" as="span" />
              </div>
            </div>
          </div>
        </Section>

        {/* ZPL FULL Section - Minimal spacing, visual continuity */}
        {zplPlan && (
          <div className="bg-muted/30 pt-3 pb-4">
            <div className="max-w-4xl mx-auto px-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Badge className="bg-primary/10 text-primary border-primary/20 px-2 py-0.5 text-[11px]">
                  <Star className="w-2.5 h-2.5 mr-1 fill-primary" />
                  Só precisa imprimir etiquetas?
                </Badge>
                <div className="flex items-center gap-1.5">
                  <Printer className="w-4 h-4 text-primary" />
                  <span className="text-base font-semibold text-foreground">
                    <EditableText contentKey="planos.zpl.title" as="span" />
                  </span>
                </div>
              </div>

              <Card className="overflow-hidden border border-primary/20 shadow-sm">
                <div className="grid md:grid-cols-2">
                  {/* Features */}
                  <div className="p-3 bg-gradient-to-br from-primary/5 to-primary/10">
                    <ul className="space-y-1 mb-2">
                      {zplPlan.features.slice(0, 4).map((feature, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px]">
                          <Check className="w-3 h-3 text-success mt-0.5 flex-shrink-0" />
                          <span className="text-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="bg-warning/10 border border-warning/20 rounded p-1.5 text-[10px] text-muted-foreground">
                      <EditableText contentKey="planos.zpl.not_included" as="span" />
                    </div>
                  </div>

                  {/* Prices */}
                  <div className="p-3 flex flex-col justify-center bg-card">
                    <div className="space-y-1">
                      {(['monthly', 'quarterly', 'semiannual'] as const).map(cycle => {
                        const price = zplPlan.prices[cycle];
                        if (!price) return null;
                        const cycleLabels = { monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral' };
                        const discounts = { monthly: null, quarterly: '-5%', semiannual: '-15%' };
                        
                        return (
                          <div 
                            key={cycle}
                            className="flex items-center justify-between p-1.5 rounded border border-border hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group"
                            onClick={() => navigate("/auth")}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-foreground text-xs">{cycleLabels[cycle]}</span>
                              {discounts[cycle] && (
                                <Badge variant="secondary" className="text-[9px] bg-success/10 text-success border-success/20 px-1 py-0">
                                  {discounts[cycle]}
                                </Badge>
                              )}
                            </div>
                            <span className="font-bold text-foreground group-hover:text-primary text-xs">
                              {formatPrice(price.price_cents)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <Button className="mt-2 w-full h-7 text-xs" size="sm" onClick={() => navigate("/auth")}>
                      Começar trial de 14 dias
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* Volume Plans Section - Unified macro-section */}
        <Section className="py-4">
          <div className="text-center mb-2">
            <h2 className="text-lg md:text-xl font-bold text-foreground mb-0.5">
              <EditableText contentKey="planos.volume.title" as="span" />
            </h2>
            <p className="text-muted-foreground text-[11px]">
              <EditableText contentKey="planos.volume.subtitle" as="span" />
            </p>
          </div>

          {/* Payment Mode Toggle - Compact */}
          <div className="flex flex-col items-center gap-1 mb-2">
            <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/30">
              <button
                onClick={() => setPaymentMode('prepaid')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  paymentMode === 'prepaid'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <CreditCard className="w-3 h-3" />
                Pagamento Antecipado
              </button>
              <button
                onClick={() => setPaymentMode('subscription')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  paymentMode === 'subscription'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <RefreshCw className="w-3 h-3" />
                Assinatura Recorrente
              </button>
            </div>
            <span className="text-[10px] text-muted-foreground/70">
              Você pode trocar de plano ou cancelar a qualquer momento.
            </span>
          </div>

          {/* Payment mode specific content - Inline */}
          {paymentMode === 'prepaid' ? (
            <div className="flex flex-col items-center gap-1 mb-2">
              <Tabs value={billingCycle} onValueChange={(v) => setBillingCycle(v as BillingCycle)}>
                <TabsList className="grid grid-cols-4 w-auto h-7">
                  <TabsTrigger value="monthly" className="px-2 sm:px-3 text-[11px]">Mensal</TabsTrigger>
                  <TabsTrigger value="quarterly" className="px-2 sm:px-3 text-[11px]">
                    Tri <Badge variant="secondary" className="ml-0.5 text-[9px] hidden sm:inline-flex px-0.5 py-0">-5%</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="semiannual" className="px-2 sm:px-3 text-[11px]">
                    Sem <Badge variant="secondary" className="ml-0.5 text-[9px] hidden sm:inline-flex px-0.5 py-0">-15%</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="annual" className="px-2 sm:px-3 text-[11px]">
                    Anual <Badge variant="secondary" className="ml-0.5 text-[9px] hidden sm:inline-flex px-0.5 py-0">-20%</Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <span className="text-[10px] text-muted-foreground/60">
                Pagamento único. Sem renovação automática.
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="inline-flex items-center gap-1 bg-success/10 text-success px-2 py-0.5 rounded-full text-[10px] font-medium">
                <Sparkles className="w-2.5 h-2.5" />
                10% de economia
              </div>
              <span className="text-[10px] text-muted-foreground">
                Cobrança mensal recorrente
              </span>
            </div>
          )}

          {/* Volume Plans Grid - Tight spacing */}
          {loading ? (
            <div className="text-center py-4 text-muted-foreground text-xs">Carregando...</div>
          ) : (
            <div className="max-w-5xl mx-auto">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
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
                <div className="flex justify-center gap-2 flex-wrap">
                  {secondRowPlans.map((plan) => (
                    <div key={plan.id} className="w-full sm:w-[calc(50%-0.25rem)] lg:w-[calc(33.333%-0.25rem)]">
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

          {/* Enterprise - Direct continuation */}
          {customPlan && (
            <div className="mt-2 max-w-2xl mx-auto">
              <Card className="bg-muted/30 border-border">
                <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-2 py-2.5 px-4">
                  <div className="text-center sm:text-left">
                    <span className="font-medium text-foreground text-xs">
                      <EditableText contentKey="planos.custom.title" as="span" />
                    </span>
                    <span className="text-[11px] text-muted-foreground ml-2">
                      <EditableText contentKey="planos.custom.description" as="span" />
                    </span>
                  </div>
                  <Button variant="outline" className="gap-1 h-7 text-xs" size="sm">
                    <MessageSquare className="w-3 h-3" />
                    <EditableText contentKey="planos.custom.cta" as="span" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </Section>

        {/* FAQ section - Tight */}
        <div className="bg-muted/30 py-4">
          <div className="max-w-2xl mx-auto px-4">
            <div className="text-center mb-2">
              <h2 className="text-base font-bold text-foreground">
                <EditableText contentKey="planos.faq.title" as="span" />
              </h2>
            </div>

            <div className="space-y-1.5">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-card border border-border rounded p-2">
                  <h4 className="font-medium text-foreground text-xs">
                    <EditableText contentKey={`planos.faq.item${i}.question`} as="span" />
                  </h4>
                  <p className="text-muted-foreground text-[11px] mt-0.5">
                    <EditableText contentKey={`planos.faq.item${i}.answer`} as="span" />
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA - Minimal */}
        <Section className="py-4">
          <div className="text-center">
            <h2 className="text-base font-bold text-foreground mb-1">
              <EditableText contentKey="planos.cta.title" as="span" />
            </h2>
            <p className="text-muted-foreground mb-2 text-xs">
              <EditableText contentKey="planos.cta.subtitle" as="span" />
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button size="sm" onClick={() => navigate("/auth")}>
                <EditableText contentKey="planos.cta.btn_primary" as="span" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/")} className="gap-1">
                <ArrowLeft className="w-3 h-3" />
                <EditableText contentKey="planos.cta.btn_secondary" as="span" />
              </Button>
            </div>
          </div>
        </Section>
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
      <CardHeader className="pb-1 pt-2.5 px-2.5">
        <div className="flex items-center gap-1 mb-0">
          <ShoppingCart className="w-3 h-3 text-primary" />
          <CardTitle className="text-xs">{plan.name}</CardTitle>
        </div>
        <CardDescription className="text-[10px] line-clamp-1">
          {plan.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 px-2.5 pb-2.5">
        <div className="mb-1.5">
          {displayPrice ? (
            <>
              <div className="text-base font-bold text-foreground">
                {formatPrice(displayPrice)}
              </div>
              <div className="text-[9px] text-muted-foreground">
                {isSubscription ? 'Recorrente' : (billingCycle === 'monthly' ? '/mês' : `${formatPricePerMonth(price!.price_cents, price!.duration_days)}/mês`)}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">-</div>
          )}
        </div>
        
        <ul className="space-y-0 mb-1.5">
          {plan.features.slice(0, 2).map((feature, i) => (
            <li key={i} className="flex items-start gap-1 text-[10px]">
              <Check className="w-2.5 h-2.5 text-success mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground line-clamp-1">{feature}</span>
            </li>
          ))}
        </ul>
        
        <Button 
          className="w-full h-7 text-[11px]" 
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
