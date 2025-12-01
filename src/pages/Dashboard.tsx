import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogOut, BarChart3, Plus, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logout realizado",
      description: "Você foi desconectado com sucesso",
    });
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-primary rounded-xl flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">ML Analyzer Pro</h1>
                <p className="text-xs text-muted-foreground">Análise Profissional de Anúncios</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {user?.email}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">Dashboard</h2>
          <p className="text-muted-foreground">
            Bem-vindo ao ML Analyzer Pro - sua ferramenta completa de análise de anúncios do Mercado Livre
          </p>
        </div>

        {/* Getting Started Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
          <Card className="p-6 hover:shadow-lg transition-all duration-300 border-2 border-dashed border-primary/20 hover:border-primary/40">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center">
                <Plus className="w-6 h-6 text-accent" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-card-foreground mb-2">
              1. Conecte sua Conta ML
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Vincule sua conta do Mercado Livre para começar a analisar seus anúncios automaticamente.
            </p>
            <Button className="w-full" variant="default">
              Conectar Mercado Livre
            </Button>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-all duration-300">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-success/10 rounded-xl flex items-center justify-center">
                <ExternalLink className="w-6 h-6 text-success" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-card-foreground mb-2">
              2. Instale a Extensão
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Baixe e instale a extensão do Chrome para análise em tempo real nas páginas do ML.
            </p>
            <Button className="w-full" variant="outline">
              Baixar Extensão
            </Button>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-all duration-300">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-warning/10 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-warning" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-card-foreground mb-2">
              3. Analise Produtos
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Navegue até qualquer anúncio no ML e veja análises detalhadas no painel lateral.
            </p>
            <Button className="w-full" variant="secondary" disabled>
              Aguardando Setup
            </Button>
          </Card>
        </div>

        {/* Features Overview */}
        <Card className="p-8">
          <h3 className="text-2xl font-bold text-card-foreground mb-6">
            Recursos Disponíveis
          </h3>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center mb-3">
                <span className="text-2xl">📊</span>
              </div>
              <h4 className="font-semibold text-card-foreground">Métricas Completas</h4>
              <p className="text-sm text-muted-foreground">
                Visitas, vendas, conversão, estoque e muito mais em tempo real
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center mb-3">
                <span className="text-2xl">🎯</span>
              </div>
              <h4 className="font-semibold text-card-foreground">Ranking de Palavras-Chave</h4>
              <p className="text-sm text-muted-foreground">
                Monitore suas posições e descubra oportunidades de SEO
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center mb-3">
                <span className="text-2xl">🔍</span>
              </div>
              <h4 className="font-semibold text-card-foreground">Análise de Concorrência</h4>
              <p className="text-sm text-muted-foreground">
                Compare preços, reputação e estratégias dos concorrentes
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
                <span className="text-2xl">📈</span>
              </div>
              <h4 className="font-semibold text-card-foreground">Tendências de Mercado</h4>
              <p className="text-sm text-muted-foreground">
                Identifique produtos em alta e oportunidades de crescimento
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center mb-3">
                <span className="text-2xl">💰</span>
              </div>
              <h4 className="font-semibold text-card-foreground">Análise Financeira</h4>
              <p className="text-sm text-muted-foreground">
                Calcule margens, impostos e lucro líquido automaticamente
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center mb-3">
                <span className="text-2xl">✅</span>
              </div>
              <h4 className="font-semibold text-card-foreground">Qualidade do Anúncio</h4>
              <p className="text-sm text-muted-foreground">
                Checklist completo com sugestões de melhorias
              </p>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default Dashboard;
