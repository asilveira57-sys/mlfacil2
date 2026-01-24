import { Section, SectionHeader } from "./Section";
import { FeatureCard } from "./FeatureCard";
import { 
  ClipboardList,
  TrendingUp,
  Users,
  CheckCircle,
  Calculator,
  FileText
} from "lucide-react";

const modules = [
  {
    icon: ClipboardList,
    title: "Pendências",
    description: "Gerencie tarefas, pedidos em atraso e ações necessárias em um painel centralizado.",
    href: "#"
  },
  {
    icon: TrendingUp,
    title: "Tendências & Insights",
    description: "Descubra produtos em alta, palavras-chave trending e oportunidades de mercado.",
    href: "#"
  },
  {
    icon: Users,
    title: "Concorrência",
    description: "Monitore preços, posicionamento e estratégias dos seus principais concorrentes.",
    href: "#"
  },
  {
    icon: CheckCircle,
    title: "Auditoria & Validações",
    description: "Identifique problemas nos seus anúncios antes que afetem suas vendas.",
    href: "#"
  },
  {
    icon: Calculator,
    title: "Custos & Margem",
    description: "Controle custos, calcule margens reais e otimize a precificação dos produtos.",
    href: "#"
  },
  {
    icon: FileText,
    title: "Relatórios",
    description: "Exporte dados detalhados para análise e acompanhe a evolução ao longo do tempo.",
    href: "#"
  }
];

export function LandingModules() {
  return (
    <Section id="recursos">
      <SectionHeader
        title="Módulos poderosos para seu negócio"
        subtitle="Ferramentas especializadas que cobrem todas as necessidades de um seller profissional."
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {modules.map((module, index) => (
          <FeatureCard
            key={index}
            icon={module.icon}
            title={module.title}
            description={module.description}
            href={module.href}
          />
        ))}
      </div>
    </Section>
  );
}
