import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { PageContainer } from "@/components/layout/PageContainer";
import { SalesDashboard } from "@/components/SalesDashboard";
import { DashboardModulesGrid } from "@/components/dashboard/DashboardModulesGrid";
import { DashboardOnboarding } from "@/components/dashboard/DashboardOnboarding";
import { DashboardReconnectingState } from "@/components/dashboard/DashboardReconnectingState";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { useToast } from "@/hooks/use-toast";
import { useModuleFeedbackIntegration } from "@/hooks/useModuleFeedbackIntegration";
import { FeedbackPromptCard } from "@/components/feedback";

const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconnected, setReconnected] = useState(false);

  const { activeAccount, sellerId, loading: accountLoading, initialized, accounts, refreshAccounts } = useActiveAccount();
  const feedback = useModuleFeedbackIntegration('dashboard-analises');

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        navigate("/auth");
      } else if (event === 'SIGNED_IN') {
        setUser(session?.user ?? null);
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

  const handleConnectML = async () => {
    try {
      toast({
        title: "Conectando...",
        description: "Redirecionando para o Mercado Livre",
      });

      let { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({ title: "Sessão expirada", description: "Faça login novamente", variant: "destructive" });
        navigate("/auth");
        return;
      }

      let response = await supabase.functions.invoke('ml-auth-url', {
        body: { frontendOrigin: window.location.origin },
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (response.error?.message?.includes('401') || response.error?.status === 401) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          toast({ title: "Sessão expirada", description: "Faça login novamente", variant: "destructive" });
          navigate("/auth");
          return;
        }
        session = refreshData.session;
        response = await supabase.functions.invoke('ml-auth-url', {
          body: { frontendOrigin: window.location.origin },
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
      }

      if (response.error) throw response.error;
      if (response.data?.authUrl) {
        window.location.href = response.data.authUrl;
      } else {
        throw new Error('URL de autorização não recebida');
      }
    } catch (error: any) {
      console.error('Erro ao conectar com ML:', error);
      toast({
        title: "Erro ao conectar",
        description: error?.message || "Não foi possível iniciar a conexão",
        variant: "destructive",
      });
    }
  };

  const handleReconnected = useCallback(() => {
    setReconnected(true);
  }, []);

  if (loading || accountLoading || !initialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Determine dashboard state
  const hasAnyAccount = accounts.length > 0;
  const needsReconnect = activeAccount && (activeAccount.status === 'attention' || activeAccount.status === 'disconnected') && !reconnected;

  return (
    <PageContainer 
      title={t('dashboard:title')} 
      subtitle={t('dashboard:subtitle')}
    >
      <div className="p-4 lg:p-6 space-y-6">
        {!hasAnyAccount ? (
          // No accounts at all → first-time onboarding
          <DashboardOnboarding onConnectML={handleConnectML} />
        ) : needsReconnect ? (
          // Has account but token expired → reconnecting state
          <DashboardReconnectingState 
            accountId={activeAccount.id} 
            onReconnected={handleReconnected}
          />
        ) : (
          // Connected and ready
          <>
            <SalesDashboard />
            <DashboardModulesGrid />
            {feedback.ready && (
              <FeedbackPromptCard
                kind="module"
                moduleSlug="dashboard-analises"
                moduleName="Dashboard & Análises"
                userId={feedback.userId!}
                sellerId={feedback.sellerId!}
              />
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
};

export default Dashboard;
