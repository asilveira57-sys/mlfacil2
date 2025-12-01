import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BarChart3, TrendingUp, Target, Zap, ArrowRight } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background">
      {/* Hero Section */}
      <header className="container mx-auto px-6 py-8">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center">
              <BarChart3 className="w-7 h-7 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-foreground">ML Analyzer Pro</span>
          </div>
          <Button onClick={() => navigate("/auth")} variant="outline" size="lg">
            Entrar
          </Button>
        </nav>
      </header>

      <main className="container mx-auto px-6 py-16 md:py-24">
        <div className="text-center max-w-4xl mx-auto mb-20">
          <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-2 rounded-full mb-6 text-sm font-medium">
            <Zap className="w-4 h-4" />
            Análise Profissional de Anúncios do Mercado Livre
          </div>
          
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-foreground mb-6 leading-tight">
            Maximize suas vendas no{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Mercado Livre
            </span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-10 leading-relaxed max-w-3xl mx-auto">
            Ferramenta completa de análise e otimização de anúncios. Monitore métricas em tempo real, 
            analise concorrência e tome decisões baseadas em dados.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              onClick={() => navigate("/auth")} 
              size="lg" 
              className="text-lg px-8 py-6 gap-2"
            >
              Começar Gratuitamente
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button 
              variant="outline" 
              size="lg" 
              className="text-lg px-8 py-6"
            >
              Ver Demonstração
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <div className="bg-card p-8 rounded-2xl shadow-lg border border-border hover:shadow-elevated transition-all duration-300">
            <div className="w-14 h-14 bg-accent/10 rounded-xl flex items-center justify-center mb-6">
              <BarChart3 className="w-8 h-8 text-accent" />
            </div>
            <h3 className="text-xl font-semibold text-card-foreground mb-3">
              Métricas Detalhadas
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Acompanhe visitas, vendas, conversão, estoque e muito mais. Dados atualizados em tempo real.
            </p>
          </div>

          <div className="bg-card p-8 rounded-2xl shadow-lg border border-border hover:shadow-elevated transition-all duration-300">
            <div className="w-14 h-14 bg-success/10 rounded-xl flex items-center justify-center mb-6">
              <Target className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-xl font-semibold text-card-foreground mb-3">
              Ranking & SEO
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Monitore suas posições nas buscas e descubra palavras-chave com alto potencial de vendas.
            </p>
          </div>

          <div className="bg-card p-8 rounded-2xl shadow-lg border border-border hover:shadow-elevated transition-all duration-300">
            <div className="w-14 h-14 bg-warning/10 rounded-xl flex items-center justify-center mb-6">
              <TrendingUp className="w-8 h-8 text-warning" />
            </div>
            <h3 className="text-xl font-semibold text-card-foreground mb-3">
              Análise de Concorrência
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Compare preços, reputação e estratégias dos principais concorrentes do seu nicho.
            </p>
          </div>

          <div className="bg-card p-8 rounded-2xl shadow-lg border border-border hover:shadow-elevated transition-all duration-300">
            <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
              <span className="text-3xl">💰</span>
            </div>
            <h3 className="text-xl font-semibold text-card-foreground mb-3">
              Análise Financeira
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Calcule automaticamente margens, comissões, impostos e lucro líquido de cada produto.
            </p>
          </div>

          <div className="bg-card p-8 rounded-2xl shadow-lg border border-border hover:shadow-elevated transition-all duration-300">
            <div className="w-14 h-14 bg-destructive/10 rounded-xl flex items-center justify-center mb-6">
              <span className="text-3xl">⚡</span>
            </div>
            <h3 className="text-xl font-semibold text-card-foreground mb-3">
              Extensão Chrome
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Análise instantânea diretamente nas páginas do Mercado Livre. Sem copiar e colar.
            </p>
          </div>

          <div className="bg-card p-8 rounded-2xl shadow-lg border border-border hover:shadow-elevated transition-all duration-300">
            <div className="w-14 h-14 bg-accent/10 rounded-xl flex items-center justify-center mb-6">
              <span className="text-3xl">📊</span>
            </div>
            <h3 className="text-xl font-semibold text-card-foreground mb-3">
              Relatórios & Histórico
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Exporte relatórios completos e acompanhe a evolução dos seus anúncios ao longo do tempo.
            </p>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-24 text-center bg-gradient-primary p-12 rounded-3xl shadow-elevated">
          <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
            Pronto para otimizar suas vendas?
          </h2>
          <p className="text-xl text-primary-foreground/90 mb-8 max-w-2xl mx-auto">
            Junte-se a milhares de vendedores que já usam o ML Analyzer Pro para aumentar seus resultados
          </p>
          <Button 
            onClick={() => navigate("/auth")} 
            size="lg" 
            variant="secondary"
            className="text-lg px-10 py-6 gap-2"
          >
            Começar Agora
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </main>

      <footer className="container mx-auto px-6 py-12 text-center text-muted-foreground">
        <p>© 2024 ML Analyzer Pro. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};

export default Index;
