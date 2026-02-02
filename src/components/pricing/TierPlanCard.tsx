import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import type { TierPlan, PricingMode, BillingCycle } from "@/hooks/useTierPlans";
import { formatPriceBRL, getPlanPrice } from "@/hooks/useTierPlans";
import { usePlanCta } from "@/hooks/usePlanCta";

interface TierPlanCardProps {
  plan: TierPlan;
  mode: PricingMode;
  period: BillingCycle;
  highlighted?: boolean;
  compact?: boolean; // For landing page use
  maxFeatures?: number; // Limit features shown
  onSelectPlan?: (plan: TierPlan, priceId: string) => void;
}

export function TierPlanCard({
  plan,
  mode,
  period,
  highlighted = false,
  compact = false,
  maxFeatures,
  onSelectPlan,
}: TierPlanCardProps) {
  const { getCtaConfig, handleCtaClick, isLoading } = usePlanCta();
  const price = getPlanPrice(plan, mode, period);
  const ctaConfig = getCtaConfig(mode);

  if (!price) {
    // Fallback: try to get any price for display
    const fallbackPrice = plan.prices.find(p => p.mode === mode) || plan.prices[0];
    if (!fallbackPrice) return null;
  }

  const displayPrice = price || plan.prices.find(p => p.mode === mode) || plan.prices[0];
  if (!displayPrice) return null;

  const featuresDisplay = maxFeatures 
    ? plan.features.slice(0, maxFeatures) 
    : plan.features;

  const handleClick = () => {
    if (onSelectPlan) {
      onSelectPlan(plan, displayPrice.id);
    } else {
      handleCtaClick(ctaConfig, displayPrice.id, plan.slug, mode, period);
    }
  };

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border transition-all duration-300",
        compact ? "p-4 md:p-5" : "p-6 md:p-8",
        highlighted
          ? "bg-primary text-primary-foreground border-primary shadow-xl scale-105 z-10"
          : "bg-card border-border hover:border-primary/30 hover:shadow-lg"
      )}
    >
      {/* Badge */}
      {highlighted && (
        <Badge 
          className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-accent text-accent-foreground text-xs font-medium"
        >
          Mais popular
        </Badge>
      )}

      {/* Header */}
      <div className={cn("mb-4", compact && "mb-3")}>
        <h3
          className={cn(
            "font-bold mb-1",
            compact ? "text-lg" : "text-xl",
            highlighted ? "text-primary-foreground" : "text-card-foreground"
          )}
        >
          {plan.name}
        </h3>
        <p
          className={cn(
            "text-sm",
            highlighted ? "text-primary-foreground/80" : "text-muted-foreground"
          )}
        >
          {plan.description}
        </p>
      </div>

      {/* Price */}
      <div className={cn("mb-4", compact && "mb-3")}>
        <div className="flex items-baseline gap-1">
          <span
            className={cn(
              "font-bold",
              compact ? "text-2xl" : "text-4xl",
              highlighted ? "text-primary-foreground" : "text-foreground"
            )}
          >
            {formatPriceBRL(displayPrice.price_cents)}
          </span>
          {mode === 'assinatura' && (
            <span
              className={cn(
                "text-sm",
                highlighted ? "text-primary-foreground/70" : "text-muted-foreground"
              )}
            >
              /mês
            </span>
          )}
        </div>
        {displayPrice.badge_text && (
          <Badge 
            variant="secondary" 
            className={cn(
              "mt-1 text-xs",
              highlighted && "bg-primary-foreground/20 text-primary-foreground"
            )}
          >
            {displayPrice.badge_text}
          </Badge>
        )}
      </div>

      {/* Features */}
      <ul className={cn("space-y-2 flex-1", compact ? "mb-4" : "mb-6")}>
        {featuresDisplay.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <Check
              className={cn(
                "w-4 h-4 flex-shrink-0 mt-0.5",
                highlighted ? "text-accent" : "text-success"
              )}
            />
            <span className={highlighted ? "text-primary-foreground" : "text-card-foreground"}>
              {feature}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA Button */}
      <Button
        onClick={handleClick}
        disabled={isLoading}
        variant={highlighted ? "secondary" : ctaConfig.variant}
        size={compact ? "default" : "lg"}
        className="w-full"
      >
        {ctaConfig.label}
      </Button>
    </div>
  );
}
