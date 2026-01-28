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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";

interface MarketplaceAccount {
  id: string;
  ml_user_id: string;
  nickname: string | null;
  email: string | null;
  is_active: boolean;
  token_expires_at: string | null;
  updated_at: string;
}

interface Company {
  id: string;
  display_name: string;
  billing_type: "pf" | "pj";
  is_active: boolean;
  created_at: string;
}

const SettingsCompanies = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [accounts, setAccounts] = useState<MarketplaceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [showNewCompanyDialog, setShowNewCompanyDialog] = useState(false);
  const [showCompanySheet, setShowCompanySheet] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyType, setNewCompanyType] = useState<"pf" | "pj">("pj");
  const [saving, setSaving] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [accountToDisconnect, setAccountToDisconnect] = useState<MarketplaceAccount | null>(null);
  
  const { setActiveAccount, refreshAccounts: refreshActiveAccountContext } = useActiveAccount();

  // Fetch companies and accounts from backend
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

      // Fetch ML accounts (source of truth)
      const { data: accountsData, error: accountsError } = await supabase
        .from("ml_accounts")
        .select("id, ml_user_id, nickname, email, is_active, token_expires_at, updated_at")
        .eq("user_id", user.id)
        .order("is_active", { ascending: false });

      if (accountsError) throw accountsError;

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
      setNewCompanyType("pj");
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

  const handleConnectAccount = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      // Call ml-auth-url to get OAuth URL
      const { data, error } = await supabase.functions.invoke("ml-auth-url", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { 
          frontendOrigin: window.location.origin,
          companyId: selectedCompany?.id || null,
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
    }
  };

  const handleDisconnectAccount = async () => {
    if (!accountToDisconnect) return;

    setDisconnectingId(accountToDisconnect.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // Clear tokens and mark as disconnected
      const { error } = await supabase
        .from("ml_accounts")
        .update({
          access_token: null,
          refresh_token: null,
          token_expires_at: null,
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountToDisconnect.id)
        .eq("user_id", user.id);

      if (error) throw error;

      toast.success("Conta desconectada com sucesso");
      setShowDisconnectDialog(false);
      setAccountToDisconnect(null);
      
      // Refresh data
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

  const isTokenExpired = (expiresAt: string | null) => {
    if (!expiresAt) return true;
    return new Date(expiresAt) < new Date();
  };

  const getAccountStatus = (account: MarketplaceAccount) => {
    if (isTokenExpired(account.token_expires_at)) {
      return { label: "Expirada", color: "bg-amber-500/10 text-amber-600 border-amber-200" };
    }
    return { label: "Conectada", color: "bg-green-500/10 text-green-600 border-green-200" };
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
            Gerencie suas empresas e contas do Mercado Livre
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
                  Crie uma nova empresa para organizar suas contas
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
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
                    onValueChange={(v) => setNewCompanyType(v as "pf" | "pj")}
                    className="flex gap-6"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="pf" id="new-pf" />
                      <Label htmlFor="new-pf" className="flex items-center gap-2 cursor-pointer">
                        <User className="h-4 w-4" />
                        Pessoa Física
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="pj" id="new-pj" />
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

      {/* ML Accounts Section (Primary) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Store className="h-5 w-5" />
            Contas do Mercado Livre
          </CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="text-center py-8 border rounded-lg border-dashed">
              <Store className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <h4 className="mt-4 font-medium text-foreground">Nenhuma conta conectada</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Conecte sua conta do Mercado Livre para começar
              </p>
              <Button className="mt-4" onClick={handleConnectAccount} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Conectar Conta ML
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => {
                const status = getAccountStatus(account);
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                        <Store className="h-5 w-5 text-yellow-600" />
                      </div>
                      <div>
                        <h5 className="font-medium text-sm">
                          {account.nickname || account.email || `Seller ${account.ml_user_id}`}
                        </h5>
                        <p className="text-xs text-muted-foreground">
                          ID: {account.ml_user_id}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline" className={status.color}>
                          {isTokenExpired(account.token_expires_at) ? (
                            <XCircle className="h-3 w-3 mr-1" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          )}
                          {status.label}
                        </Badge>
                        {account.is_active && (
                          <Badge variant="secondary" className="text-xs">
                            Conta Ativa
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex gap-2">
                        {!account.is_active && (
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
              })}
              
              <Button
                variant="outline"
                className="w-full"
                onClick={handleConnectAccount}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Conectar outra conta
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Companies List */}
      {companies.length > 0 && (
        <div className="grid gap-4">
          <h4 className="text-sm font-medium text-muted-foreground">Empresas cadastradas</h4>
          {companies.map((company) => (
            <Card
              key={company.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => {
                setSelectedCompany(company);
                setShowCompanySheet(true);
              }}
            >
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">{company.display_name}</h4>
                      <Badge variant="outline" className="text-xs mt-1">
                        {company.billing_type === "pf" ? "Pessoa Física" : "Pessoa Jurídica"}
                      </Badge>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      company.is_active
                        ? "bg-green-500/10 text-green-600 border-green-200"
                        : "bg-gray-500/10 text-gray-600 border-gray-200"
                    }
                  >
                    {company.is_active ? "Ativa" : "Inativa"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state for companies */}
      {companies.length === 0 && accounts.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="text-center py-4">
              <Building2 className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground mt-2">
                Você pode criar empresas para organizar suas contas (opcional)
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Company Detail Sheet */}
      <Sheet open={showCompanySheet} onOpenChange={setShowCompanySheet}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedCompany && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {selectedCompany.display_name}
                </SheetTitle>
                <SheetDescription>
                  Detalhes da empresa
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 mt-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Dados da Empresa</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Nome</span>
                      <span className="font-medium">{selectedCompany.display_name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tipo</span>
                      <span className="font-medium">
                        {selectedCompany.billing_type === "pf" ? "Pessoa Física" : "Pessoa Jurídica"}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge
                        variant="outline"
                        className={
                          selectedCompany.is_active
                            ? "bg-green-500/10 text-green-600 border-green-200"
                            : "bg-gray-500/10 text-gray-600 border-gray-200"
                        }
                      >
                        {selectedCompany.is_active ? "Ativa" : "Inativa"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

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
