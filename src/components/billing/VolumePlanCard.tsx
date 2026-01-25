import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ShoppingCart } from "lucide-react";
import type { Plan, PlanPrice } from "@/types/billing";
import { formatPriceBRL } from "@/hooks/useBillingPlans";

interface VolumePlanCardProps {
  plan: Plan;
  selectedPeriod: 'monthly' | 'quarterly' | 'semiannual';
  onCheckout: (priceId: string) => void;
  checkoutLoading: boolean;
}

export function VolumePlanCard({ 
  plan, 
  selectedPeriod, 
  onCheckout, 
  checkoutLoading 
}: VolumePlanCardProps) {
  const isPopular = plan.slug === 'volume_51_300' || plan.slug === 'volume_301_700';
  
  // Find the price for the selected period (one_time only for volume prepaid)
  const price = plan.prices.find(
    p => p.mode === 'one_time' && p.period === selectedPeriod
  );

  if (!price) return null;

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
          <div className="text-lg font-bold text-foreground">
            {formatPriceBRL(price.amount_cents)}
          </div>
          {price.label_sub && (
            <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
              {price.label_sub}
            </div>
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
          Comprar plano
        </Button>
      </CardContent>
    </Card>
  );
}
