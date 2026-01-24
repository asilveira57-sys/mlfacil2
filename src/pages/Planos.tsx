import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LandingHeader, LandingFooter, PricingCard, Section, SectionHeader } from "@/components/landing";
import { ArrowLeft, Check } from "lucide-react";

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
      { text: "Alertas personalizados", included: false },
      { text: "API de integração", included: false }
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
      { text: "Alertas personalizados", included: true },
      { text: "API de integração", included: false }
    ]
  },
  {
    name: "Business",
    description: "Para operações de alto volume e equipes.",
    price: "A definir",
    features: [
      { text: "Contas ilimitadas", included: true },
      { text: "Todos os módulos inclusos", included: true },
      { text: "API de integração completa", included: true },
      { text: "Relatórios personalizados", included: true },
      { text: "Gerente de conta dedicado", included: true },
      { text: "Treinamento da equipe", included: true },
      { text: "SLA garantido", included: true },
      { text: "Onboarding personalizado", included: true }
    ]
  }
];

const comparisons = [
  { feature: "Contas Mercado Livre", starter: "1", pro: "Até 5", business: "Ilimitadas" },
  { feature: "Dashboard de vendas", starter: "Básico", pro: "Completo", business: "Avançado" },
  { feature: "Análise de performance", starter: true, pro: true, business: true },
  { feature: "Relatórios", starter: "Mensais", pro: "Ilimitados", business: "Personalizados" },
  { feature: "Módulo de concorrência", starter: false, pro: true, business: true },
  { feature: "Alertas personalizados", starter: false, pro: true, business: true },
  { feature: "API de integração", starter: false, pro: false, business: true },
  { feature: "Suporte", starter: "Email", pro: "Prioritário", business: "Dedicado" },
  { feature: "Treinamento", starter: false, pro: false, business: true },
  { feature: "SLA garantido", starter: false, pro: false, business: true }
];

const Planos = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <main className="pt-24">
        {/* Hero */}
        <Section>
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Planos e Preços
            </h1>
            <p className="text-lg text-muted-foreground">
              Escolha o plano ideal para o seu negócio. Todos incluem 7 dias de teste grátis.
            </p>
          </div>
        </Section>

        {/* Pricing cards */}
        <Section variant="muted">
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
        </Section>

        {/* Comparison table */}
        <Section>
          <SectionHeader
            title="Compare os planos"
            subtitle="Veja em detalhes o que cada plano oferece."
          />

          <div className="overflow-x-auto">
            <table className="w-full max-w-4xl mx-auto">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 px-4 font-medium text-muted-foreground">
                    Recurso
                  </th>
                  <th className="text-center py-4 px-4 font-semibold text-foreground">
                    Starter
                  </th>
                  <th className="text-center py-4 px-4 font-semibold text-primary">
                    Pro
                  </th>
                  <th className="text-center py-4 px-4 font-semibold text-foreground">
                    Business
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((row, index) => (
                  <tr key={index} className="border-b border-border">
                    <td className="py-4 px-4 text-foreground">
                      {row.feature}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {typeof row.starter === "boolean" ? (
                        row.starter ? (
                          <Check className="w-5 h-5 text-success mx-auto" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )
                      ) : (
                        <span className="text-muted-foreground text-sm">{row.starter}</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center bg-primary/5">
                      {typeof row.pro === "boolean" ? (
                        row.pro ? (
                          <Check className="w-5 h-5 text-success mx-auto" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )
                      ) : (
                        <span className="text-primary text-sm font-medium">{row.pro}</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {typeof row.business === "boolean" ? (
                        row.business ? (
                          <Check className="w-5 h-5 text-success mx-auto" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )
                      ) : (
                        <span className="text-muted-foreground text-sm">{row.business}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* FAQ section */}
        <Section variant="muted">
          <SectionHeader
            title="Dúvidas sobre planos?"
            subtitle="Perguntas frequentes sobre assinatura e pagamentos."
          />

          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-card border border-border rounded-lg p-6">
              <h4 className="font-semibold text-foreground mb-2">Posso trocar de plano depois?</h4>
              <p className="text-muted-foreground text-sm">
                Sim! Você pode fazer upgrade ou downgrade a qualquer momento. A diferença é calculada proporcionalmente.
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-6">
              <h4 className="font-semibold text-foreground mb-2">Existe desconto para pagamento anual?</h4>
              <p className="text-muted-foreground text-sm">
                Sim! Ao optar pelo pagamento anual você economiza 2 meses. Os preços serão definidos em breve.
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-6">
              <h4 className="font-semibold text-foreground mb-2">Como funciona o teste grátis?</h4>
              <p className="text-muted-foreground text-sm">
                Você tem 7 dias para testar todos os recursos do plano escolhido. Não é necessário cartão de crédito para começar.
              </p>
            </div>
          </div>
        </Section>

        {/* CTA */}
        <Section>
          <div className="text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
              Ainda em dúvida?
            </h2>
            <p className="text-muted-foreground mb-8">
              Fale com nossa equipe e tire todas as suas dúvidas antes de começar.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                onClick={() => navigate("/auth")}
              >
                Começar teste grátis
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/")}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar para início
              </Button>
            </div>
          </div>
        </Section>
      </main>

      <LandingFooter />
    </div>
  );
};

export default Planos;
