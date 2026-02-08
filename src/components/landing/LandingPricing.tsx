import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Section, SectionHeader } from "./Section";
import { EditableText } from "@/components/admin/EditableText";
import { TierPlanCard } from "@/components/pricing/TierPlanCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTierPlans } from "@/hooks/useTierPlans";
import { ArrowRight, Sparkles } from "lucide-react";
import type { TierPlan } from "@/hooks/useTierPlans";

export function LandingPricing() {
  const navigate = useNavigate();
  const { t } = useTranslation('landing');
  const { data, isLoading, error } = useTierPlans();

  // Get the first 3 volume plans for the landing page
  const displayPlans = data?.volumePlans.slice(0, 3) || [];
  const trialPolicy = data?.trialPolicy;

  const handlePlanSelect = (plan: TierPlan, priceId: string) => {
    // Navigate to /planos with plan pre-selected
    const price = plan.prices.find(p => p.id === priceId);
    const params = new URLSearchParams();
    params.set('plan', plan.slug);
    if (price) {
      params.set('mode', price.mode);
      params.set('cycle', price.period);
    }
    navigate(`/planos?${params.toString()}`);
  };

  const handleViewAllPlans = () => {
    navigate('/planos');
  };

  // Loading state
  if (isLoading) {
    return (
      <Section id="planos">
        <SectionHeader
          title={t('pricing.title')}
          subtitle={t('pricing.subtitle')}
        />
        <div className="grid md:grid-cols-3 gap-6 md:gap-8 max-w-5xl mx-auto items-start">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-6 rounded-2xl border border-border bg-card">
              <Skeleton className="h-6 w-24 mb-2" />
              <Skeleton className="h-4 w-32 mb-6" />
              <Skeleton className="h-10 w-28 mb-6" />
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </div>
              <Skeleton className="h-11 w-full mt-6" />
            </div>
          ))}
        </div>
      </Section>
    );
  }

  // Error state
  if (error || displayPlans.length === 0) {
    return (
      <Section id="planos">
        <SectionHeader
          title={t('pricing.title')}
          subtitle={t('pricing.subtitle')}
        />
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            Não foi possível carregar os planos. Tente novamente mais tarde.
          </p>
          <Button variant="outline" onClick={() => navigate('/planos')}>
            {t('pricing.view_all')}
          </Button>
        </div>
      </Section>
    );
  }

  return (
    <Section id="planos">
      <SectionHeader
        title={
          <EditableText contentKey="home.pricing.title" as="span">
            {t('pricing.title')}
          </EditableText>
        }
        subtitle={
          <EditableText contentKey="home.pricing.subtitle" as="span" multiline>
            {t('pricing.subtitle')}
          </EditableText>
        }
      />

      {/* Trial badge */}
      {trialPolicy && (
        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center gap-2 bg-success/10 text-success px-4 py-2 rounded-full border border-success/20">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">
              {t('pricing.trial_badge', { days: trialPolicy.trial_days })}
              {!trialPolicy.requires_card && t('pricing.trial_no_card')}
            </span>
          </div>
        </div>
      )}

      {/* Plans grid */}
      <div className="grid md:grid-cols-3 gap-6 md:gap-8 max-w-5xl mx-auto items-start">
        {displayPlans.map((plan, index) => {
          // Highlight the middle plan (Pro equivalent)
          const isHighlighted = index === 1;
          
          return (
            <TierPlanCard
              key={plan.id}
              plan={plan}
              mode="assinatura" // Default mode for landing
              period="mensal" // Default period for landing
              highlighted={isHighlighted}
              compact={true}
              maxFeatures={4}
              onSelectPlan={handlePlanSelect}
            />
          );
        })}
      </div>

      {/* View all plans CTA */}
      <div className="text-center mt-10">
        <Button 
          variant="outline" 
          size="lg" 
          onClick={handleViewAllPlans}
          className="gap-2"
        >
          {t('pricing.view_all')}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>

      <p className="text-center text-sm text-muted-foreground mt-6">
        {trialPolicy && t('pricing.trial_info', { days: trialPolicy.trial_days })}
      </p>
    </Section>
  );
}
