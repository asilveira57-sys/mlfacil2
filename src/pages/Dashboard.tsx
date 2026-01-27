import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle, 
  XCircle, 
  CloudDownload, 
  RefreshCw, 
  Database,
  Settings,
  User as UserIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SalesDashboard } from "@/components/SalesDashboard";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardKpiCards } from "@/components/dashboard/DashboardKpiCards";
import { DashboardQuickActions } from "@/components/dashboard/DashboardQuickActions";
import { DashboardModulesGrid } from "@/components/dashboard/DashboardModulesGrid";
import { DashboardOnboarding } from "@/components/dashboard/DashboardOnboarding";
import { TrialBanner } from "@/components/access/TrialBanner";
import { PriorityInbox } from "@/components/notifications";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { useUserAccess } from "@/contexts/UserAccessContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SyncJob {
  id: string;
  status: string;
  total_records: number;
  processed_records: number;
}

interface SyncDebugInfo {
  cachedOrdersCount: number;
  cachedItemsCount: number;
  ordersWithItemsSynced: number;
  itemsSyncedPercent: number;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Use global active account context (source of truth)
  const { activeAccount, sellerId, loading: accountLoading, initialized, refreshAccounts } = useActiveAccount();

  // Sync state for settings
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncJob, setSyncJob] = useState<SyncJob | null>(null);
  const [syncDebugInfo, setSyncDebugInfo] = useState<SyncDebugInfo | null>(null);

  // Fetch sync debug info
  const fetchSyncDebugInfo = useCallback(async () => {
    if (!user || !sellerId) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await supabase.functions.invoke("ml-sales-data", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.data?._debug) {
        setSyncDebugInfo(response.data._debug);
      }
    } catch (err) {
      console.error("Error fetching sync debug info:", err);
    }
  }, [user, sellerId]);

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

  // Fetch debug info when settings open
  useEffect(() => {
    if (settingsOpen && activeAccount) {
      fetchSyncDebugInfo();
    }
  }, [settingsOpen, activeAccount, fetchSyncDebugInfo]);

  // Handle ML OAuth callback
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
      toast({
        title: "Conectado!",
        description: "Sua conta do Mercado Livre foi conectada com sucesso",
      });
      
      // Refresh accounts from global context
      refreshAccounts();
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [user, toast, refreshAccounts]);

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

  // Sync orders from settings
  const handleSyncOrders = async () => {
    if (!sellerId) return;

    setIsSyncing(true);
    setSyncJob(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Sessão expirada");
      }

      const response = await supabase.functions.invoke("ml-sync-orders", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { seller_id: sellerId }
      });

      if (response.error) {
        throw response.error;
      }

      if (response.data?.job_id) {
        toast({
          title: "Sincronização iniciada",
          description: "Os pedidos estão sendo sincronizados em background",
        });
        
        pollJobStatus(response.data.job_id);
      }
    } catch (err: any) {
      console.error("Error syncing orders:", err);
      setIsSyncing(false);
      toast({
        title: "Erro ao sincronizar",
        description: err?.message || "Não foi possível iniciar a sincronização",
        variant: "destructive",
      });
    }
  };

  // Poll job status
  const pollJobStatus = useCallback(async (jobId: string) => {
    const poll = async () => {
      const { data, error } = await supabase
        .from('sync_jobs')
        .select('id, status, total_records, processed_records')
        .eq('id', jobId)
        .maybeSingle();

      if (error || !data) {
        setIsSyncing(false);
        return;
      }

      setSyncJob(data);

      if (data.status === 'done') {
        setIsSyncing(false);
        toast({
          title: "Sincronização concluída",
          description: `${data.processed_records} pedidos sincronizados`,
        });
        fetchSyncDebugInfo();
      } else if (data.status === 'error') {
        setIsSyncing(false);
        toast({
          title: "Erro na sincronização",
          description: "Ocorreu um erro durante a sincronização",
          variant: "destructive",
        });
      } else {
        setTimeout(poll, 2000);
      }
    };

    poll();
  }, [toast, fetchSyncDebugInfo]);

  const syncProgress = syncJob && syncJob.total_records > 0 
    ? (syncJob.processed_records / syncJob.total_records) * 100 
    : 0;

  if (loading || accountLoading || !initialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const headerContent = (
    <div className="flex items-center gap-2">
      {/* ML Connection Status Badge */}
      {activeAccount ? (
        <Badge variant="outline" className="gap-1.5 text-success border-success/30 bg-success/10">
          <CheckCircle className="h-3 w-3" />
          <span className="hidden sm:inline">{activeAccount.nickname || "ML Conectado"}</span>
        </Badge>
      ) : (
        <Badge variant="outline" className="gap-1.5 text-muted-foreground">
          <XCircle className="h-3 w-3" />
          <span className="hidden sm:inline">ML Desconectado</span>
        </Badge>
      )}

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Sync</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sincronização de Dados</DialogTitle>
            <DialogDescription>
              Gerencie suas conexões e sincronização de dados do Mercado Livre
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* ML Connection Status */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Mercado Livre</h4>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  {activeAccount ? (
                    <CheckCircle className="w-5 h-5 text-success" />
                  ) : (
                    <XCircle className="w-5 h-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {activeAccount ? 'Conectado' : 'Desconectado'}
                    </p>
                    {activeAccount && (
                      <p className="text-xs text-muted-foreground">
                        {activeAccount.nickname || activeAccount.email || activeAccount.sellerId}
                      </p>
                    )}
                  </div>
                </div>
                {!activeAccount && (
                  <Button size="sm" onClick={() => { setSettingsOpen(false); handleConnectML(); }}>
                    Conectar
                  </Button>
                )}
              </div>
            </div>

            {/* Sync Section - Only show when ML is connected */}
            {activeAccount && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-muted-foreground" />
                  <h4 className="font-medium text-sm">Sincronização de Dados</h4>
                </div>

                {/* Sync Debug Info */}
                {syncDebugInfo && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-xl font-bold text-foreground">
                        {syncDebugInfo.cachedOrdersCount.toLocaleString("pt-BR")}
                      </div>
                      <div className="text-xs text-muted-foreground">Pedidos</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-xl font-bold text-foreground">
                        {syncDebugInfo.cachedItemsCount.toLocaleString("pt-BR")}
                      </div>
                      <div className="text-xs text-muted-foreground">Itens</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-xl font-bold text-foreground">
                        {syncDebugInfo.ordersWithItemsSynced.toLocaleString("pt-BR")}
                      </div>
                      <div className="text-xs text-muted-foreground">Pedidos c/ Itens</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className={`text-xl font-bold ${syncDebugInfo.itemsSyncedPercent >= 80 ? 'text-green-500' : syncDebugInfo.itemsSyncedPercent >= 50 ? 'text-amber-500' : 'text-destructive'}`}>
                        {syncDebugInfo.itemsSyncedPercent}%
                      </div>
                      <div className="text-xs text-muted-foreground">% Sincronizado</div>
                    </div>
                  </div>
                )}

                {/* Sync Progress */}
                {isSyncing && syncJob && (
                  <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Sincronizando...
                      </span>
                      <span className="text-muted-foreground">
                        {syncJob.processed_records} / {syncJob.total_records}
                      </span>
                    </div>
                    <Progress value={syncProgress} className="h-2" />
                  </div>
                )}

                {/* Sync Button */}
                <Button
                  onClick={handleSyncOrders}
                  disabled={isSyncing}
                  className="w-full"
                  variant="outline"
                >
                  {isSyncing ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Sincronizando...
                    </>
                  ) : (
                    <>
                      <CloudDownload className="w-4 h-4 mr-2" />
                      Sincronizar Pedidos
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground">
                  A sincronização carrega todos os pedidos e itens do Mercado Livre para o cache local,
                  permitindo análises mais rápidas e completas.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* User Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <UserIcon className="h-4 w-4" />
            <span className="hidden sm:inline max-w-[150px] truncate">
              {user?.email?.split("@")[0]}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{user?.email?.split("@")[0]}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("/settings")}>
            <Settings className="mr-2 h-4 w-4" />
            Configurações
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <DashboardLayout 
      title="Dashboard" 
      subtitle="Visão geral das suas operações no Mercado Livre"
      headerContent={headerContent}
    >
      <div className="p-4 lg:p-6 space-y-6">
        {/* Trial Banner */}
        <TrialBanner />

        {/* Connected State - Full Dashboard */}
        {activeAccount ? (
          <>
            {/* Priority Inbox - Pending Actions */}
            <PriorityInbox sellerId={sellerId || undefined} />

            {/* KPI Cards */}
            <DashboardKpiCards sellerId={sellerId || undefined} />

            {/* Quick Actions */}
            <DashboardQuickActions />

            {/* Sales Dashboard */}
            <div className="mt-6">
              <SalesDashboard />
            </div>

            {/* Modules Grid */}
            <DashboardModulesGrid />
          </>
        ) : (
          /* Onboarding State - Not Connected */
          <DashboardOnboarding onConnectML={handleConnectML} />
        )}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
