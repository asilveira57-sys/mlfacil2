import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Check, X, RefreshCw, Plug, Settings2, MapPin, FileText, AlertCircle } from 'lucide-react';
import { useErpIntegrations, useErpIntegrationMutations, useNfseSettings, useNfseSettingsMutation, useNfseFieldMappings, useNfseFieldMappingsMutation, useIntegrationSyncRuns, useTriggerSync } from '@/hooks/useErpIntegrations';
import { TOMADOR_FIELDS, DEFAULT_TINY_MAPPINGS, DEFAULT_OLIST_MAPPINGS, type ErpProvider } from '@/types/erp-integration';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Temporary company ID - in production, get from context
const DEMO_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

export function AdminErpIntegrations() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Integrações ERP</h2>
        <p className="text-muted-foreground">
          Configure conexões com Tiny e Olist para captura de pedidos e NFS-e
        </p>
      </div>

      <Tabs defaultValue="credentials" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="credentials" className="flex items-center gap-2">
            <Plug className="h-4 w-4" />
            Credenciais
          </TabsTrigger>
          <TabsTrigger value="capture" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Captura
          </TabsTrigger>
          <TabsTrigger value="mapping" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Mapeamento
          </TabsTrigger>
          <TabsTrigger value="nfse" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            NFS-e
          </TabsTrigger>
        </TabsList>

        <TabsContent value="credentials">
          <CredentialsTab companyId={DEMO_COMPANY_ID} />
        </TabsContent>

        <TabsContent value="capture">
          <CaptureRulesTab companyId={DEMO_COMPANY_ID} />
        </TabsContent>

        <TabsContent value="mapping">
          <FieldMappingTab companyId={DEMO_COMPANY_ID} />
        </TabsContent>

        <TabsContent value="nfse">
          <NfseSettingsTab companyId={DEMO_COMPANY_ID} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ========== Tab A: Credentials ==========

function CredentialsTab({ companyId }: { companyId: string }) {
  const { data: integrations, isLoading } = useErpIntegrations(companyId);
  const { upsertIntegration, testConnection } = useErpIntegrationMutations();

  const tinyIntegration = integrations?.find(i => i.provider === 'tiny');
  const olistIntegration = integrations?.find(i => i.provider === 'olist');

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <IntegrationCard
        provider="tiny"
        integration={tinyIntegration}
        companyId={companyId}
        onSave={upsertIntegration.mutateAsync}
        onTest={testConnection.mutateAsync}
        isSaving={upsertIntegration.isPending}
        isTesting={testConnection.isPending}
      />
      <IntegrationCard
        provider="olist"
        integration={olistIntegration}
        companyId={companyId}
        onSave={upsertIntegration.mutateAsync}
        onTest={testConnection.mutateAsync}
        isSaving={upsertIntegration.isPending}
        isTesting={testConnection.isPending}
      />
    </div>
  );
}

interface IntegrationCardProps {
  provider: ErpProvider;
  integration: any;
  companyId: string;
  onSave: (data: any) => Promise<any>;
  onTest: (data: any) => Promise<any>;
  isSaving: boolean;
  isTesting: boolean;
}

function IntegrationCard({ provider, integration, companyId, onSave, onTest, isSaving, isTesting }: IntegrationCardProps) {
  const [isActive, setIsActive] = useState(integration?.status === 'active');
  const [displayName, setDisplayName] = useState(integration?.display_name || '');
  const [apiKey, setApiKey] = useState(integration?.api_key || '');
  const [environment, setEnvironment] = useState(integration?.environment || 'production');

  const handleSave = async () => {
    await onSave({
      company_id: companyId,
      provider,
      display_name: displayName,
      api_key: apiKey,
      environment,
      status: isActive ? 'active' : 'inactive',
    });
  };

  const handleTest = async () => {
    if (integration?.id) {
      await onTest({ integrationId: integration.id, provider });
    }
  };

  const providerLabel = provider === 'tiny' ? 'Tiny ERP' : 'Olist';
  const lastTest = integration?.last_test_at ? format(new Date(integration.last_test_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {providerLabel}
            {integration?.status === 'active' && (
              <Badge variant="default" className="text-xs">Ativo</Badge>
            )}
          </CardTitle>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
        <CardDescription>
          Configure a conexão com {providerLabel}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Nome interno</Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={`Ex: ${providerLabel} Principal`}
          />
        </div>

        <div className="space-y-2">
          <Label>Token / Chave de API</Label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Cole sua chave de API"
          />
        </div>

        {provider === 'tiny' && (
          <div className="space-y-2">
            <Label>Ambiente</Label>
            <Select value={environment} onValueChange={setEnvironment}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="production">Produção</SelectItem>
                <SelectItem value="sandbox">Sandbox</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {lastTest && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            {integration?.last_test_status === 'success' ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <X className="h-4 w-4 text-red-500" />
            )}
            Último teste: {lastTest}
            {integration?.last_test_message && (
              <span className="text-xs">({integration.last_test_message})</span>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={isSaving} className="flex-1">
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={!integration?.id || isTesting}
          >
            {isTesting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ========== Tab B: Capture Rules ==========

function CaptureRulesTab({ companyId }: { companyId: string }) {
  const { data: integrations } = useErpIntegrations(companyId);
  const { upsertIntegration } = useErpIntegrationMutations();
  const triggerSync = useTriggerSync();

  const activeIntegration = integrations?.find(i => i.status === 'active');

  const [captureSource, setCaptureSource] = useState<string>(activeIntegration?.provider || 'both');
  const [orderStatuses, setOrderStatuses] = useState<string[]>(activeIntegration?.order_status_filter || ['confirmed']);
  const [syncFrequency, setSyncFrequency] = useState(activeIntegration?.sync_frequency_minutes || 30);
  const [captureFromDate, setCaptureFromDate] = useState(activeIntegration?.capture_from_date || '');

  const handleSave = async () => {
    if (!activeIntegration) return;

    await upsertIntegration.mutateAsync({
      ...activeIntegration,
      order_status_filter: orderStatuses,
      sync_frequency_minutes: syncFrequency,
      capture_from_date: captureFromDate || null,
    });
  };

  const handleSync = async () => {
    if (activeIntegration?.id) {
      await triggerSync.mutateAsync({ integrationId: activeIntegration.id });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regras de Captura de Pedidos</CardTitle>
        <CardDescription>
          Configure quais pedidos serão importados e com qual frequência
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Fonte de captura</Label>
            <Select value={captureSource} onValueChange={setCaptureSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tiny">Apenas Tiny</SelectItem>
                <SelectItem value="olist">Apenas Olist</SelectItem>
                <SelectItem value="both">Ambos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Frequência de sincronização</Label>
            <Select value={syncFrequency.toString()} onValueChange={(v) => setSyncFrequency(parseInt(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">A cada 15 minutos</SelectItem>
                <SelectItem value="30">A cada 30 minutos</SelectItem>
                <SelectItem value="60">A cada 1 hora</SelectItem>
                <SelectItem value="120">A cada 2 horas</SelectItem>
                <SelectItem value="360">A cada 6 horas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Status de pedido para importar</Label>
          <div className="flex flex-wrap gap-2">
            {['confirmed', 'invoiced', 'shipped', 'delivered'].map((status) => (
              <Button
                key={status}
                variant={orderStatuses.includes(status) ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (orderStatuses.includes(status)) {
                    setOrderStatuses(orderStatuses.filter(s => s !== status));
                  } else {
                    setOrderStatuses([...orderStatuses, status]);
                  }
                }}
              >
                {status === 'confirmed' && 'Confirmado'}
                {status === 'invoiced' && 'Faturado'}
                {status === 'shipped' && 'Enviado'}
                {status === 'delivered' && 'Entregue'}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Data inicial de captura (primeira carga)</Label>
          <Input
            type="date"
            value={captureFromDate}
            onChange={(e) => setCaptureFromDate(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Deixe em branco para importar apenas pedidos a partir de agora
          </p>
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={handleSave} disabled={upsertIntegration.isPending}>
            {upsertIntegration.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Configurações
          </Button>
          <Button variant="outline" onClick={handleSync} disabled={!activeIntegration || triggerSync.isPending}>
            {triggerSync.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Sincronizar Agora
          </Button>
        </div>

        {activeIntegration && (
          <SyncRunsHistory integrationId={activeIntegration.id} />
        )}
      </CardContent>
    </Card>
  );
}

function SyncRunsHistory({ integrationId }: { integrationId: string }) {
  const { data: runs, isLoading } = useIntegrationSyncRuns(integrationId);

  if (isLoading) return null;
  if (!runs || runs.length === 0) return null;

  return (
    <div className="mt-6">
      <h4 className="text-sm font-medium mb-3">Histórico de Sincronizações</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data/Hora</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Buscados</TableHead>
            <TableHead className="text-right">Criados</TableHead>
            <TableHead className="text-right">Erros</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.slice(0, 10).map((run) => (
            <TableRow key={run.id}>
              <TableCell className="text-sm">
                {format(new Date(run.started_at), "dd/MM HH:mm", { locale: ptBR })}
              </TableCell>
              <TableCell>
                <Badge variant={run.status === 'success' ? 'default' : run.status === 'failed' ? 'destructive' : 'secondary'}>
                  {run.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{run.orders_fetched}</TableCell>
              <TableCell className="text-right">{run.orders_created}</TableCell>
              <TableCell className="text-right">{run.orders_failed}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ========== Tab C: Field Mapping ==========

function FieldMappingTab({ companyId }: { companyId: string }) {
  const [activeProvider, setActiveProvider] = useState<ErpProvider>('tiny');
  const { data: mappings, isLoading } = useNfseFieldMappings(companyId, activeProvider);
  const saveMappings = useNfseFieldMappingsMutation();

  const defaults = activeProvider === 'tiny' ? DEFAULT_TINY_MAPPINGS : DEFAULT_OLIST_MAPPINGS;

  const [localMappings, setLocalMappings] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    TOMADOR_FIELDS.forEach(f => {
      const existing = mappings?.find(m => m.target_field === f.key);
      initial[f.key] = existing?.source_path || defaults[f.key] || '';
    });
    return initial;
  });

  const handleSave = async () => {
    const toSave = TOMADOR_FIELDS.map(f => ({
      company_id: companyId,
      provider: activeProvider,
      target_field: f.key,
      source_path: localMappings[f.key] || defaults[f.key],
    }));

    await saveMappings.mutateAsync(toSave);
  };

  const handleApplyDefaults = () => {
    const newMappings: Record<string, string> = {};
    TOMADOR_FIELDS.forEach(f => {
      newMappings[f.key] = defaults[f.key] || '';
    });
    setLocalMappings(newMappings);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Mapeamento de Dados do Tomador</CardTitle>
            <CardDescription>
              Configure de onde vêm os dados do cliente para a NFS-e
            </CardDescription>
          </div>
          <Select value={activeProvider} onValueChange={(v) => setActiveProvider(v as ErpProvider)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tiny">Tiny</SelectItem>
              <SelectItem value="olist">Olist</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          {TOMADOR_FIELDS.map((field) => (
            <div key={field.key} className="grid grid-cols-3 gap-4 items-center">
              <Label className="flex items-center gap-1">
                {field.label}
                {field.required && <span className="text-destructive">*</span>}
              </Label>
              <Input
                className="col-span-2"
                value={localMappings[field.key] || ''}
                onChange={(e) => setLocalMappings({ ...localMappings, [field.key]: e.target.value })}
                placeholder={defaults[field.key]}
              />
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={handleSave} disabled={saveMappings.isPending}>
            {saveMappings.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Mapeamentos
          </Button>
          <Button variant="outline" onClick={handleApplyDefaults}>
            Aplicar Padrões
          </Button>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div>
              <p className="font-medium">Dica:</p>
              <p className="text-muted-foreground">
                Use notação de ponto para acessar campos aninhados. Ex: <code>cliente.endereco.rua</code>
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ========== Tab D: NFS-e Settings ==========

function NfseSettingsTab({ companyId }: { companyId: string }) {
  const { data: settings, isLoading } = useNfseSettings(companyId);
  const saveSettings = useNfseSettingsMutation();

  const [form, setForm] = useState({
    service_description: settings?.service_description || '',
    service_code: settings?.service_code || '',
    cnae: settings?.cnae || '',
    aliquota_iss: settings?.aliquota_iss?.toString() || '',
    natureza_operacao: settings?.natureza_operacao || '',
    observacoes: settings?.observacoes || '',
  });

  const handleSave = async () => {
    await saveSettings.mutateAsync({
      company_id: companyId,
      ...form,
      aliquota_iss: form.aliquota_iss ? parseFloat(form.aliquota_iss) : null,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurações de NFS-e</CardTitle>
        <CardDescription>
          Defina os dados padrão para emissão de notas fiscais de serviço
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Descrição padrão do serviço</Label>
          <Textarea
            value={form.service_description}
            onChange={(e) => setForm({ ...form, service_description: e.target.value })}
            placeholder="Ex: Serviços de intermediação de marketplace..."
            rows={3}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Código do serviço</Label>
            <Input
              value={form.service_code}
              onChange={(e) => setForm({ ...form, service_code: e.target.value })}
              placeholder="Ex: 10.02"
            />
          </div>

          <div className="space-y-2">
            <Label>CNAE</Label>
            <Input
              value={form.cnae}
              onChange={(e) => setForm({ ...form, cnae: e.target.value })}
              placeholder="Ex: 7490-1/04"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Alíquota ISS (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.aliquota_iss}
              onChange={(e) => setForm({ ...form, aliquota_iss: e.target.value })}
              placeholder="Ex: 5.00"
            />
          </div>

          <div className="space-y-2">
            <Label>Natureza da operação</Label>
            <Input
              value={form.natureza_operacao}
              onChange={(e) => setForm({ ...form, natureza_operacao: e.target.value })}
              placeholder="Ex: Tributação no município"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Observações para a nota</Label>
          <Textarea
            value={form.observacoes}
            onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            placeholder="Texto adicional que aparecerá na nota..."
            rows={2}
          />
        </div>

        <div className="pt-4 border-t">
          <Button onClick={handleSave} disabled={saveSettings.isPending}>
            {saveSettings.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Configurações
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
