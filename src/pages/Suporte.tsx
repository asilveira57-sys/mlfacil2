import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteContentProvider } from "@/contexts/SiteContentContext";
import { LandingHeader, LandingFooter, LandingCTA } from "@/components/landing";
import {
  Headset,
  Camera,
  MessageCircle,
  Link2,
  Lightbulb,
  Users,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";

const Suporte = () => {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/settings?tab=support");
      }
    });
  }, [navigate]);

  useEffect(() => {
    // SEO meta tags
    document.title = "Suporte MKTP Fácil — Atendimento Direto para Vendedores de Marketplace";
    
    const setMeta = (name: string, content: string, isProperty = false) => {
      const attr = isProperty ? "property" : "name";
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    setMeta("description", "Suporte completo para vendedores de marketplace. Ticket com captura de tela, WhatsApp, base de conhecimento, dicas de consultor e atendimento direto com quem construiu o sistema.");
    setMeta("keywords", "suporte marketplace, atendimento vendedor mercado livre, suporte mercado livre, ticket suporte, whatsapp suporte marketplace, base de conhecimento marketplace, consultor mercado livre, MKTP Fácil suporte, gestão marketplace suporte");
    setMeta("robots", "index, follow");
    setMeta("og:title", "Suporte MKTP Fácil — Atendimento Direto para Vendedores de Marketplace", true);
    setMeta("og:description", "Suporte real com ticket inteligente, WhatsApp e consultoria estratégica para vendedores de marketplace.", true);
    setMeta("og:type", "website", true);
    setMeta("og:url", `${window.location.origin}/suporte`, true);
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", "Suporte MKTP Fácil — Atendimento Direto para Vendedores de Marketplace");
    setMeta("twitter:description", "Suporte real com ticket inteligente, WhatsApp e consultoria estratégica para vendedores de marketplace.");

    // canonical
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `${window.location.origin}/suporte`;
  }, []);

  return (
    <SiteContentProvider>
      <div className="min-h-screen bg-background">
        <LandingHeader />

        <main className="pt-20 md:pt-24">
          {/* Hero */}
          <section className="py-16 md:py-24 bg-gradient-to-b from-primary/5 to-background">
            <div className="container mx-auto px-4 md:px-6 text-center max-w-4xl">
              <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
                Suporte que Acompanha sua <span className="text-primary">Operação</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
                Vender em <strong>marketplace</strong> exige <strong>agilidade</strong>, <strong>estratégia</strong> e <strong>decisões rápidas</strong>.
                O <strong>MKTP Fácil</strong> foi construído para entregar <strong>gestão</strong>, mas também para garantir <strong>suporte real</strong> quando você precisar.
              </p>
              <p className="mt-4 text-muted-foreground">
                Aqui você encontra <strong>orientação</strong>, <strong>atendimento direto</strong> e <strong>conteúdo estratégico</strong> aplicado à prática.
              </p>
            </div>
          </section>

          {/* Estrutura de ajuda */}
          <section className="py-16 md:py-20">
            <div className="container mx-auto px-4 md:px-6 max-w-4xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Headset className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                  Estrutura Completa de Ajuda Dentro do Sistema
                </h2>
              </div>
              <p className="text-muted-foreground mb-6">
                Cada módulo da plataforma possui:
              </p>
              <ul className="space-y-3 mb-6">
                {[
                  "Explicação detalhada de funcionamento",
                  "Cards introdutórios com passo a passo",
                  "Fluxo guiado de configuração",
                  "Orientações estratégicas aplicadas à realidade do marketplace",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground">
                Ao acessar uma funcionalidade, <strong>você não fica perdido</strong>. O sistema mostra <strong>como usar</strong> e <strong>por que usar</strong>.
              </p>
            </div>
          </section>

          {/* Ticket com captura de tela */}
          <section className="py-16 md:py-20 bg-muted/50">
            <div className="container mx-auto px-4 md:px-6 max-w-4xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Camera className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                  Abertura de Ticket com Captura de Tela Automática
                </h2>
              </div>
              <p className="text-muted-foreground mb-4">
                Em todas as páginas existe um <strong>botão flutuante de suporte</strong>. Ao clicar:
              </p>
              <ol className="space-y-3 mb-6 list-decimal list-inside">
                <li className="text-foreground">O sistema registra automaticamente um <strong>print da sua tela</strong></li>
                <li className="text-foreground">Você descreve a <strong>dúvida ou problema</strong></li>
                <li className="text-foreground">Um <strong>ticket é gerado</strong> e enviado para a equipe</li>
              </ol>
              <p className="text-muted-foreground mb-4">
                Isso permite um <strong>atendimento mais rápido e preciso</strong>, pois a equipe já visualiza exatamente o que está acontecendo.
              </p>
              <p className="text-muted-foreground font-medium">
                Os chamados são analisados com <strong>prioridade</strong> e respondidos no <strong>menor prazo possível</strong>, normalmente em <strong>poucas horas</strong>.
              </p>
            </div>
          </section>

          {/* WhatsApp */}
          <section className="py-16 md:py-20">
            <div className="container mx-auto px-4 md:px-6 max-w-4xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                  Atendimento via WhatsApp
                </h2>
              </div>
              <p className="text-muted-foreground mb-4">
                Para situações que exigem <strong>agilidade maior</strong>, você também pode acionar a equipe pelo <strong>WhatsApp oficial</strong>.
              </p>

              <h3 className="text-lg font-semibold text-foreground mb-3">
                Esse canal é indicado para:
              </h3>
              <ul className="space-y-2 mb-6">
                {["Dúvidas rápidas", "Orientações emergenciais", "Acompanhamento de chamados"].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground">
                O suporte é <strong>direto</strong>, <strong>humano</strong> e <strong>próximo</strong>.
              </p>
            </div>
          </section>

          {/* Integrações Oficiais */}
          <section className="py-16 md:py-20 bg-muted/50">
            <div className="container mx-auto px-4 md:px-6 max-w-4xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Link2 className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                  Integrações Oficiais com Marketplaces
                </h2>
              </div>
              <p className="text-muted-foreground mb-4">
                O <strong>MKTP Fácil</strong> opera com base nas <strong>APIs oficiais</strong> de:
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {["Mercado Livre", "Shopee", "Tiny (Olist)", "Bling ERP"].map((name) => (
                  <div key={name} className="bg-background rounded-lg border border-border p-4 text-center font-medium text-foreground">
                    {name}
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground mb-2">
                Eventuais instabilidades podem ocorrer quando há alterações nas <strong>APIs</strong> ou regras das próprias plataformas. Sempre que isso acontece, a equipe atua para <strong>adaptar o sistema o mais rápido possível</strong>.
              </p>
              <p className="text-muted-foreground">
                A plataforma é <strong>estável e ativa</strong>, mas integrações dependem também do <strong>ambiente externo dos marketplaces</strong>.
              </p>
            </div>
          </section>

          {/* Dica do Consultor */}
          <section className="py-16 md:py-20">
            <div className="container mx-auto px-4 md:px-6 max-w-4xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Lightbulb className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                  Quadro "Dica do Consultor"
                </h2>
              </div>
              <p className="text-muted-foreground mb-4">
                Além do <strong>suporte técnico</strong>, o sistema entrega <strong>inteligência comercial aplicada</strong>.
              </p>
              <p className="text-muted-foreground mb-4">
                O quadro <strong>Dica do Consultor</strong> é um fluxo exclusivo desenvolvido por <strong>Alexandre Silveira</strong>, <strong>consultor certificado Mercado Livre</strong>.
              </p>

              <h3 className="text-lg font-semibold text-foreground mb-3">
                Você encontra:
              </h3>
              <ul className="space-y-2 mb-6">
                {[
                  "Dicas estratégicas por módulo",
                  "Estratégias comerciais validadas no dia a dia",
                  "Ajustes práticos que impactam margem e performance",
                  "Orientações baseadas nas melhores práticas do Mercado Livre",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>

              <h3 className="text-lg font-semibold text-foreground mb-3">
                É possível pesquisar as dicas por:
              </h3>
              <div className="flex flex-wrap gap-2 mb-6">
                {["Módulo", "Categoria", "Tag"].map((label) => (
                  <span key={label} className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium">
                    {label}
                  </span>
                ))}
              </div>
              <p className="text-muted-foreground font-medium">
                Não é apenas uma ferramenta operacional. É uma <strong>plataforma que orienta decisão estratégica</strong>.
              </p>
            </div>
          </section>

          {/* Suporte direto */}
          <section className="py-16 md:py-20 bg-muted/50">
            <div className="container mx-auto px-4 md:px-6 max-w-4xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                  Suporte Direto com Quem Construiu o Sistema
                </h2>
              </div>
              <p className="text-muted-foreground mb-4">
                O atendimento <strong>não é terceirizado</strong>. Você fala com:
              </p>
              <ul className="space-y-2 mb-6">
                {["A equipe técnica", "O desenvolvedor", "O proprietário da plataforma"].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <span className="text-foreground font-medium">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground">
                Isso garante <strong>respostas técnicas reais</strong> e <strong>evolução contínua</strong> da ferramenta.
              </p>
            </div>
          </section>

          {/* Melhoria constante */}
          <section className="py-16 md:py-20">
            <div className="container mx-auto px-4 md:px-6 max-w-4xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                  Compromisso com Melhoria Constante
                </h2>
              </div>
              <p className="text-muted-foreground mb-4">
                O <strong>MKTP Fácil</strong> está em <strong>constante evolução</strong>. Novas funcionalidades são implementadas com base:
              </p>
              <ul className="space-y-2 mb-6">
                {[
                  "Em mudanças de regra dos marketplaces",
                  "Em feedback de usuários",
                  "Em estratégias comerciais validadas",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-lg text-foreground font-semibold">
                A proposta é simples: oferecer <strong className="text-primary">gestão</strong>, <strong className="text-primary">suporte</strong> e <strong className="text-primary">estratégia</strong> no mesmo ambiente.
              </p>
            </div>
          </section>

          {/* CTA */}
          <LandingCTA />
        </main>

        <LandingFooter />
      </div>
    </SiteContentProvider>
  );
};

export default Suporte;
