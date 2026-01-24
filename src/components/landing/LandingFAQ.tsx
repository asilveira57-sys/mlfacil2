import { Section, SectionHeader } from "./Section";
import { FAQList } from "./FAQItem";
import { useSiteContentContext } from "@/contexts/SiteContentContext";

const faqItems = [
  {
    question: "Meus dados estão seguros?",
    answer: "Sim! Utilizamos criptografia SSL 256-bit, servidores protegidos e estamos em total conformidade com a LGPD. Seus dados nunca são compartilhados com terceiros."
  },
  {
    question: "Como funciona a cobrança?",
    answer: "Oferecemos planos mensais e anuais (com desconto). A cobrança é feita automaticamente via cartão de crédito ou PIX através do Mercado Pago. Você recebe 7 dias grátis para testar."
  },
  {
    question: "Posso cancelar a qualquer momento?",
    answer: "Sim, você pode cancelar sua assinatura quando quiser, sem multas ou burocracias. O acesso continua até o fim do período pago."
  },
  {
    question: "Como funciona o suporte multiconta?",
    answer: "Você pode conectar múltiplas contas do Mercado Livre ao seu painel. Cada conta é isolada e você pode alternar entre elas facilmente, mantendo dados e análises separados."
  },
  {
    question: "A integração com Mercado Livre é oficial?",
    answer: "Sim, utilizamos a API oficial do Mercado Livre. A conexão é feita através do OAuth, garantindo segurança e que nunca temos acesso à sua senha."
  },
  {
    question: "Qual o suporte disponível?",
    answer: "Oferecemos suporte por email para todos os planos. Planos Pro e Business contam com suporte prioritário e, no Business, você tem um gerente de conta dedicado."
  }
];

export function LandingFAQ() {
  const { getText } = useSiteContentContext();

  return (
    <Section id="faq">
      <SectionHeader
        title={getText('home.faq.title')}
        subtitle={getText('home.faq.subtitle')}
      />

      <FAQList items={faqItems} />
    </Section>
  );
}
