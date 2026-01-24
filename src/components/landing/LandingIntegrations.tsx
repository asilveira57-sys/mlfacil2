import { Section, SectionHeader } from "./Section";
import { 
  CreditCard, 
  FileCheck, 
  Shield, 
  Users,
  Check
} from "lucide-react";

const integrations = [
  {
    icon: CreditCard,
    title: "Mercado Pago",
    description: "Pagamentos por assinatura e avulsos integrados nativamente."
  },
  {
    icon: FileCheck,
    title: "Notas e Faturamento",
    description: "Acompanhe notas fiscais e histórico de cobranças."
  },
  {
    icon: Shield,
    title: "Segurança & LGPD",
    description: "Dados criptografados e conformidade com legislação brasileira."
  },
  {
    icon: Users,
    title: "Multiconta",
    description: "Gerencie múltiplas contas do Mercado Livre em um só painel."
  }
];

export function LandingIntegrations() {
  return (
    <Section id="integracoes">
      <SectionHeader
        title="Integrações e Segurança"
        subtitle="Conectado com as principais ferramentas e preparado para proteger seus dados."
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {integrations.map((item, index) => (
          <div
            key={index}
            className="bg-card border border-border rounded-xl p-6 text-center hover:shadow-md transition-shadow"
          >
            <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
              <item.icon className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">
              {item.title}
            </h3>
            <p className="text-sm text-muted-foreground">
              {item.description}
            </p>
          </div>
        ))}
      </div>

      {/* Security badges */}
      <div className="mt-12 flex flex-wrap items-center justify-center gap-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Check className="w-5 h-5 text-success" />
          <span className="text-sm">SSL 256-bit</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Check className="w-5 h-5 text-success" />
          <span className="text-sm">LGPD Compliant</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Check className="w-5 h-5 text-success" />
          <span className="text-sm">Backup diário</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Check className="w-5 h-5 text-success" />
          <span className="text-sm">99.9% Uptime</span>
        </div>
      </div>
    </Section>
  );
}
