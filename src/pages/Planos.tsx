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

      <main className="pt-24">
        {/* Hero - Compact */}
        <Section className="pb-6">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
              <EditableText contentKey="planos.hero.title" as="span" />
            </h1>
            <p className="text-base text-muted-foreground mb-3">
              <EditableText contentKey="planos.hero.subtitle" as="span" />
            </p>
            
            {/* Trial Badge */}
            <div className="inline-flex items-center gap-2 bg-success/10 text-success px-3 py-1.5 rounded-full mb-3">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">
                <EditableText contentKey="planos.trial.description" as="span" />
              </span>
            </div>

            {/* Scope Notice */}
            <div className="bg-muted/50 border border-border rounded-lg p-2.5 text-xs text-muted-foreground max-w-2xl mx-auto">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <EditableText contentKey="planos.scope.notice" as="span" />
              </div>
            </div>
          </div>
        </Section>

        {/* ZPL FULL Section - Compact */}
        {zplPlan && (
          <Section variant="muted" className="py-6">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-3">
                <Badge className="mb-2 bg-primary/10 text-primary border-primary/20 px-3 py-1">
                  <Star className="w-3 h-3 mr-1 fill-primary" />
                  Só precisa imprimir etiquetas? Este plano é pra você!
                </Badge>
                <div className="inline-flex items-center gap-2 mb-1">
                  <Printer className="w-5 h-5 text-primary" />
                  <h2 className="text-xl md:text-2xl font-bold text-foreground">
                    <EditableText contentKey="planos.zpl.title" as="span" />
                  </h2>
                </div>
                <p className="text-muted-foreground max-w-2xl mx-auto text-xs">
                  <EditableText contentKey="planos.zpl.subtitle" as="span" />
                </p>
              </div>

              <Card className="overflow-hidden border-2 border-primary/30 shadow-lg">
                <div className="grid md:grid-cols-2">
                  {/* Features */}
                  <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10">
                    <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary" />
                      O que inclui
                    </h3>
                    <ul className="space-y-1.5 mb-3">
                      {zplPlan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs">
                          <Check className="w-3 h-3 text-success mt-0.5 flex-shrink-0" />
                          <span className="text-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    
                    <div className="bg-warning/10 border border-warning/20 rounded-lg p-2 text-xs text-muted-foreground">
                      <EditableText contentKey="planos.zpl.not_included" as="span" />
                    </div>
                  </div>

                  {/* Prices */}
                  <div className="p-4 flex flex-col justify-center bg-card">
                    <h3 className="font-semibold text-foreground mb-2 text-sm">
                      Escolha o período
                    </h3>
                    <div className="space-y-1.5">
                      {(['monthly', 'quarterly', 'semiannual'] as const).map(cycle => {
                        const price = zplPlan.prices[cycle];
                        if (!price) return null;
                        
                        const cycleLabels = {
                          monthly: 'Mensal',
                          quarterly: 'Trimestral',
                          semiannual: 'Semestral'
                        };
                        
                        const discounts = {
                          monthly: null,
                          quarterly: '-5%',
                          semiannual: '-15%'
                        };
                        
                        return (
                          <div 
                            key={cycle}
                            className="flex items-center justify-between p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group"
                            onClick={() => navigate("/auth")}
                          >
                            <div className="flex items-center gap-2">
                              <div>
                                <div className="font-medium text-foreground flex items-center gap-1.5 text-sm">
                                  {cycleLabels[cycle]}
                                  {discounts[cycle] && (
                                    <Badge variant="secondary" className="text-[10px] bg-success/10 text-success border-success/20 px-1 py-0">
                                      {discounts[cycle]}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {price.duration_days} dias
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-foreground group-hover:text-primary transition-colors text-sm">
                                {formatPrice(price.price_cents)}
                              </div>
                              {cycle !== 'monthly' && (
                                <div className="text-[10px] text-muted-foreground">
                                  {formatPricePerMonth(price.price_cents, price.duration_days)}/mês
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    <Button className="mt-3 w-full" size="sm" onClick={() => navigate("/auth")}>
                      Começar trial de 14 dias
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </Section>
        )}

        {/* Volume Plans Section */}
        <Section className="py-6">
          <div className="text-center mb-3">
            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-1">
              <EditableText contentKey="planos.volume.title" as="span" />
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-xs">
              <EditableText contentKey="planos.volume.subtitle" as="span" />
            </p>
          </div>

          {/* Payment Mode Toggle */}
          <div className="flex justify-center mb-2">
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30">
              <button
                onClick={() => setPaymentMode('prepaid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  paymentMode === 'prepaid'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                Pagamento Antecipado
              </button>
              <button
                onClick={() => setPaymentMode('subscription')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  paymentMode === 'subscription'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Assinatura Recorrente
              </button>
            </div>
          </div>

          {/* Fixed helper text */}
          <p className="text-center text-[11px] text-muted-foreground mb-3">
            Você pode trocar de plano ou cancelar a qualquer momento.
          </p>

          {/* Payment mode specific content */}
          {paymentMode === 'prepaid' ? (
            <>
              {/* Billing Cycle Tabs for Prepaid */}
              <div className="flex justify-center mb-2">
                <Tabs value={billingCycle} onValueChange={(v) => setBillingCycle(v as BillingCycle)}>
                  <TabsList className="grid grid-cols-4 w-auto h-8">
                    <TabsTrigger value="monthly" className="px-2 sm:px-4 text-xs">
                      Mensal
                    </TabsTrigger>
                    <TabsTrigger value="quarterly" className="px-2 sm:px-4 text-xs">
                      Trimestral
                      <Badge variant="secondary" className="ml-1 text-[10px] hidden sm:inline-flex px-1 py-0">-5%</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="semiannual" className="px-2 sm:px-4 text-xs">
                      Semestral
                      <Badge variant="secondary" className="ml-1 text-[10px] hidden sm:inline-flex px-1 py-0">-15%</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="annual" className="px-2 sm:px-4 text-xs">
                      Anual
                      <Badge variant="secondary" className="ml-1 text-[10px] hidden sm:inline-flex px-1 py-0">-20%</Badge>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Prepaid helper text */}
              <p className="text-center text-[11px] text-muted-foreground/70 mb-4">
                Pagamento único pelo período escolhido. Sem renovação automática.
              </p>
            </>
          ) : (
            <>
              {/* Subscription info */}
              <div className="text-center mb-4">
                <div className="inline-flex items-center gap-1.5 bg-success/10 text-success px-2.5 py-1 rounded-full text-[11px] font-medium mb-1.5">
                  <Sparkles className="w-3 h-3" />
                  Economia com assinatura
                </div>
                <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
                  Assinatura mensal oferece mais conveniência e desconto automático.
                  <span className="block text-muted-foreground/60 mt-0.5">
                    Pagamentos trimestrais, semestrais e anuais estão disponíveis na opção de pagamento antecipado.
                  </span>
                </p>
              </div>
            </>
          )}

          {/* Volume Plans Grid - 3 + 2 layout */}
          {loading ? (
            <div className="text-center py-6 text-muted-foreground text-sm">Carregando planos...</div>
          ) : (
            <div className="max-w-5xl mx-auto">
              {/* First row: 3 cards */}
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
              
              {/* Second row: 2 cards centered */}
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

          {/* Custom/Enterprise Plan */}
          {customPlan && (
            <div className="mt-4 max-w-2xl mx-auto">
              <Card className="bg-gradient-to-r from-muted/50 to-muted/30 border-border">
                <CardContent className="flex flex-col md:flex-row items-center justify-between gap-3 py-4">
                  <div className="text-center md:text-left">
                    <h3 className="font-semibold text-foreground mb-0.5 text-sm">
                      <EditableText contentKey="planos.custom.title" as="span" />
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      <EditableText contentKey="planos.custom.description" as="span" />
                    </p>
                  </div>
                  <Button variant="outline" className="gap-1.5 whitespace-nowrap" size="sm">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <EditableText contentKey="planos.custom.cta" as="span" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </Section>

        {/* FAQ section */}
        <Section variant="muted" className="py-6">
          <div className="text-center mb-4">
            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-1">
              <EditableText contentKey="planos.faq.title" as="span" />
            </h2>
            <p className="text-muted-foreground text-xs">
              <EditableText contentKey="planos.faq.subtitle" as="span" />
            </p>
          </div>

          <div className="max-w-2xl mx-auto space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-card border border-border rounded-lg p-3">
                <h4 className="font-semibold text-foreground mb-1 text-sm">
                  <EditableText contentKey={`planos.faq.item${i}.question`} as="span" />
                </h4>
                <p className="text-muted-foreground text-xs">
                  <EditableText contentKey={`planos.faq.item${i}.answer`} as="span" />
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* CTA */}
        <Section className="py-6">
          <div className="text-center">
            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-2">
              <EditableText contentKey="planos.cta.title" as="span" />
            </h2>
            <p className="text-muted-foreground mb-4 text-xs">
              <EditableText contentKey="planos.cta.subtitle" as="span" />
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <Button size="default" onClick={() => navigate("/auth")}>
                <EditableText contentKey="planos.cta.btn_primary" as="span" />
              </Button>
              <Button
                size="default"
                variant="outline"
                onClick={() => navigate("/")}
                className="gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
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
  
  // For subscription, apply 10% discount on monthly price
  const displayPrice = isSubscription && price 
    ? getSubscriptionPrice(price.price_cents) 
    : price?.price_cents;

  const originalMonthlyPrice = plan.prices['monthly']?.price_cents;
  const savingsPercent = isSubscription && originalMonthlyPrice && displayPrice
    ? Math.round((1 - displayPrice / originalMonthlyPrice) * 100)
    : null;
  
  return (
    <Card className={`relative h-full ${isPopular ? 'border-primary shadow-md ring-1 ring-primary/20' : ''}`}>
      {isPopular && (
        <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-[10px] px-2 py-0.5">
          Popular
        </Badge>
      )}
      {isSubscription && savingsPercent && savingsPercent > 0 && (
        <Badge className="absolute -top-2.5 right-2 bg-success/90 text-[10px] px-1.5 py-0.5">
          -{savingsPercent}%
        </Badge>
      )}
      <CardHeader className="pb-1.5 pt-3 px-3">
        <div className="flex items-center gap-1.5 mb-0.5">
          <ShoppingCart className="w-3.5 h-3.5 text-primary" />
          <CardTitle className="text-sm">{plan.name}</CardTitle>
        </div>
        <CardDescription className="text-[11px] line-clamp-2">
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
                {isSubscription ? (
                  <span className="flex flex-col">
                    <span>Cobrança mensal recorrente</span>
                    {originalMonthlyPrice && displayPrice < originalMonthlyPrice && (
                      <span className="text-success">
                        Economia de {formatPrice(originalMonthlyPrice - displayPrice)}/mês
                      </span>
                    )}
                  </span>
                ) : (
                  <>
                    {billingCycle !== 'monthly' && price && (
                      <span>{formatPricePerMonth(price.price_cents, price.duration_days)}/mês</span>
                    )}
                    {billingCycle === 'monthly' && <span>por mês</span>}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="text-base text-muted-foreground">-</div>
          )}
        </div>
        
        <ul className="space-y-0.5 mb-2 text-[11px]">
          {plan.features.slice(0, 3).map((feature, i) => (
            <li key={i} className="flex items-start gap-1">
              <Check className="w-3 h-3 text-success mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>
        
        <Button 
          className="w-full" 
          size="sm"
          variant={isPopular ? "default" : "outline"}
          onClick={onSelect}
        >
          {isSubscription ? 'Assinar plano' : 'Começar trial'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default Planos;
