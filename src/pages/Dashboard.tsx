import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogOut, BarChart3, Plus, ExternalLink, Settings, CheckCircle, XCircle, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SalesDashboard } from "@/components/SalesDashboard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface MLAccount {
  id: string;
  nickname: string | null;
  email: string | null;
  is_active: boolean | null;
  ml_user_id: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mlAccount, setMlAccount] = useState<MLAccount | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Fetch ML account status (pega a conta ativa mais recente)
  const fetchMlAccount = async (userId: string) => {
    const { data, error } = await supabase
      .from('ml_accounts')
      .select('id, nickname, email, is_active, ml_user_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Erro ao buscar conta ML:', error);
      return;
    }

    setMlAccount(data?.[0] ?? null);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      } else {
        fetchMlAccount(session.user.id);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      } else {
        fetchMlAccount(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Handle ML OAuth callback - simplified (tokens saved server-side)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mlConnected = params.get('ml_connected');
    const mlError = params.get('ml_error');
    
    if (mlError) {
      toast({
        title: "Erro na conexão",
        description: `Falha ao conectar: ${mlError}`,
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/dashboard');
      return;
    }
    
    if (mlConnected === 'true' && user) {
      const nickname = params.get('nickname');
      
      toast({
        title: "Conectado!",
        description: "Sua conta do Mercado Livre foi conectada com sucesso",
      });
      
      // Refresh ML account data from database
      fetchMlAccount(user.id);
      
      // Clean URL
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [user, toast]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logout realizado",
      description: "Você foi desconectado com sucesso",
    });
    navigate("/auth");
  };

  const handleConnectML = async () => {
    try {
      toast({
        title: "Conectando...",
        description: "Redirecionando para o Mercado Livre",
      });

      // Busca sessão atual para passar JWT explicitamente
      let { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Sessão expirada",
          description: "Faça login novamente para continuar",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }

      let response = await supabase.functions.invoke('ml-auth-url', {
        body: { frontendOrigin: window.location.origin },
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      // Se receber 401, tenta refresh e repete
      if (response.error?.message?.includes('401') || response.error?.status === 401) {
        console.log('Token expirado, tentando refresh...');
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError || !refreshData.session) {
          toast({
            title: "Sessão expirada",
            description: "Faça login novamente para continuar",
            variant: "destructive",
          });
          navigate("/auth");
          return;
        }
        
        session = refreshData.session;
        response = await supabase.functions.invoke('ml-auth-url', {
          body: { frontendOrigin: window.location.origin },
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
      }

      if (response.error) {
        throw response.error;
      }

      if (response.data?.authUrl) {
        window.location.href = response.data.authUrl;
      } else {
        throw new Error('URL de autorização não recebida');
      }
    } catch (error: any) {
      console.error('Erro ao conectar com ML:', error);
      const errorMsg = error?.message || "Não foi possível iniciar a conexão com o Mercado Livre";
      toast({
        title: "Erro ao conectar",
        description: errorMsg,
        variant: "destructive",
      });
    }
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
              
              {/* Settings Dialog */}
              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Settings className="w-4 h-4" />
                    <span className="hidden sm:inline">Configurações</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Configurações</DialogTitle>
                    <DialogDescription>
                      Gerencie suas conexões e preferências
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {/* ML Connection Status */}
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Mercado Livre</h4>
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          {mlAccount ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          ) : (
                            <XCircle className="w-5 h-5 text-muted-foreground" />
                          )}
                          <div>
                            <p className="text-sm font-medium">
                              {mlAccount ? 'Conectado' : 'Desconectado'}
                            </p>
                            {mlAccount && (
                              <p className="text-xs text-muted-foreground">
                                {mlAccount.nickname || mlAccount.email || mlAccount.ml_user_id}
                              </p>
                            )}
                          </div>
                        </div>
                        {!mlAccount && (
                          <Button size="sm" onClick={() => { setSettingsOpen(false); handleConnectML(); }}>
                            Conectar
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

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

        {/* Sales Dashboard - Only show when ML is connected */}
        {mlAccount && (
          <div className="mb-8">
            <SalesDashboard />
          </div>
        )}

        {/* Getting Started Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
          {mlAccount ? (
            <Card className="p-6 hover:shadow-lg transition-all duration-300 border-2 border-green-500/30 bg-green-500/5">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-card-foreground mb-2">
                ✓ Conta Conectada
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                {mlAccount.nickname || mlAccount.email || `ID: ${mlAccount.ml_user_id}`}
              </p>
              <p className="text-xs text-green-600 font-medium">
                Status: Ativo
              </p>
            </Card>
          ) : (
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
              <Button className="w-full" variant="default" onClick={handleConnectML}>
                Conectar Mercado Livre
              </Button>
            </Card>
          )}

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

          {mlAccount && (
            <Card 
              className="p-6 hover:shadow-lg transition-all duration-300 cursor-pointer border-2 border-primary/20 hover:border-primary/40"
              onClick={() => navigate('/shipping-labels')}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                  <Package className="w-6 h-6 text-primary" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-card-foreground mb-2">
                Etiquetas de Envio
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Gerencie e imprima etiquetas dos seus envios em PDF ou ZPL.
              </p>
              <Button className="w-full" variant="default">
                Acessar Etiquetas
              </Button>
            </Card>
          )}

          <Card className="p-6 hover:shadow-lg transition-all duration-300">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-warning/10 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-warning" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-card-foreground mb-2">
              {mlAccount ? '3.' : '3.'} Analise Produtos
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
