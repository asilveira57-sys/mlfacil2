import { Section, SectionHeader } from "./Section";
import { PricingCard } from "./PricingCard";

const plans = [
  {
    name: "Starter",
    description: "Para quem está começando a vender online.",
    price: "A definir",
    features: [
      { text: "1 conta Mercado Livre", included: true },
      { text: "Dashboard básico", included: true },
      { text: "Análise de performance", included: true },
      { text: "Relatórios mensais", included: true },
      { text: "Suporte por email", included: true },
      { text: "Módulo de concorrência", included: false },
      { text: "Alertas personalizados", included: false }
    ]
  },
  {
    name: "Pro",
    description: "Para sellers que querem escalar suas operações.",
    price: "A definir",
    highlighted: true,
    features: [
      { text: "Até 5 contas Mercado Livre", included: true },
      { text: "Todos os dashboards", included: true },
      { text: "Análise completa de performance", included: true },
      { text: "Relatórios ilimitados", included: true },
      { text: "Suporte prioritário", included: true },
      { text: "Módulo de concorrência", included: true },
      { text: "Alertas personalizados", included: true }
    ]
  },
  {
    name: "Business",
    description: "Para operações de alto volume e equipes.",
    price: "A definir",
    features: [
      { text: "Contas ilimitadas", included: true },
      { text: "Todos os módulos inclusos", included: true },
      { text: "API de integração", included: true },
      { text: "Relatórios personalizados", included: true },
      { text: "Gerente de conta dedicado", included: true },
      { text: "Treinamento da equipe", included: true },
      { text: "SLA garantido", included: true }
    ]
  }
];

export function LandingPricing() {
  return (
    <Section id="planos">
      <SectionHeader
        title="Planos para cada fase do seu negócio"
        subtitle="Escolha o plano ideal e comece a transformar suas operações hoje mesmo."
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
        Todos os planos incluem 7 dias de teste grátis. Cancele quando quiser.
      </p>
    </Section>
  );
}
