import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { PageContainer } from "@/components/layout/PageContainer";
import { SalesDashboard } from "@/components/SalesDashboard";
import { DashboardModulesGrid } from "@/components/dashboard/DashboardModulesGrid";
import { DashboardOnboarding } from "@/components/dashboard/DashboardOnboarding";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { useToast } from "@/hooks/use-toast";

const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const { activeAccount, sellerId, loading: accountLoading, initialized, refreshAccounts } = useActiveAccount();

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

      if (response.error?.message?.includes('401') || response.error?.status === 401) {
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

  if (loading || accountLoading || !initialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <PageContainer 
      title={t('dashboard:title')} 
      subtitle={t('dashboard:subtitle')}
    >
      <div className="p-4 lg:p-6 space-y-6">
        {activeAccount ? (
          <>
            {/* Sales Dashboard - Analytics */}
            <SalesDashboard />

            {/* Modules Grid */}
            <DashboardModulesGrid />
          </>
        ) : (
          <DashboardOnboarding onConnectML={handleConnectML} />
        )}
      </div>
    </PageContainer>
  );
};

export default Dashboard;
