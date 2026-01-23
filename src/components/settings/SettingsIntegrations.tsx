import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plug,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Settings2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

interface IntegrationScope {
  importCosts: boolean;
  importOrders: boolean;
  exportBilling: boolean;
}

interface Integration {
  id: string;
  name: string;
  type: "olist" | "bling";
  logo: string;
  status: "valid" | "invalid" | "pending";
  apiKey: string;
  lastSync: string | null;
  scope: IntegrationScope;
}

const SettingsIntegrations = () => {
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: "1",
      name: "Olist",
      type: "olist",
      logo: "🟠",
      status: "pending",
      apiKey: "",
      lastSync: null,
      scope: {
        importCosts: true,
        importOrders: true,
        exportBilling: false,
      },
    },
    {
      id: "2",
      name: "Bling",
      type: "bling",
      logo: "🔵",
      status: "pending",
      apiKey: "",
      lastSync: null,
      scope: {
        importCosts: true,
        importOrders: false,
        exportBilling: true,
      },
    },
  ]);

  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleTestConnection = async (integrationId: string) => {
    setTesting(integrationId);
    try {
      await new Promise((r) => setTimeout(r, 2000));
      const integration = integrations.find((i) => i.id === integrationId);
      if (integration?.apiKey) {
        setIntegrations((prev) =>
          prev.map((i) =>
            i.id === integrationId
              ? { ...i, status: "valid", lastSync: new Date().toISOString() }
              : i
          )
        );
        toast.success("Conexão validada com sucesso!");
      } else {
        setIntegrations((prev) =>
          prev.map((i) => (i.id === integrationId ? { ...i, status: "invalid" } : i))
        );
        toast.error("Token/API Key não configurado");
      }
    } catch {
      toast.error("Erro ao testar conexão");
    } finally {
      setTesting(null);
    }
  };

  const handleSaveIntegration = async () => {
    if (!selectedIntegration) return;

    setSaving(true);
    try {
      await new Promise((r) => setTimeout(r, 1000));
      setIntegrations((prev) =>
        prev.map((i) => (i.id === selectedIntegration.id ? selectedIntegration : i))
      );
      setShowConfigDialog(false);
      toast.success("Integração salva com sucesso!");
    } catch {
      toast.error("Erro ao salvar integração");
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: Integration["status"]) => {
    switch (status) {
      case "valid":
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Válido
          </Badge>
        );
      case "invalid":
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-200">
            <XCircle className="h-3 w-3 mr-1" />
            Inválido
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            Pendente
          </Badge>
        );
    }
  };

  const formatLastSync = (date: string | null) => {
    if (!date) return "Nunca sincronizado";
    const d = new Date(date);
    return `Última sync: ${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium">Integrações</h3>
        <p className="text-sm text-muted-foreground">
          Conecte seus ERPs para sincronizar custos, pedidos e faturamento
        </p>
      </div>

      {/* Alert */}
      <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Integrações vinculadas à empresa ativa
              </p>
              <p className="text-amber-700 dark:text-amber-300 mt-1">
                As configurações de integração são aplicadas à empresa selecionada no topo do
                sistema. Certifique-se de selecionar a empresa correta antes de configurar.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrations Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {integrations.map((integration) => (
          <Card key={integration.id} className="relative overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center text-2xl">
                    {integration.logo}
                  </div>
                  <div>
                    <CardTitle className="text-base">{integration.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {integration.type === "olist" ? "ERP Olist" : "ERP Bling"}
                    </CardDescription>
                  </div>
                </div>
                {getStatusBadge(integration.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status Info */}
              <div className="text-xs text-muted-foreground">
                {formatLastSync(integration.lastSync)}
              </div>

              {/* Scope Tags */}
              <div className="flex flex-wrap gap-1">
                {integration.scope.importCosts && (
                  <Badge variant="secondary" className="text-xs">
                    Custos
                  </Badge>
                )}
                {integration.scope.importOrders && (
                  <Badge variant="secondary" className="text-xs">
                    Pedidos
                  </Badge>
                )}
                {integration.scope.exportBilling && (
                  <Badge variant="secondary" className="text-xs">
                    Faturamento
                  </Badge>
                )}
              </div>

              <Separator />

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setSelectedIntegration(integration);
                    setShowConfigDialog(true);
                  }}
                >
                  <Settings2 className="h-4 w-4 mr-1" />
                  Configurar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestConnection(integration.id)}
                  disabled={testing === integration.id}
                >
                  {testing === integration.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Configuration Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="sm:max-w-md">
          {selectedIntegration && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="text-2xl">{selectedIntegration.logo}</span>
                  Configurar {selectedIntegration.name}
                </DialogTitle>
                <DialogDescription>
                  Configure o token de acesso e as permissões de sincronização
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* API Key */}
                <div className="space-y-2">
                  <Label htmlFor="api-key">Token / API Key</Label>
                  <Input
                    id="api-key"
                    type="password"
                    value={selectedIntegration.apiKey}
                    onChange={(e) =>
                      setSelectedIntegration((prev) =>
                        prev ? { ...prev, apiKey: e.target.value } : null
                      )
                    }
                    placeholder="Cole seu token aqui..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Encontre seu token nas configurações do {selectedIntegration.name}
                  </p>
                </div>

                <Separator />

                {/* Scope */}
                <div className="space-y-4">
                  <Label>Escopo da integração</Label>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="scope-costs"
                        checked={selectedIntegration.scope.importCosts}
                        onCheckedChange={(checked) =>
                          setSelectedIntegration((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  scope: { ...prev.scope, importCosts: !!checked },
                                }
                              : null
                          )
                        }
                      />
                      <div>
                        <Label htmlFor="scope-costs" className="cursor-pointer">
                          Importar custos de produtos
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Sincroniza custos do ERP com o sistema
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="scope-orders"
                        checked={selectedIntegration.scope.importOrders}
                        onCheckedChange={(checked) =>
                          setSelectedIntegration((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  scope: { ...prev.scope, importOrders: !!checked },
                                }
                              : null
                          )
                        }
                      />
                      <div>
                        <Label htmlFor="scope-orders" className="cursor-pointer">
                          Importar pedidos
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Traz pedidos do ERP para análise
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="scope-billing"
                        checked={selectedIntegration.scope.exportBilling}
                        onCheckedChange={(checked) =>
                          setSelectedIntegration((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  scope: { ...prev.scope, exportBilling: !!checked },
                                }
                              : null
                          )
                        }
                      />
                      <div>
                        <Label htmlFor="scope-billing" className="cursor-pointer">
                          Enviar dados para faturamento
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Exporta dados de vendas para emissão de NF
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleTestConnection(selectedIntegration.id)}
                  disabled={testing === selectedIntegration.id}
                >
                  {testing === selectedIntegration.id ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Testar Conexão
                </Button>
                <Button onClick={handleSaveIntegration} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsIntegrations;
