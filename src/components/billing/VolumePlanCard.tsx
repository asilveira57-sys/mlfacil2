import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ShoppingCart } from "lucide-react";
import type { Plan, PricePeriod } from "@/types/billing";
import { formatPriceBRL } from "@/hooks/useBillingPlans";

// Map internal period to component period
const periodMap: Record<string, PricePeriod> = {
  'monthly': 'mensal',
  'quarterly': 'trimestral',
  'semiannual': 'semestral',
};

interface VolumePlanCardProps {
  plan: Plan;
  selectedPeriod: 'monthly' | 'quarterly' | 'semiannual';
  mode: 'avulso' | 'assinatura';
  onCheckout: (priceId: string) => void;
  checkoutLoading: boolean;
}

export function VolumePlanCard({ 
  plan, 
  selectedPeriod,
  mode,
  onCheckout, 
  checkoutLoading 
}: VolumePlanCardProps) {
  const isPopular = plan.slug === '51-300' || plan.slug === '301-700';
  
  // Convert selected period to internal format and find price
  const internalPeriod = periodMap[selectedPeriod] || 'mensal';
  const price = plan.prices.find(
    p => p.mode === mode && p.period === internalPeriod
  );

  if (!price) return null;

  const ctaText = mode === 'assinatura' ? 'Assinar plano' : 'Comprar plano';

  return (
    <Card className={`relative h-full transition-all ${isPopular ? 'border-primary shadow-md ring-2 ring-primary/30' : 'hover:shadow-sm'}`}>
      {isPopular && (
        <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary text-[9px] px-1.5 py-0 shadow-sm">
          Popular
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
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-foreground">
              {formatPriceBRL(price.price_cents)}
            </span>
            {mode === 'assinatura' && (
              <span className="text-xs text-muted-foreground">/mês</span>
            )}
          </div>
          {price.badge_text && (
            <Badge variant="secondary" className="text-[9px] mt-1">
              {price.badge_text}
            </Badge>
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
          onClick={() => onCheckout(price.id)}
          disabled={checkoutLoading}
        >
          {ctaText}
        </Button>
      </CardContent>
    </Card>
  );
}
