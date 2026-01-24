import { Section, SectionHeader } from "./Section";
import { PricingCard } from "./PricingCard";
import { useSiteContentContext } from "@/contexts/SiteContentContext";

export function LandingPricing() {
  const { getText } = useSiteContentContext();

  const plans = [
    {
      name: getText('home.pricing.plan1.name'),
      description: getText('home.pricing.plan1.description'),
      price: getText('home.pricing.plan1.price'),
      features: [
        { text: getText('home.pricing.plan1.feature1'), included: true },
        { text: getText('home.pricing.plan1.feature2'), included: true },
        { text: getText('home.pricing.plan1.feature3'), included: true }
      ]
    },
    {
      name: getText('home.pricing.plan2.name'),
      description: getText('home.pricing.plan2.description'),
      price: getText('home.pricing.plan2.price'),
      highlighted: true,
      features: [
        { text: getText('home.pricing.plan2.feature1'), included: true },
        { text: getText('home.pricing.plan2.feature2'), included: true },
        { text: getText('home.pricing.plan2.feature3'), included: true },
        { text: getText('home.pricing.plan2.feature4'), included: true }
      ]
    },
    {
      name: getText('home.pricing.plan3.name'),
      description: getText('home.pricing.plan3.description'),
      price: getText('home.pricing.plan3.price'),
      features: [
        { text: getText('home.pricing.plan3.feature1'), included: true },
        { text: getText('home.pricing.plan3.feature2'), included: true },
        { text: getText('home.pricing.plan3.feature3'), included: true },
        { text: getText('home.pricing.plan3.feature4'), included: true }
      ]
    }
  ];

  return (
    <Section id="planos">
      <SectionHeader
        title={getText('home.pricing.title')}
        subtitle={getText('home.pricing.subtitle')}
      />

      <div className="grid md:grid-cols-3 gap-6 md:gap-8 max-w-5xl mx-auto items-start">
        {plans.map((plan, index) => (
          <PricingCard
            key={index}
            name={plan.name}
            description={plan.description}
            price={plan.price}
            features={plan.features}
            highlighted={plan.highlighted}
          />
        ))}
      </div>

      <p className="text-center text-sm text-muted-foreground mt-10">
        {getText('home.pricing.trial_text')}
      </p>
    </Section>
  );
}
