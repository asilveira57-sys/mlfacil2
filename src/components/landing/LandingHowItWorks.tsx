import { Section, SectionHeader } from "./Section";
import { Link2, BarChart3, Rocket } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Link2,
    title: "Conecte sua conta",
    description: "Integração rápida e segura com o Mercado Livre. Seus dados são importados automaticamente."
  },
  {
    number: "02",
    icon: BarChart3,
    title: "Escolha e analise",
    description: "Explore os módulos disponíveis e analise seus dados com dashboards interativos e insights."
  },
  {
    number: "03",
    icon: Rocket,
    title: "Aplique e acompanhe",
    description: "Implemente as melhorias sugeridas e monitore os resultados em tempo real."
  }
];

export function LandingHowItWorks() {
  return (
    <Section id="como-funciona" variant="muted">
      <SectionHeader
        title="Como funciona?"
        subtitle="Em apenas 3 passos você começa a otimizar suas vendas."
      />

      <div className="grid md:grid-cols-3 gap-8 md:gap-12">
        {steps.map((step, index) => (
          <div key={index} className="relative text-center">
            {/* Connector line for desktop */}
            {index < steps.length - 1 && (
              <div className="hidden md:block absolute top-16 left-1/2 w-full h-0.5 bg-border" />
            )}
            
            {/* Step content */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center mb-6 shadow-lg">
                <step.icon className="w-8 h-8" />
              </div>
              
              <div className="text-4xl font-bold text-muted-foreground/20 mb-2">
                {step.number}
              </div>
              
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {step.title}
              </h3>
              
              <p className="text-muted-foreground text-sm max-w-xs">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
