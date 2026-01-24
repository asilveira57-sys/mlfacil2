import { Section, SectionHeader } from "./Section";
import { 
  Boxes, 
  LineChart, 
  Zap, 
  BellRing, 
  History, 
  Target 
} from "lucide-react";

const benefits = [
  {
    icon: Boxes,
    title: "Centralização de rotinas",
    description: "Todas as operações do seu negócio em um só lugar. Sem precisar alternar entre várias ferramentas."
  },
  {
    icon: LineChart,
    title: "Visão clara de performance",
    description: "Dashboards intuitivos que mostram exatamente como está o desempenho das suas vendas."
  },
  {
    icon: Zap,
    title: "Menos trabalho manual",
    description: "Automatize tarefas repetitivas e foque no que realmente importa: crescer seu negócio."
  },
  {
    icon: BellRing,
    title: "Alertas e pendências",
    description: "Receba notificações sobre ações importantes e nunca perca uma oportunidade."
  },
  {
    icon: History,
    title: "Histórico e auditoria",
    description: "Acompanhe todas as mudanças e tenha controle total sobre a evolução dos seus anúncios."
  },
  {
    icon: Target,
    title: "Operação previsível",
    description: "Planeje com confiança usando dados confiáveis e análises precisas do mercado."
  }
];

export function LandingBenefits() {
  return (
    <Section id="beneficios" variant="muted">
      <SectionHeader
        title="Por que escolher nossa plataforma?"
        subtitle="Desenvolvida por sellers, para sellers. Entendemos os desafios do dia a dia e criamos soluções que realmente funcionam."
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {benefits.map((benefit, index) => (
          <div
            key={index}
            className="flex items-start gap-4 p-6 bg-card rounded-xl border border-border hover:shadow-md transition-shadow"
          >
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <benefit.icon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">
                {benefit.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {benefit.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
