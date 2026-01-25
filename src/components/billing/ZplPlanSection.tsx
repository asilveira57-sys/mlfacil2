import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Printer, Info, CreditCard, RefreshCw } from "lucide-react";
import type { Plan, PricePeriod } from "@/types/billing";
import { formatPriceBRL } from "@/hooks/useBillingPlans";
import { EditableText } from "@/components/admin/EditableText";

type ZplPaymentMode = 'avulso' | 'assinatura';

// Map internal period to display label
const periodLabels: Record<PricePeriod, string> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

interface ZplPlanSectionProps {
  plan: Plan;
  onCheckout: (priceId: string) => void;
  checkoutLoading: boolean;
  showAnnualCampaign: boolean;
}

export function ZplPlanSection({ plan, onCheckout, checkoutLoading, showAnnualCampaign }: ZplPlanSectionProps) {
  const [zplMode, setZplMode] = useState<ZplPaymentMode>('avulso');
  const [selectedPeriod, setSelectedPeriod] = useState<PricePeriod>('mensal');

  // Get prices by mode
  const avulsoPrices = plan.prices.filter(p => p.mode === 'avulso' && p.visible);
  const assinaturaPrices = plan.prices.filter(p => p.mode === 'assinatura' && p.visible);
  const annualCampaignPrice = assinaturaPrices.find(p => p.period === 'anual' && p.is_campaign);

  // Check if subscription mode is available
  const hasSubscription = showAnnualCampaign && annualCampaignPrice;

  // Get selected avulso price
  const selectedAvulsoPrice = avulsoPrices.find(p => p.period === selectedPeriod);

  // Determine label based on mode
  const currentLabelSub = zplMode === 'avulso' 
    ? 'Pagamento único • Sem renovação automática'
    : 'Cobrança mensal recorrente • Renovação automática • Cancele quando quiser';

  return (
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
              {/* Left side - Features */}
              <div className="flex-1">
                <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {plan.features.slice(0, 4).map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <div className="mt-4 flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">
                    <EditableText contentKey="planos.zpl.not_included" as="span" />
                  </p>
                  
                  {/* Dynamic label based on mode */}
                  <p className="text-xs text-muted-foreground/80 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    {currentLabelSub}
                  </p>

                  {/* Ethical defense paragraph */}
                  <p className="text-[10px] text-muted-foreground/70 mt-2 leading-relaxed">
                    O sistema não exibe marcas, contatos ou elementos proibidos nos arquivos gerados. 
                    Você mantém controle do conteúdo e segue as regras da plataforma.
                  </p>
                </div>
              </div>

              {/* Right side - Pricing */}
              <div className="flex flex-col gap-3 min-w-[200px]">
                {/* Mode Toggle */}
                <div className="inline-flex rounded-lg border border-primary/20 p-0.5 bg-background self-center shadow-sm">
                  <button
                    onClick={() => setZplMode('avulso')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                      zplMode === 'avulso'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <CreditCard className="w-3 h-3" />
                    Pagamento Avulso
                  </button>
                  {hasSubscription && (
                    <button
                      onClick={() => setZplMode('assinatura')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                        zplMode === 'assinatura'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <RefreshCw className="w-3 h-3" />
                      Assinatura
                    </button>
                  )}
                </div>

                {zplMode === 'avulso' ? (
                  /* Avulso Mode */
                  <div className="flex flex-col gap-2">
                    {avulsoPrices
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((price) => {
                        const isSelected = price.period === selectedPeriod;
                        const label = periodLabels[price.period] || price.period;
                        
                        return (
                          <Button 
                            key={price.id}
                            variant="default"
                            size="sm"
                            className={`h-9 text-xs px-4 justify-between transition-all ${
                              isSelected 
                                ? 'bg-primary shadow-md ring-2 ring-primary/30' 
                                : 'bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground'
                            }`}
                            onClick={() => {
                              setSelectedPeriod(price.period);
                              onCheckout(price.id);
                            }}
                            disabled={checkoutLoading}
                          >
                            <span>{label}</span>
                            <span className="font-semibold">{formatPriceBRL(price.price_cents)}</span>
                          </Button>
                        );
                      })}
                    <p className="text-[10px] text-muted-foreground text-center mt-2 leading-tight font-medium">
                      Plano avulso • Pagamento único • Sem renovação automática
                    </p>
                    <p className="text-[9px] text-muted-foreground/70 text-center leading-tight">
                      Sem limite de impressão de etiquetas
                    </p>
                  </div>
                ) : (
                  /* Subscription Mode */
                  annualCampaignPrice && (
                    <div className="flex flex-col gap-3">
                      <div className="relative">
                        {annualCampaignPrice.badge_text && (
                          <Badge className="absolute -top-2 right-2 bg-success text-white text-[9px] px-1.5 py-0 z-10 shadow-sm">
                            {annualCampaignPrice.badge_text}
                          </Badge>
                        )}
                        <div className="border-2 border-primary rounded-lg p-4 bg-primary/5 shadow-md ring-2 ring-primary/30">
                          <div className="flex items-baseline justify-center gap-1 mb-2">
                            <span className="text-2xl font-bold text-foreground">
                              {formatPriceBRL(annualCampaignPrice.price_cents)}
                            </span>
                            <span className="text-sm text-muted-foreground">/mês</span>
                          </div>
                          <p className="text-[11px] text-foreground/80 text-center leading-tight mb-1 font-medium">
                            {annualCampaignPrice.campaign_notes || 'Plano anual • 12 cobranças mensais • 2 meses grátis'}
                          </p>
                          <p className="text-[10px] text-muted-foreground text-center leading-tight mb-3">
                            Renovação automática • Cancele quando quiser
                          </p>
                          <Button 
                            variant="default"
                            size="sm"
                            className="w-full h-9 text-xs font-medium shadow-sm"
                            onClick={() => onCheckout(annualCampaignPrice.id)}
                            disabled={checkoutLoading}
                          >
                            Assinar plano
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
