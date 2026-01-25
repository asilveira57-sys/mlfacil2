import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LandingHeader, LandingFooter } from "@/components/landing";
import { useSiteContent } from "@/hooks/useSiteContent";
import { useBillingPlans, useBillingCheckout, formatPriceBRL } from "@/hooks/useBillingPlans";
import { EditableText } from "@/components/admin/EditableText";
import { VolumePlanCard } from "@/components/billing/VolumePlanCard";
import { ZplPlanSection } from "@/components/billing/ZplPlanSection";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  Info, 
  Sparkles,
  MessageSquare,
  CreditCard,
} from "lucide-react";

type BillingPeriod = 'monthly' | 'quarterly' | 'semiannual';

const Planos = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getText } = useSiteContent();
  const { volumePlans, zplPlan, settings, loading, error } = useBillingPlans();
  const { checkout, loading: checkoutLoading } = useBillingCheckout();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');

  // Handle payment status from URL
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    if (paymentStatus === 'failure') {
      toast.error('Pagamento não concluído', {
        description: 'Houve um problema com seu pagamento. Tente novamente.',
      });
    }
  }, [searchParams]);

  // Split volume plans into rows for layout
  const firstRowPlans = volumePlans.slice(0, 3);
  const secondRowPlans = volumePlans.slice(3);

  const handleCheckout = async (priceId: string) => {
    await checkout(priceId);
  };

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <main className="pt-16">
        {/* Hero - White background, compact */}
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

        {/* Volume Plans Section */}
        <div className="bg-muted/50 pt-6 pb-6">
          <div className="text-center mb-5">
            <h2 className="text-lg md:text-xl font-bold text-foreground mb-2">
              <EditableText contentKey="planos.volume.title" as="span" />
            </h2>
            <p className="text-muted-foreground text-sm">
              <EditableText contentKey="planos.volume.subtitle" as="span" />
            </p>
          </div>

          {/* Payment Mode Info */}
          <div className="flex flex-col items-center gap-2 mb-5">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border shadow-sm">
              <CreditCard className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-foreground">Pagamento Antecipado</span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              Plano avulso • Pagamento único • Sem renovação automática
            </span>
          </div>

          {/* Period Selector */}
          <div className="flex flex-col items-center gap-2 mb-6">
            <Tabs value={billingPeriod} onValueChange={(v) => setBillingPeriod(v as BillingPeriod)}>
              <TabsList className="grid grid-cols-3 w-auto h-9 bg-background">
                <TabsTrigger value="monthly" className="px-4 text-xs">Mensal</TabsTrigger>
                <TabsTrigger value="quarterly" className="px-4 text-xs">Trimestral</TabsTrigger>
                <TabsTrigger value="semiannual" className="px-4 text-xs">Semestral</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Volume Plans Grid */}
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Carregando planos...</div>
          ) : error ? (
            <div className="text-center py-8 text-destructive text-sm">
              Erro ao carregar planos. Tente novamente.
            </div>
          ) : (
            <div className="max-w-5xl mx-auto px-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
                {firstRowPlans.map((plan) => (
                  <VolumePlanCard 
                    key={plan.id} 
                    plan={plan} 
                    selectedPeriod={billingPeriod}
                    onCheckout={handleCheckout}
                    checkoutLoading={checkoutLoading}
                  />
                ))}
              </div>
              
              {secondRowPlans.length > 0 && (
                <div className="flex justify-center gap-3 flex-wrap">
                  {secondRowPlans.map((plan) => (
                    <div key={plan.id} className="w-full sm:w-[calc(50%-0.375rem)] lg:w-[calc(33.333%-0.375rem)]">
                      <VolumePlanCard 
                        plan={plan} 
                        selectedPeriod={billingPeriod}
                        onCheckout={handleCheckout}
                        checkoutLoading={checkoutLoading}
                      />
                    </div>
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
        </div>

        {/* ZPL FULL Section */}
        {zplPlan && (
          <ZplPlanSection 
            plan={zplPlan} 
            onCheckout={handleCheckout}
            checkoutLoading={checkoutLoading}
          />
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

export default Planos;
