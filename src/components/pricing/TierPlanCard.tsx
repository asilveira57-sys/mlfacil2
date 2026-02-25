import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Check, MessageSquare, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TierPlan, PricingMode, BillingCycle } from "@/hooks/useTierPlans";
import { formatPriceBRL, getPlanPrice } from "@/hooks/useTierPlans";
import { usePlanCta } from "@/hooks/usePlanCta";
import { isPlanTooSmall } from "@/hooks/useUserSalesVolume";
interface TierPlanCardProps {
  plan: TierPlan;
  mode: PricingMode;
  period: BillingCycle;
  highlighted?: boolean;
  compact?: boolean; // For landing page use
  maxFeatures?: number; // Limit features shown
  onSelectPlan?: (plan: TierPlan, priceId: string) => void;
  userTotalSales?: number; // Total sales across all accounts (last 30d)
}

export function TierPlanCard({
  plan,
  mode,
  period,
  highlighted = false,
  compact = false,
  maxFeatures,
  onSelectPlan,
  userTotalSales = 0,
}: TierPlanCardProps) {
  const { t } = useTranslation('landing');
  const planTooSmall = userTotalSales > 0 && isPlanTooSmall(plan.slug, userTotalSales);
  const { getCtaConfig, handleCtaClick, isLoading } = usePlanCta();
  const price = getPlanPrice(plan, mode, period);
  const ctaConfig = getCtaConfig(mode);

  // Check if this is a consultation plan (no prices)
  const isConsultationPlan = plan.prices.length === 0;

  if (!isConsultationPlan && !price) {
    // Fallback: try to get any price for display
    const fallbackPrice = plan.prices.find(p => p.mode === mode) || plan.prices[0];
    if (!fallbackPrice) return null;
  }

  const displayPrice = price || plan.prices.find(p => p.mode === mode) || plan.prices[0];

  const featuresDisplay = maxFeatures 
    ? plan.features.slice(0, maxFeatures) 
    : plan.features;

  // Get translated plan name and description based on slug
  const translatedName = t(`planos.plan_names.${plan.slug}`, { defaultValue: '' });
  const translatedDescription = t(`planos.plan_descriptions.${plan.slug}`, { defaultValue: '' });
  
  // Use translated values if available, otherwise fallback to database values
  const displayName = translatedName || plan.name;
  const displayDescription = translatedDescription || plan.description;

  const handleClick = () => {
    if (isConsultationPlan) {
      // For consultation plans, navigate to contact (WhatsApp or contact page)
      window.open('https://wa.me/5511999999999?text=Olá! Tenho interesse no plano para mais de 3000 vendas.', '_blank');
      return;
    }
    
    if (onSelectPlan && displayPrice) {
      onSelectPlan(plan, displayPrice.id);
    } else if (displayPrice) {
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
          {t('planos.most_popular')}
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
          {displayName}
        </h3>
        <p
          className={cn(
            "text-sm",
            highlighted ? "text-primary-foreground/80" : "text-muted-foreground"
          )}
        >
          {displayDescription}
        </p>
      </div>

      {/* Price */}
      <div className={cn("mb-4", compact && "mb-3")}>
        {isConsultationPlan ? (
          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                "font-bold",
                compact ? "text-xl" : "text-2xl",
                highlighted ? "text-primary-foreground" : "text-foreground"
              )}
            >
              {t('planos.consult_cta')}
            </span>
          </div>
        ) : displayPrice ? (
          <>
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
                  {t('planos.per_month')}
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
          </>
        ) : null}
      </div>

      {/* Features */}
      {featuresDisplay.length > 0 && (
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
      )}

      {/* Placeholder for plans without features */}
      {featuresDisplay.length === 0 && (
        <div className={cn("flex-1", compact ? "mb-4" : "mb-6")}>
          <p className={cn(
            "text-sm",
            highlighted ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {t('planos.consult_description')}
          </p>
        </div>
      )}

      {/* Plan too small warning */}
      {planTooSmall && (
        <div className="mb-3 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-[11px] leading-tight text-destructive">
              Seu volume de vendas ({userTotalSales}) excede este plano. 
              Para contratar, deslogue contas até ficar dentro da franquia.
            </p>
          </div>
        </div>
      )}

      {/* CTA Button */}
      <Button
        onClick={handleClick}
        disabled={planTooSmall || (!isConsultationPlan && isLoading)}
        variant={highlighted ? "secondary" : isConsultationPlan ? "outline" : ctaConfig.variant}
        size={compact ? "default" : "lg"}
        className={cn("w-full", isConsultationPlan && "gap-2")}
      >
        {isConsultationPlan ? (
          <>
            <MessageSquare className="w-4 h-4" />
            {t('planos.consult_cta')}
          </>
        ) : planTooSmall ? (
          'Plano insuficiente'
        ) : (
          ctaConfig.label
        )}
      </Button>
    </div>
  );
}
