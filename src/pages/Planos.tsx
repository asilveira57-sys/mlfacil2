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
  Star
} from "lucide-react";

type BillingCycle = 'monthly' | 'quarterly' | 'semiannual';

const Planos = () => {
  const navigate = useNavigate();
  const { getText } = useSiteContent();
  const { volumePlans, zplPlan, customPlan, loading } = usePlans();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

  const getCycleDescription = (cycle: BillingCycle) => {
    switch (cycle) {
      case 'monthly': return getText('planos.cycle.monthly.description');
      case 'quarterly': return getText('planos.cycle.quarterly.description');
      case 'semiannual': return getText('planos.cycle.semiannual.description');
    }
  };

  // Split volume plans into two rows: first 3, then remaining
  const firstRowPlans = volumePlans.slice(0, 3);
  const secondRowPlans = volumePlans.slice(3);

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <main className="pt-24">
        {/* Hero */}
        <Section>
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              <EditableText contentKey="planos.hero.title" as="span" />
            </h1>
            <p className="text-lg text-muted-foreground mb-6">
              <EditableText contentKey="planos.hero.subtitle" as="span" />
            </p>
            
            {/* Trial Badge */}
            <div className="inline-flex items-center gap-2 bg-success/10 text-success px-4 py-2 rounded-full mb-6">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">
                <EditableText contentKey="planos.trial.description" as="span" />
              </span>
            </div>

            {/* Scope Notice */}
            <div className="bg-muted/50 border border-border rounded-lg p-4 text-sm text-muted-foreground max-w-2xl mx-auto">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <EditableText contentKey="planos.scope.notice" as="span" />
              </div>
            </div>
          </div>
        </Section>

        {/* ZPL FULL Section - NOW FIRST AND HIGHLIGHTED */}
        {zplPlan && (
          <Section variant="muted">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-6">
                <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 px-4 py-1.5">
                  <Star className="w-3.5 h-3.5 mr-1.5 fill-primary" />
                  Só precisa imprimir etiquetas? Este plano é pra você!
                </Badge>
                <div className="inline-flex items-center gap-2 mb-2">
                  <Printer className="w-6 h-6 text-primary" />
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                    <EditableText contentKey="planos.zpl.title" as="span" />
                  </h2>
                </div>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  <EditableText contentKey="planos.zpl.subtitle" as="span" />
                </p>
              </div>

              <Card className="overflow-hidden border-2 border-primary/30 shadow-lg">
                <div className="grid md:grid-cols-2">
                  {/* Features */}
                  <div className="p-6 bg-gradient-to-br from-primary/5 to-primary/10">
                    <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Check className="w-4 h-4 text-primary" />
                      O que inclui
                    </h3>
                    <ul className="space-y-2.5 mb-6">
                      {zplPlan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <Check className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                          <span className="text-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    
                    <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 text-xs text-muted-foreground">
                      <EditableText contentKey="planos.zpl.not_included" as="span" />
                    </div>
                  </div>

                  {/* Prices */}
                  <div className="p-6 flex flex-col justify-center bg-card">
                    <h3 className="font-semibold text-foreground mb-4">
                      Escolha o período
                    </h3>
                    <div className="space-y-3">
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
                            className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group"
                            onClick={() => navigate("/auth")}
                          >
                            <div className="flex items-center gap-2">
                              <div>
                                <div className="font-medium text-foreground flex items-center gap-2">
                                  {cycleLabels[cycle]}
                                  {discounts[cycle] && (
                                    <Badge variant="secondary" className="text-xs bg-success/10 text-success border-success/20">
                                      {discounts[cycle]}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {price.duration_days} dias
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-foreground group-hover:text-primary transition-colors">
                                {formatPrice(price.price_cents)}
                              </div>
                              {cycle !== 'monthly' && (
                                <div className="text-xs text-muted-foreground">
                                  {formatPricePerMonth(price.price_cents, price.duration_days)}/mês
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    <Button className="mt-6 w-full" size="lg" onClick={() => navigate("/auth")}>
                      Começar trial de 14 dias
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </Section>
        )}

        {/* Volume Plans Section */}
        <Section>
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
              <EditableText contentKey="planos.volume.title" as="span" />
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-4">
              <EditableText contentKey="planos.volume.subtitle" as="span" />
            </p>
            <p className="text-sm text-muted-foreground/80 max-w-xl mx-auto">
              <EditableText contentKey="planos.volume.notice" as="span" />
            </p>
          </div>

          {/* Billing Cycle Tabs */}
          <div className="flex justify-center mb-6">
            <Tabs value={billingCycle} onValueChange={(v) => setBillingCycle(v as BillingCycle)}>
              <TabsList className="grid grid-cols-3 w-auto">
                <TabsTrigger value="monthly" className="px-4 sm:px-6">
                  Mensal
                </TabsTrigger>
                <TabsTrigger value="quarterly" className="px-4 sm:px-6">
                  Trimestral
                  <Badge variant="secondary" className="ml-1.5 text-xs hidden sm:inline-flex">-5%</Badge>
                </TabsTrigger>
                <TabsTrigger value="semiannual" className="px-4 sm:px-6">
                  Semestral
                  <Badge variant="secondary" className="ml-1.5 text-xs hidden sm:inline-flex">-15%</Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Cycle Description */}
          <p className="text-center text-sm text-muted-foreground mb-8">
            {getCycleDescription(billingCycle)}
          </p>

          {/* Volume Plans Grid - 3 + 2 layout */}
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando planos...</div>
          ) : (
            <div className="max-w-5xl mx-auto">
              {/* First row: 3 cards */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                {firstRowPlans.map((plan) => (
                  <VolumePlanCard 
                    key={plan.id} 
                    plan={plan} 
                    billingCycle={billingCycle}
                    onSelect={() => navigate("/auth")}
                  />
                ))}
              </div>
              
              {/* Second row: 2 cards centered */}
              {secondRowPlans.length > 0 && (
                <div className="flex justify-center gap-4 flex-wrap">
                  {secondRowPlans.map((plan) => (
                    <div key={plan.id} className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.5rem)]">
                      <VolumePlanCard 
                        plan={plan} 
                        billingCycle={billingCycle}
                        onSelect={() => navigate("/auth")}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Custom Plan */}
          {customPlan && (
            <div className="mt-8 max-w-2xl mx-auto">
              <Card className="bg-gradient-to-r from-muted/50 to-muted/30 border-border">
                <CardContent className="flex flex-col md:flex-row items-center justify-between gap-4 py-6">
                  <div className="text-center md:text-left">
                    <h3 className="font-semibold text-foreground mb-1">
                      <EditableText contentKey="planos.custom.title" as="span" />
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      <EditableText contentKey="planos.custom.description" as="span" />
                    </p>
                  </div>
                  <Button variant="outline" className="gap-2 whitespace-nowrap">
                    <MessageSquare className="w-4 h-4" />
                    <EditableText contentKey="planos.custom.cta" as="span" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </Section>

        {/* FAQ section */}
        <Section variant="muted">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              <EditableText contentKey="planos.faq.title" as="span" />
            </h2>
            <p className="text-muted-foreground">
              <EditableText contentKey="planos.faq.subtitle" as="span" />
            </p>
          </div>

          <div className="max-w-2xl mx-auto space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-card border border-border rounded-lg p-5">
                <h4 className="font-semibold text-foreground mb-2">
                  <EditableText contentKey={`planos.faq.item${i}.question`} as="span" />
                </h4>
                <p className="text-muted-foreground text-sm">
                  <EditableText contentKey={`planos.faq.item${i}.answer`} as="span" />
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* CTA */}
        <Section>
          <div className="text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
              <EditableText contentKey="planos.cta.title" as="span" />
            </h2>
            <p className="text-muted-foreground mb-8">
              <EditableText contentKey="planos.cta.subtitle" as="span" />
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" onClick={() => navigate("/auth")}>
                <EditableText contentKey="planos.cta.btn_primary" as="span" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/")}
                className="gap-2"
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
  onSelect: () => void;
}

function VolumePlanCard({ plan, billingCycle, onSelect }: VolumePlanCardProps) {
  const price = plan.prices[billingCycle];
  const isPopular = plan.code === 'volume_300' || plan.code === 'volume_700';
  
  return (
    <Card className={`relative h-full ${isPopular ? 'border-primary shadow-lg ring-2 ring-primary/20' : ''}`}>
      {isPopular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
          Popular
        </Badge>
      )}
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 mb-1">
          <ShoppingCart className="w-4 h-4 text-primary" />
          <CardTitle className="text-base">{plan.name}</CardTitle>
        </div>
        <CardDescription className="text-xs line-clamp-2">
          {plan.description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          {price ? (
            <>
              <div className="text-2xl font-bold text-foreground">
                {formatPrice(price.price_cents)}
              </div>
              <div className="text-xs text-muted-foreground">
                {billingCycle !== 'monthly' && (
                  <span>{formatPricePerMonth(price.price_cents, price.duration_days)}/mês</span>
                )}
                {billingCycle === 'monthly' && <span>por mês</span>}
              </div>
            </>
          ) : (
            <div className="text-lg text-muted-foreground">-</div>
          )}
        </div>
        
        <ul className="space-y-1.5 mb-4 text-xs">
          {plan.features.slice(0, 4).map((feature, i) => (
            <li key={i} className="flex items-start gap-1.5">
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
          Começar trial
        </Button>
      </CardContent>
    </Card>
  );
}

export default Planos;
