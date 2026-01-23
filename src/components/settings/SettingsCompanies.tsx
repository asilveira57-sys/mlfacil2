import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  Plus,
  Store,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
  User,
  Building,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

interface MarketplaceAccount {
  id: string;
  name: string;
  marketplace: string;
  status: "connected" | "disconnected" | "error";
  isActive: boolean;
  sellerId?: string;
}

interface Company {
  id: string;
  name: string;
  type: "pf" | "pj";
  accounts: MarketplaceAccount[];
  status: "active" | "inactive";
}

const SettingsCompanies = () => {
  const [companies, setCompanies] = useState<Company[]>([
    {
      id: "1",
      name: "Minha Loja Principal",
      type: "pj",
      status: "active",
      accounts: [
        {
          id: "a1",
          name: "Loja ML Principal",
          marketplace: "Mercado Livre",
          status: "connected",
          isActive: true,
          sellerId: "123456789",
        },
        {
          id: "a2",
          name: "Loja ML Secundária",
          marketplace: "Mercado Livre",
          status: "connected",
          isActive: false,
          sellerId: "987654321",
        },
      ],
    },
  ]);

  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [showNewCompanyDialog, setShowNewCompanyDialog] = useState(false);
  const [showCompanySheet, setShowCompanySheet] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyType, setNewCompanyType] = useState<"pf" | "pj">("pj");
  const [saving, setSaving] = useState(false);

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) {
      toast.error("Nome da empresa é obrigatório");
      return;
    }

    setSaving(true);
    try {
      await new Promise((r) => setTimeout(r, 1000));
      const newCompany: Company = {
        id: Date.now().toString(),
        name: newCompanyName,
        type: newCompanyType,
        status: "active",
        accounts: [],
      };
      setCompanies((prev) => [...prev, newCompany]);
      setNewCompanyName("");
      setNewCompanyType("pj");
      setShowNewCompanyDialog(false);
      toast.success("Empresa criada com sucesso!");
    } catch {
      toast.error("Erro ao criar empresa");
    } finally {
      setSaving(false);
    }
  };

  const handleSelectActiveAccount = (companyId: string, accountId: string) => {
    setCompanies((prev) =>
      prev.map((company) => {
        if (company.id !== companyId) return company;
        return {
          ...company,
          accounts: company.accounts.map((account) => ({
            ...account,
            isActive: account.id === accountId,
          })),
        };
      })
    );
    toast.success("Conta ativa atualizada!");
  };

  const handleConnectAccount = async () => {
    if (!selectedCompany) return;

    setSaving(true);
    try {
      // TODO: Integrate with ML OAuth
      await new Promise((r) => setTimeout(r, 1500));
      toast.success("Redirecionando para autenticação...");
    } catch {
      toast.error("Erro ao conectar conta");
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: MarketplaceAccount["status"]) => {
    switch (status) {
      case "connected":
        return "bg-green-500/10 text-green-600 border-green-200";
      case "disconnected":
        return "bg-gray-500/10 text-gray-600 border-gray-200";
      case "error":
        return "bg-red-500/10 text-red-600 border-red-200";
    }
  };

  const getStatusIcon = (status: MarketplaceAccount["status"]) => {
    switch (status) {
      case "connected":
        return <CheckCircle2 className="h-3 w-3" />;
      case "disconnected":
      case "error":
        return <XCircle className="h-3 w-3" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Empresas e Contas</h3>
          <p className="text-sm text-muted-foreground">
            Gerencie suas empresas e contas de marketplace
          </p>
        </div>
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
                Crie uma nova empresa para vincular contas de marketplace
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

      {/* Companies List */}
      <div className="grid gap-4">
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
                    <h4 className="font-semibold text-foreground">{company.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {company.type === "pf" ? "Pessoa Física" : "Pessoa Jurídica"}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {company.accounts.length} conta(s) conectada(s)
                      </span>
                    </div>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    company.status === "active"
                      ? "bg-green-500/10 text-green-600 border-green-200"
                      : "bg-gray-500/10 text-gray-600 border-gray-200"
                  }
                >
                  {company.status === "active" ? "Ativa" : "Inativa"}
                </Badge>
              </div>

              {/* Quick preview of accounts */}
              {company.accounts.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex flex-wrap gap-2">
                    {company.accounts.slice(0, 3).map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm"
                      >
                        <Store className="h-3 w-3" />
                        <span>{account.name}</span>
                        {account.isActive && (
                          <Badge variant="secondary" className="text-xs">
                            Ativa
                          </Badge>
                        )}
                      </div>
                    ))}
                    {company.accounts.length > 3 && (
                      <span className="text-sm text-muted-foreground self-center">
                        +{company.accounts.length - 3} mais
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {companies.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50" />
                <h4 className="mt-4 font-medium text-foreground">Nenhuma empresa cadastrada</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Crie sua primeira empresa para começar a conectar contas de marketplace
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setShowNewCompanyDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Empresa
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Company Detail Sheet */}
      <Sheet open={showCompanySheet} onOpenChange={setShowCompanySheet}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedCompany && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {selectedCompany.name}
                </SheetTitle>
                <SheetDescription>
                  Gerencie os dados e contas desta empresa
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 mt-6">
                {/* Company Info */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Dados da Empresa</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Nome interno</span>
                      <span className="font-medium">{selectedCompany.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tipo</span>
                      <span className="font-medium">
                        {selectedCompany.type === "pf" ? "Pessoa Física" : "Pessoa Jurídica"}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge
                        variant="outline"
                        className={
                          selectedCompany.status === "active"
                            ? "bg-green-500/10 text-green-600 border-green-200"
                            : "bg-gray-500/10 text-gray-600 border-gray-200"
                        }
                      >
                        {selectedCompany.status === "active" ? "Ativa" : "Inativa"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Marketplace Accounts */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium">Contas de Marketplace</h4>
                    <Button size="sm" onClick={handleConnectAccount} disabled={saving}>
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-1" />
                          Conectar
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {selectedCompany.accounts.map((account) => (
                      <Card key={account.id}>
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                                <Store className="h-5 w-5 text-yellow-600" />
                              </div>
                              <div>
                                <h5 className="font-medium text-sm">{account.name}</h5>
                                <p className="text-xs text-muted-foreground">
                                  {account.marketplace}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <Badge variant="outline" className={getStatusColor(account.status)}>
                                {getStatusIcon(account.status)}
                                <span className="ml-1">
                                  {account.status === "connected" ? "Conectada" : "Desconectada"}
                                </span>
                              </Badge>
                              {account.isActive && (
                                <Badge variant="secondary" className="text-xs">
                                  Conta Ativa
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-4 pt-3 border-t">
                            <span className="text-xs text-muted-foreground">
                              Seller ID: {account.sellerId}
                            </span>
                            {!account.isActive && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectActiveAccount(selectedCompany.id, account.id);
                                }}
                              >
                                Definir como ativa
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}

                    {selectedCompany.accounts.length === 0 && (
                      <div className="text-center py-8 border rounded-lg border-dashed">
                        <Store className="h-8 w-8 mx-auto text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground mt-2">
                          Nenhuma conta conectada
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default SettingsCompanies;
