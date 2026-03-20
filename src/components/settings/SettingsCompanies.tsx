import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Building2,
  Plus,
  Store,
  CheckCircle2,
  XCircle,
  Loader2,
  User,
  Building,
  Unplug,
  RefreshCw,
  FileText,
  Link2,
  ChevronDown,
  Key,
  Package,
  Eye,
  EyeOff,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CompanyLogoSection } from "./CompanyLogoSection";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";

interface MarketplaceAccount {
  id: string;
  ml_user_id: string;
  nickname: string | null;
  email: string | null;
  is_active: boolean;
  is_connected: boolean;
  token_expires_at: string | null;
  connection_status: 'connected' | 'attention' | 'disconnected' | 'revoked';
  last_api_ok_at: string | null;
  last_api_error_code: string | null;
  consecutive_failures: number;
  updated_at: string;
  company_id: string | null;
}

interface Company {
  id: string;
  display_name: string;
  billing_type: "PF" | "PJ";
  is_active: boolean;
  created_at: string;
  logo_url: string | null;
}

interface ErpConfig {
  company_id: string;
  erp_provider: 'none' | 'olist' | 'bling';
  erp_api_token: string | null;
}

interface BillingData {
  nomeFantasia: string | null;
  razaoSocial: string | null;
  personType: "pf" | "pj" | null;
}

const SettingsCompanies = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [accounts, setAccounts] = useState<MarketplaceAccount[]>([]);
  const [erpConfigs, setErpConfigs] = useState<Record<string, ErpConfig>>({});
  const [loading, setLoading] = useState(true);
  const [showNewCompanyDialog, setShowNewCompanyDialog] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyType, setNewCompanyType] = useState<"PF" | "PJ">("PJ");
  const [saving, setSaving] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [accountToDisconnect, setAccountToDisconnect] = useState<MarketplaceAccount | null>(null);
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [accountToLink, setAccountToLink] = useState<MarketplaceAccount | null>(null);
  const [selectedCompanyForLink, setSelectedCompanyForLink] = useState<string>("");
  const [connectingForCompany, setConnectingForCompany] = useState<string | null>(null);
  const [erpOpenStates, setErpOpenStates] = useState<Record<string, boolean>>({});
  const [showTokenStates, setShowTokenStates] = useState<Record<string, boolean>>({});
  const [savingErpId, setSavingErpId] = useState<string | null>(null);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editingCompanyName, setEditingCompanyName] = useState("");
  
  const { activeAccountId, setActiveAccount, refreshAccounts: refreshActiveAccountContext } = useActiveAccount();

  // Fetch companies, accounts, and billing from backend
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch companies
      const { data: companiesData, error: companiesError } = await supabase
        .from("companies")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (companiesError) throw companiesError;

      // Fetch ML accounts with company_id
      const { data: accountsData, error: accountsError } = await supabase
        .from("ml_accounts")
        .select("id, ml_user_id, nickname, email, is_active, is_connected, token_expires_at, connection_status, last_api_ok_at, last_api_error_code, consecutive_failures, updated_at, company_id")
        .eq("user_id", user.id)
        .order("is_active", { ascending: false });

      if (accountsError) throw accountsError;

      // Fetch billing data from billing_info table for autofill
      const { data: billingResult } = await supabase
        .from("billing_info")
        .select("nome_fantasia, razao_social, person_type")
        .eq("user_id", user.id)
        .maybeSingle();

      if (billingResult) {
        setBillingData({
          nomeFantasia: billingResult.nome_fantasia,
          razaoSocial: billingResult.razao_social,
          personType: billingResult.person_type as "pf" | "pj" | null,
        });
      }

      // Fetch ERP configurations for all companies
      if (companiesData && companiesData.length > 0) {
        const companyIds = companiesData.map((c: { id: string }) => c.id);
        const { data: erpData } = await supabase
          .from("erp_integrations")
          .select("company_id, provider, api_key")
          .in("company_id", companyIds);

        const erpMap: Record<string, ErpConfig> = {};
        (companiesData || []).forEach((company: { id: string }) => {
          const erpRecord = erpData?.find(e => e.company_id === company.id);
          const provider = erpRecord?.provider as 'olist' | 'bling' | undefined;
          erpMap[company.id] = {
            company_id: company.id,
            erp_provider: provider && ['olist', 'bling'].includes(provider) ? provider : 'none',
            erp_api_token: erpRecord?.api_key || null,
          };
        });
        setErpConfigs(erpMap);
      }

      setCompanies((companiesData || []) as Company[]);
      setAccounts((accountsData || []) as MarketplaceAccount[]);
    } catch (err) {
      console.error("[SettingsCompanies] Error fetching data:", err);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Get accounts grouped by company
  const accountsByCompany = accounts.reduce<Record<string, MarketplaceAccount[]>>((acc, account) => {
    const key = account.company_id || 'unlinked';
    if (!acc[key]) acc[key] = [];
    acc[key].push(account);
    return acc;
  }, {});

  const unlinkedAccounts = accountsByCompany['unlinked'] || [];

  const handleUseBillingData = () => {
    if (billingData) {
      const name = billingData.nomeFantasia || billingData.razaoSocial || "";
      setNewCompanyName(name);
      // Set type based on billing preference
      if (billingData.personType === "pj" || billingData.razaoSocial || billingData.nomeFantasia) {
        setNewCompanyType("PJ");
      } else {
        setNewCompanyType("PF");
      }
      toast.success("Dados de faturamento aplicados");
    }
  };

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) {
      toast.error("Nome da empresa é obrigatório");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { error } = await supabase
        .from("companies")
        .insert({
          user_id: user.id,
          display_name: newCompanyName.trim(),
          billing_type: newCompanyType,
          is_active: true,
        });

      if (error) throw error;

      setNewCompanyName("");
      setNewCompanyType("PJ");
      setShowNewCompanyDialog(false);
      toast.success("Empresa criada com sucesso!");
      fetchData();
    } catch (err) {
      console.error("[SettingsCompanies] Error creating company:", err);
      toast.error("Erro ao criar empresa");
    } finally {
      setSaving(false);
    }
  };

  const handleRenameCompany = async (companyId: string) => {
    const newName = editingCompanyName.trim();
    if (!newName) {
      toast.error("Nome não pode ficar vazio");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({ display_name: newName })
        .eq("id", companyId);
      if (error) throw error;
      toast.success("Nome da empresa atualizado!");
      setEditingCompanyId(null);
      fetchData();
    } catch (err) {
      console.error("[SettingsCompanies] Error renaming company:", err);
      toast.error("Erro ao renomear empresa");
    } finally {
      setSaving(false);
    }
  };

    setSaving(true);
    setConnectingForCompany(companyId || null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      // Call ml-auth-url to get OAuth URL with company context
      const { data, error } = await supabase.functions.invoke("ml-auth-url", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { 
          frontendOrigin: window.location.origin,
          companyId: companyId || null,
        },
      });

      if (error) throw error;
      if (!data?.authUrl) throw new Error("URL de autenticação não retornada");

      // Redirect to ML OAuth
      window.location.href = data.authUrl;
    } catch (err) {
      console.error("[SettingsCompanies] Error connecting account:", err);
      toast.error("Erro ao conectar conta");
    } finally {
      setSaving(false);
      setConnectingForCompany(null);
    }
  };

  const handleLinkAccountToCompany = async () => {
    if (!accountToLink || !selectedCompanyForLink) return;

    // Check if company already has an account
    const existingAccountsForCompany = accounts.filter(a => a.company_id === selectedCompanyForLink);
    if (existingAccountsForCompany.length > 0) {
      toast.error("Esta empresa já possui uma conta ML vinculada. Limite: 1 conta por empresa.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("ml_accounts")
        .update({ company_id: selectedCompanyForLink })
        .eq("id", accountToLink.id);

      if (error) throw error;

      toast.success("Conta vinculada à empresa!");
      setShowLinkDialog(false);
      setAccountToLink(null);
      setSelectedCompanyForLink("");
      fetchData();
    } catch (err) {
      console.error("[SettingsCompanies] Error linking account:", err);
      toast.error("Erro ao vincular conta");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnectAccount = async () => {
    if (!accountToDisconnect) return;

    setDisconnectingId(accountToDisconnect.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { error } = await supabase
        .from("ml_accounts")
        .update({
          access_token: null,
          refresh_token: null,
          token_expires_at: null,
          is_active: false,
          is_connected: false,
          connection_status: 'disconnected',
          revoked_at: new Date().toISOString(),
          revoked_by: user.id,
          revoke_reason: 'Desconexão manual pelo usuário',
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountToDisconnect.id)
        .eq("user_id", user.id);

      if (error) throw error;

      // Audit log
      try {
        await supabase.rpc('register_system_log', {
          p_level: 'info',
          p_system_area: 'ml_accounts',
          p_action: 'disconnect',
          p_user_id: user.id,
          p_success: true,
          p_message: `Conta ${accountToDisconnect.nickname || accountToDisconnect.ml_user_id} desconectada manualmente`,
          p_meta_json: {
            account_id: accountToDisconnect.id,
            seller_id: accountToDisconnect.ml_user_id,
            company_id: accountToDisconnect.company_id,
            user_id: user.id,
            reason: 'manual_disconnect',
          },
        });
      } catch (_) { /* fail-safe */ }

      toast.success("Conta desconectada com sucesso");
      setShowDisconnectDialog(false);
      setAccountToDisconnect(null);
      
      // Clear caches
      window.dispatchEvent(new CustomEvent('active_account_changed', { detail: { accountId: '', sellerId: '' } }));
      window.dispatchEvent(new CustomEvent('clear_sales_cache'));
      
      fetchData();
      refreshActiveAccountContext();
    } catch (err) {
      console.error("[SettingsCompanies] Error disconnecting:", err);
      toast.error("Erro ao desconectar conta");
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleSetActiveAccount = async (accountId: string) => {
    try {
      const success = await setActiveAccount(accountId);
      if (success) {
        fetchData();
      }
    } catch (err) {
      console.error("[SettingsCompanies] Error setting active:", err);
      toast.error("Erro ao definir conta ativa");
    }
  };

  const handleErpChange = (companyId: string, provider: 'none' | 'olist' | 'bling') => {
    setErpConfigs(prev => ({
      ...prev,
      [companyId]: {
        ...prev[companyId],
        company_id: companyId,
        erp_provider: provider,
      }
    }));
  };

  const handleErpTokenChange = (companyId: string, token: string) => {
    setErpConfigs(prev => ({
      ...prev,
      [companyId]: {
        ...prev[companyId],
        company_id: companyId,
        erp_api_token: token,
      }
    }));
  };

  const handleSaveErpConfig = async (companyId: string) => {
    const config = erpConfigs[companyId];
    if (!config) return;

    setSavingErpId(companyId);
    try {
      if (config.erp_provider === 'none') {
        // Delete existing ERP config if any
        await supabase
          .from("erp_integrations")
          .delete()
          .eq("company_id", companyId);
      } else {
        // Upsert ERP config
        const { error } = await supabase
          .from("erp_integrations")
          .upsert({
            company_id: companyId,
            provider: config.erp_provider,
            api_key: config.erp_api_token,
            status: 'connected',
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'company_id,provider',
          });

        if (error) throw error;
      }

      toast.success("Configuração ERP salva!");
    } catch (err) {
      console.error("[SettingsCompanies] Error saving ERP config:", err);
      toast.error("Erro ao salvar configuração ERP");
    } finally {
      setSavingErpId(null);
    }
  };

  const getAccountStatus = (account: MarketplaceAccount) => {
    // is_connected=false is the definitive disconnected state
    if (account.is_connected === false) {
      return { 
        label: "Desconectada", 
        color: "bg-gray-500/10 text-gray-600 border-gray-200",
        icon: XCircle,
        needsReconnect: true,
      };
    }
    const status = account.connection_status || 'connected';
    
    switch (status) {
      case 'connected':
        return { 
          label: "Conectada", 
          color: "bg-green-500/10 text-green-600 border-green-200",
          icon: CheckCircle2,
          needsReconnect: false,
        };
      case 'attention':
        return { 
          label: "Atenção", 
          color: "bg-amber-500/10 text-amber-600 border-amber-200",
          icon: XCircle,
          needsReconnect: false,
        };
      case 'revoked':
        return { 
          label: "Revogada", 
          color: "bg-red-500/10 text-red-600 border-red-200",
          icon: XCircle,
          needsReconnect: true,
        };
      case 'disconnected':
      default:
        return { 
          label: "Desconectada", 
          color: "bg-gray-500/10 text-gray-600 border-gray-200",
          icon: XCircle,
          needsReconnect: true,
        };
    }
  };

  const formatLastOk = (lastOkAt: string | null) => {
    if (!lastOkAt) return null;
    const date = new Date(lastOkAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'há menos de 1h';
    if (diffHours < 24) return `há ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `há ${diffDays}d`;
  };

  const renderAccountCard = (account: MarketplaceAccount, showLinkOption = false) => {
    const status = getAccountStatus(account);
    const StatusIcon = status.icon;
    const lastOk = formatLastOk(account.last_api_ok_at);
    
    return (
      <div
        key={account.id}
        className="flex items-center justify-between p-3 border rounded-lg bg-background"
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Store className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h5 className="font-medium text-sm">
              {account.nickname || account.email || `Seller ${account.ml_user_id}`}
            </h5>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>ID: {account.ml_user_id}</span>
            {lastOk && status.label === 'Conectada' && (
                <span className="text-success">• Última sync {lastOk}</span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end gap-1">
            <Badge variant="outline" className={status.color}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {status.label}
            </Badge>
            {account.id === activeAccountId && (
              <Badge variant="secondary" className="text-xs">
                Conta Ativa
              </Badge>
            )}
          </div>
          
          <div className="flex gap-1">
            {showLinkOption && companies.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                title="Vincular a empresa"
                onClick={() => {
                  setAccountToLink(account);
                  setShowLinkDialog(true);
                }}
              >
                <Link2 className="h-4 w-4 mr-1" />
                Vincular empresa
              </Button>
            )}
            {showLinkOption && companies.length === 0 && (
              <Button
                size="sm"
                variant="default"
                title="Criar empresa e vincular"
                onClick={() => {
                  setShowNewCompanyDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Criar empresa
              </Button>
            )}
            
            {status.needsReconnect && (
              <Button
                size="sm"
                variant="default"
                onClick={() => handleConnectAccount(account.company_id)}
                disabled={saving}
              >
                {saving && connectingForCompany === account.company_id ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Reconectar
              </Button>
            )}
            
            {account.id !== activeAccountId && !status.needsReconnect && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSetActiveAccount(account.id)}
              >
                Definir ativa
              </Button>
            )}
            
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => {
                setAccountToDisconnect(account);
                setShowDisconnectDialog(true);
              }}
            >
              <Unplug className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderErpSection = (companyId: string) => {
    const config = erpConfigs[companyId] || { company_id: companyId, erp_provider: 'none', erp_api_token: null };
    const isOpen = erpOpenStates[companyId] || false;
    const showToken = showTokenStates[companyId] || false;

    return (
      <Collapsible
        open={isOpen}
        onOpenChange={(open) => setErpOpenStates(prev => ({ ...prev, [companyId]: open }))}
        className="mt-3 border-t pt-3"
      >
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full">
          <Package className="h-4 w-4" />
          <span>Integração ERP</span>
          {config.erp_provider !== 'none' && (
            <Badge variant="secondary" className="text-xs ml-2">
              {config.erp_provider === 'olist' ? 'Olist' : 'Bling'}
            </Badge>
          )}
          <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-3">
          <div className="space-y-2">
            <Label>Sistema ERP</Label>
            <Select
              value={config.erp_provider}
              onValueChange={(v) => handleErpChange(companyId, v as 'none' | 'olist' | 'bling')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o ERP" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                <SelectItem value="olist">Olist</SelectItem>
                <SelectItem value="bling">Bling</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {config.erp_provider !== 'none' && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                API Token do {config.erp_provider === 'olist' ? 'Olist' : 'Bling'}
              </Label>
              <div className="relative">
                <Input
                  type={showToken ? "text" : "password"}
                  value={config.erp_api_token || ''}
                  onChange={(e) => handleErpTokenChange(companyId, e.target.value)}
                  placeholder="Cole seu API Token aqui"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowTokenStates(prev => ({ ...prev, [companyId]: !showToken }))}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          <Button
            size="sm"
            onClick={() => handleSaveErpConfig(companyId)}
            disabled={savingErpId === companyId}
          >
            {savingErpId === companyId && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar Integração
          </Button>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Empresas e Contas</h3>
          <p className="text-sm text-muted-foreground">
            Organize suas contas do Mercado Livre por empresa (1 conta ML por empresa)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Dialog open={showNewCompanyDialog} onOpenChange={setShowNewCompanyDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Empresa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Nova Empresa</DialogTitle>
                <DialogDescription>
                  Crie uma nova empresa para organizar suas contas do Mercado Livre
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {billingData && (billingData.nomeFantasia || billingData.razaoSocial) && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={handleUseBillingData}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Usar dados de faturamento
                  </Button>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="company-name">Nome interno da empresa</Label>
                  <Input
                    id="company-name"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="Ex: Minha Loja ES"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <RadioGroup
                    value={newCompanyType}
                    onValueChange={(v) => setNewCompanyType(v as "PF" | "PJ")}
                    className="flex gap-6"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="PF" id="new-pf" />
                      <Label htmlFor="new-pf" className="flex items-center gap-2 cursor-pointer">
                        <User className="h-4 w-4" />
                        Pessoa Física
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="PJ" id="new-pj" />
                      <Label htmlFor="new-pj" className="flex items-center gap-2 cursor-pointer">
                        <Building className="h-4 w-4" />
                        Pessoa Jurídica
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNewCompanyDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateCompany} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar Empresa
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Companies Accordion */}
      {companies.length > 0 ? (
        <Accordion type="multiple" defaultValue={companies.map(c => c.id)} className="space-y-3">
          {companies.map((company) => {
            const companyAccounts = accountsByCompany[company.id] || [];
            const hasAccount = companyAccounts.length > 0;
            
            return (
              <AccordionItem
                key={company.id}
                value={company.id}
                className="border rounded-lg px-4 bg-card group"
              >
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex items-center gap-3 text-left flex-1">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    {editingCompanyId === company.id ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Input
                          value={editingCompanyName}
                          onChange={(e) => setEditingCompanyName(e.target.value)}
                          className="h-8 w-48 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameCompany(company.id);
                            if (e.key === 'Escape') setEditingCompanyId(null);
                          }}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleRenameCompany(company.id)}
                          disabled={saving}
                        >
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-green-600" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setEditingCompanyId(null)}
                        >
                          <X className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div>
                          <h4 className="font-semibold text-foreground">{company.display_name}</h4>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{company.billing_type === "PF" ? "Pessoa Física" : "Pessoa Jurídica"}</span>
                            <span>•</span>
                            <span>{hasAccount ? '1 conta ML' : 'Sem conta ML'}</span>
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCompanyId(company.id);
                            setEditingCompanyName(company.display_name);
                          }}
                          title="Renomear empresa"
                        >
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <div className="space-y-3 pl-2 border-l-2 border-muted ml-5">
                    {/* Logo Section */}
                    <div className="pl-4">
                      <CompanyLogoSection
                        companyId={company.id}
                        logoUrl={company.logo_url}
                        onLogoChange={fetchData}
                      />
                    </div>

                    {/* ML Accounts under this company */}
                    {hasAccount ? (
                      <div className="space-y-2 pl-4">
                        {companyAccounts.map(account => renderAccountCard(account))}
                      </div>
                    ) : (
                      <div className="pl-4 py-2">
                        <p className="text-sm text-muted-foreground mb-3">
                          Nenhuma conta vinculada a esta empresa
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleConnectAccount(company.id)}
                          disabled={saving}
                        >
                          {saving && connectingForCompany === company.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Plus className="h-4 w-4 mr-2" />
                          )}
                          Conectar conta ML a esta empresa
                        </Button>
                      </div>
                    )}
                    
                    {/* ERP Integration Section */}
                    <div className="pl-4">
                      {renderErpSection(company.id)}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      ) : (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="text-center py-4">
              <Building2 className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground mt-2">
                Crie empresas para organizar suas contas do Mercado Livre
              </p>
              <Button 
                className="mt-4" 
                onClick={() => setShowNewCompanyDialog(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar primeira empresa
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unlinked Accounts Section */}
      {unlinkedAccounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Store className="h-5 w-5" />
              Contas sem empresa
              <Badge variant="secondary" className="ml-2">{unlinkedAccounts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {unlinkedAccounts.map(account => renderAccountCard(account, true))}
            
            {companies.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Crie uma empresa para vincular essas contas
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Connect account if no accounts exist */}
      {accounts.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8 border rounded-lg border-dashed">
              <Store className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <h4 className="mt-4 font-medium text-foreground">Nenhuma conta conectada</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Conecte sua conta do Mercado Livre para começar
              </p>
              <Button className="mt-4" onClick={() => handleConnectAccount(null)} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Conectar Conta ML
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Link Account to Company Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular conta a empresa</DialogTitle>
            <DialogDescription>
              Selecione a empresa para vincular a conta{" "}
              <strong>{accountToLink?.nickname || accountToLink?.ml_user_id}</strong>
              <br />
              <span className="text-xs text-amber-600">Limite: 1 conta ML por empresa</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="company-select">Empresa</Label>
            <Select
              value={selectedCompanyForLink}
              onValueChange={setSelectedCompanyForLink}
            >
              <SelectTrigger id="company-select" className="mt-2">
                <SelectValue placeholder="Selecione uma empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies
                  .filter(company => {
                    // Only show companies without an account
                    const existingAccounts = accounts.filter(a => a.company_id === company.id);
                    return existingAccounts.length === 0;
                  })
                  .map(company => (
                  <SelectItem key={company.id} value={company.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      {company.display_name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {companies.filter(c => !accounts.some(a => a.company_id === c.id)).length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Todas as empresas já possuem uma conta vinculada. Crie uma nova empresa.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleLinkAccountToCompany} 
              disabled={saving || !selectedCompanyForLink}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect Confirmation Dialog */}
      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja desconectar a conta{" "}
              <strong>{accountToDisconnect?.nickname || accountToDisconnect?.ml_user_id}</strong>?
              <br /><br />
              Os tokens serão removidos e você precisará reconectar para usar esta conta novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnectAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={disconnectingId !== null}
            >
              {disconnectingId ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Unplug className="h-4 w-4 mr-2" />
              )}
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SettingsCompanies;
