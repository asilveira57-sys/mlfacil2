import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { PageContainer } from "@/components/layout/PageContainer";
import { SalesDashboard } from "@/components/SalesDashboard";
import { ActivationSpeedometer } from "@/components/dashboard/ActivationSpeedometer";
import { PlanLimitBanner } from "@/components/access/PlanLimitBanner";
import { useTenantLimits } from "@/hooks/useTenantLimits";
import { DashboardModulesGrid } from "@/components/dashboard/DashboardModulesGrid";
import { WidgetHubGrid } from "@/components/dashboard/widget-hub";

import { MLConnectionCard } from "@/components/dashboard/MLConnectionCard";
import { useMLConnectionState } from "@/hooks/useMLConnectionState";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { useModuleFeedbackIntegration } from "@/hooks/useModuleFeedbackIntegration";
import { FeedbackPromptCard } from "@/components/feedback";

function DashboardPlanLimitSection({ companyId }: { companyId?: string | null }) {
  const { limitCheck, loading } = useTenantLimits(companyId || undefined);
  if (loading || !limitCheck) return null;
  return <PlanLimitBanner limitCheck={limitCheck} />;
}

const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();

  const { activeAccount, loading: accountLoading, initialized } = useActiveAccount();
  const connectionInfo = useMLConnectionState();
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

  if (loading || accountLoading || !initialized || connectionInfo.state === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Determine what to render based on connection state
  const isConnected = connectionInfo.state === 'CONNECTED';

  return (
    <PageContainer 
      title={t('dashboard:title')} 
      subtitle={t('dashboard:subtitle')}
    >
      <div className="p-4 lg:p-6 space-y-6">
        {showWelcome ? (
          <WelcomeScreen
            userName={user?.user_metadata?.full_name || user?.email?.split('@')[0]}
            onContinue={() => setShowWelcome(false)}
          />
        ) : isConnected ? (
          <>
            {/* Connected status bar */}
            <MLConnectionCard connectionInfo={connectionInfo} />
            <WidgetHubGrid />
            <ActivationSpeedometer />
            <DashboardPlanLimitSection companyId={activeAccount?.companyId} />
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
        ) : (
          /* FIRST_CONNECTION, RECONNECTING, or RECONNECT_REQUIRED */
          <MLConnectionCard connectionInfo={connectionInfo} />
        )}
      </div>
    </PageContainer>
  );
};

export default Dashboard;
