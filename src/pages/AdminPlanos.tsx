import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBillingAdmin } from "@/hooks/useBillingAdmin";
import { formatPriceBRL, getPeriodLabel, getModeLabel } from "@/hooks/useBillingPlans";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Save, Eye, EyeOff, Check, X, RefreshCw, Plus, Trash2, Link, Zap, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { PriceMode, PricePeriod, AdminPlanPrice } from "@/types/billing";

interface MPSyncMatch {
  tenant_plan_id: string;
  tenant_plan_code: string;
  tenant_plan_name: string;
  mp_plan_id: string;
  mp_plan_reason: string;
  mp_plan_status: string;
  mp_amount: number;
  mp_currency: string;
  already_linked: boolean;
}

interface MPSyncResult {
  mp_plans_found: number;
  matches: MPSyncMatch[];
  unmatched_mp: Array<{ mp_plan_id: string; mp_plan_reason: string; mp_plan_status: string; mp_amount: number }>;
  applied: number;
  tenant_plans: Array<{ id: string; code: string; name: string; current_mp_id: string | null; is_enterprise: boolean }>;
}

export default function AdminPlanos() {
  const navigate = useNavigate();
  const { 
    plans, 
    settings, 
    loading, 
    refetch,
    createPlan,
    updatePlan,
    deletePlan,
    createPrice,
    updatePrice,
    deletePrice,
    updateSettings,
    syncPriceWithMP,
  } = useBillingAdmin();

  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState<string>("");
  const [editingBadge, setEditingBadge] = useState<string>("");
  
  // Dialog states
  const [newPriceDialogOpen, setNewPriceDialogOpen] = useState(false);
  const [newPricePlanId, setNewPricePlanId] = useState<string>("");
  const [newPriceForm, setNewPriceForm] = useState({
    mode: 'avulso' as PriceMode,
    period: 'mensal' as PricePeriod,
    price_cents: 0,
    badge_text: '',
    is_campaign: false,
    campaign_notes: '',
    recurring: false,
    auto_renew: false,
  });

  // MP Sync states
  const [mpSyncResult, setMpSyncResult] = useState<MPSyncResult | null>(null);
  const [mpSyncLoading, setMpSyncLoading] = useState(false);
  const [manualMappings, setManualMappings] = useState<Record<string, string>>({});

  const volumePlans = plans.filter(p => p.category === 'volume');
  const zplPlans = plans.filter(p => p.category === 'zpl');

  const handleMPSync = async (autoApply = false) => {
    try {
      setMpSyncLoading(true);
      const { data, error } = await supabase.functions.invoke('mp-sync-tenant-plans', {
        body: { auto_apply: autoApply },
      });
      if (error) throw error;
      setMpSyncResult(data);
      if (autoApply && data.applied > 0) {
        toast.success(`${data.applied} plano(s) vinculado(s) com sucesso`);
      } else if (autoApply && data.applied === 0) {
        toast.info('Nenhum novo vínculo necessário');
      }
    } catch (err) {
      console.error('[MP Sync]', err);
      toast.error('Erro ao sincronizar com Mercado Pago');
    } finally {
      setMpSyncLoading(false);
    }
  };

  const handleManualMapping = async () => {
    const mappings = Object.entries(manualMappings)
      .filter(([_, mpId]) => mpId.trim())
      .map(([tenantPlanId, mpId]) => ({ tenant_plan_id: tenantPlanId, mp_plan_id: mpId.trim() }));
    
    if (mappings.length === 0) {
      toast.error('Nenhum mapeamento definido');
      return;
    }

    try {
      setMpSyncLoading(true);
      const { data, error } = await supabase.functions.invoke('mp-sync-tenant-plans', {
        body: { manual_mapping: mappings },
      });
      if (error) throw error;
      setMpSyncResult(data);
      setManualMappings({});
      toast.success(`${data.applied} plano(s) vinculado(s) manualmente`);
    } catch (err) {
      toast.error('Erro ao aplicar mapeamento manual');
    } finally {
      setMpSyncLoading(false);
    }
  };

  const handleAmountSave = async (priceId: string) => {
    const cents = Math.round(parseFloat(editingAmount) * 100);
    if (isNaN(cents) || cents <= 0) return;
    
    await updatePrice(priceId, { 
      price_cents: cents,
      badge_text: editingBadge || null,
    });
    setEditingPriceId(null);
  };

  const handleCreatePrice = async () => {
    if (!newPricePlanId) return;
    
    await createPrice({
      plan_id: newPricePlanId,
      mode: newPriceForm.mode,
      period: newPriceForm.period,
      price_cents: newPriceForm.price_cents,
      badge_text: newPriceForm.badge_text || null,
      is_campaign: newPriceForm.is_campaign,
      campaign_notes: newPriceForm.campaign_notes || null,
      recurring: newPriceForm.recurring,
      auto_renew: newPriceForm.auto_renew,
    });
    
    setNewPriceDialogOpen(false);
    setNewPriceForm({
      mode: 'avulso',
      period: 'mensal',
      price_cents: 0,
      badge_text: '',
      is_campaign: false,
      campaign_notes: '',
      recurring: false,
      auto_renew: false,
    });
  };

  const renderPricesTable = (prices: AdminPlanPrice[]) => (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left">Período</th>
            <th className="px-3 py-2 text-left">Modo</th>
            <th className="px-3 py-2 text-right">Valor</th>
            <th className="px-3 py-2 text-left">Badge</th>
            <th className="px-3 py-2 text-center">Visível</th>
            <th className="px-3 py-2 text-center">Campanha</th>
            <th className="px-3 py-2 text-center">MP Sync</th>
            <th className="px-3 py-2 text-center">Ações</th>
          </tr>
        </thead>
        <tbody>
          {prices
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((price) => (
              <tr key={price.id} className="border-t">
                <td className="px-3 py-2">{getPeriodLabel(price.period)}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="text-xs">
                    {getModeLabel(price.mode)}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  {editingPriceId === price.id ? (
                    <div className="flex items-center gap-1 justify-end">
                      <Input
                        type="number"
                        step="0.01"
                        value={editingAmount}
                        onChange={(e) => setEditingAmount(e.target.value)}
                        className="w-24 h-7 text-right"
                        placeholder="Valor"
                      />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleAmountSave(price.id)}>
                        <Check className="w-3 h-3 text-success" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingPriceId(null)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      className="hover:underline font-medium"
                      onClick={() => {
                        setEditingPriceId(price.id);
                        setEditingAmount((price.price_cents / 100).toFixed(2));
                        setEditingBadge(price.badge_text || '');
                      }}
                    >
                      {formatPriceBRL(price.price_cents)}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2">
                  {editingPriceId === price.id ? (
                    <Input
                      type="text"
                      value={editingBadge}
                      onChange={(e) => setEditingBadge(e.target.value)}
                      className="w-32 h-7 text-xs"
                      placeholder="Badge (opcional)"
                    />
                  ) : (
                    price.badge_text && (
                      <Badge className="bg-success text-white text-[9px]">
                        {price.badge_text}
                      </Badge>
                    )
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <Switch
                    checked={price.visible}
                    onCheckedChange={(checked) => 
                      updatePrice(price.id, { visible: checked })
                    }
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  {price.is_campaign ? (
                    <Badge className="bg-amber-500 text-white text-[9px]">Campanha</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => syncPriceWithMP(price.id)}
                  >
                    <Link className="w-3 h-3 mr-1" />
                    Sync
                  </Button>
                </td>
                <td className="px-3 py-2 text-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm('Excluir este preço?')) {
                        deletePrice(price.id);
                      }
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-2xl font-bold">Admin: Planos e Preços</h1>
          </div>
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>

        {/* Settings Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Configurações Globais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Habilitar Plano Anual (Campanha)</p>
                <p className="text-xs text-muted-foreground">
                  Exibe opção de assinatura anual com benefício "pague 10, use 12"
                </p>
              </div>
              <Switch
                checked={settings.enable_annual_campaign}
                onCheckedChange={(checked) => 
                  updateSettings({ enable_annual_campaign: checked })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* New Price Dialog */}
        <Dialog open={newPriceDialogOpen} onOpenChange={setNewPriceDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Preço</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Modo</Label>
                  <Select
                    value={newPriceForm.mode}
                    onValueChange={(v) => {
                      const mode = v as PriceMode;
                      setNewPriceForm(prev => ({
                        ...prev, 
                        mode,
                        recurring: mode === 'assinatura',
                        auto_renew: mode === 'assinatura',
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="avulso">Avulso</SelectItem>
                      <SelectItem value="assinatura">Assinatura</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Período</Label>
                  <Select
                    value={newPriceForm.period}
                    onValueChange={(v) => setNewPriceForm(prev => ({ ...prev, period: v as PricePeriod }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mensal">Mensal</SelectItem>
                      <SelectItem value="trimestral">Trimestral</SelectItem>
                      <SelectItem value="semestral">Semestral</SelectItem>
                      <SelectItem value="anual">Anual</SelectItem>
                      <SelectItem value="vitalicio">Vitalício</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={(newPriceForm.price_cents / 100).toFixed(2)}
                  onChange={(e) => setNewPriceForm(prev => ({ 
                    ...prev, 
                    price_cents: Math.round(parseFloat(e.target.value || '0') * 100) 
                  }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Badge (opcional)</Label>
                <Input
                  type="text"
                  value={newPriceForm.badge_text}
                  onChange={(e) => setNewPriceForm(prev => ({ ...prev, badge_text: e.target.value }))}
                  placeholder="Ex: Economia de R$ 50"
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newPriceForm.is_campaign}
                    onCheckedChange={(checked) => setNewPriceForm(prev => ({ ...prev, is_campaign: checked }))}
                  />
                  <Label className="text-sm">É campanha</Label>
                </div>
              </div>
              {newPriceForm.is_campaign && (
                <div className="space-y-2">
                  <Label>Nota da Campanha</Label>
                  <Input
                    type="text"
                    value={newPriceForm.campaign_notes}
                    onChange={(e) => setNewPriceForm(prev => ({ ...prev, campaign_notes: e.target.value }))}
                    placeholder="Ex: Pague 10, use 12"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewPriceDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreatePrice}>
                Criar Preço
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Plans Tabs */}
        <Tabs defaultValue="volume">
          <TabsList className="mb-4">
            <TabsTrigger value="volume">Planos por Volume ({volumePlans.length})</TabsTrigger>
            <TabsTrigger value="zpl">Plano ZPL ({zplPlans.length})</TabsTrigger>
            <TabsTrigger value="mp-sync">
              <Zap className="w-3 h-3 mr-1" />
              Sync Mercado Pago
            </TabsTrigger>
          </TabsList>

          <TabsContent value="volume">
            <Accordion type="multiple" className="space-y-2">
              {volumePlans.map((plan) => (
                <AccordionItem key={plan.id} value={plan.id} className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{plan.name}</span>
                      <Badge variant={plan.active ? "default" : "secondary"}>
                        {plan.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">{plan.description}</p>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={plan.active}
                            onCheckedChange={(checked) => updatePlan(plan.id, { active: checked })}
                          />
                          <span className="text-xs text-muted-foreground">Ativo</span>
                        </div>
                      </div>
                      
                      {/* Add Price Button */}
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setNewPricePlanId(plan.id);
                            setNewPriceDialogOpen(true);
                          }}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Adicionar Preço
                        </Button>
                      </div>
                      
                      {/* Prices Table */}
                      {renderPricesTable(plan.plan_prices)}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </TabsContent>

          <TabsContent value="zpl">
            <Accordion type="multiple" className="space-y-2">
              {zplPlans.map((plan) => (
                <AccordionItem key={plan.id} value={plan.id} className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{plan.name}</span>
                      <Badge variant={plan.active ? "default" : "secondary"}>
                        {plan.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">{plan.description}</p>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={plan.active}
                            onCheckedChange={(checked) => updatePlan(plan.id, { active: checked })}
                          />
                          <span className="text-xs text-muted-foreground">Ativo</span>
                        </div>
                      </div>
                      
                      {/* Add Price Button */}
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setNewPricePlanId(plan.id);
                            setNewPriceDialogOpen(true);
                          }}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Adicionar Preço
                        </Button>
                      </div>
                      
                      {/* Prices Table */}
                      {renderPricesTable(plan.plan_prices)}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </TabsContent>

          {/* MP Sync Tab */}
          <TabsContent value="mp-sync">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Sincronizar Planos com Mercado Pago</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleMPSync(false)}
                      disabled={mpSyncLoading}
                    >
                      {mpSyncLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                      Buscar Planos MP
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleMPSync(true)}
                      disabled={mpSyncLoading}
                    >
                      {mpSyncLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                      Auto-vincular
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Busca planos ativos no Mercado Pago e vincula automaticamente à tabela tenant_plans pelo nome.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Current Status */}
                {mpSyncResult && (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <Card className="p-4">
                        <p className="text-2xl font-bold">{mpSyncResult.mp_plans_found}</p>
                        <p className="text-xs text-muted-foreground">Planos encontrados no MP</p>
                      </Card>
                      <Card className="p-4">
                        <p className="text-2xl font-bold text-primary">{mpSyncResult.matches.length}</p>
                        <p className="text-xs text-muted-foreground">Matches automáticos</p>
                      </Card>
                      <Card className="p-4">
                        <p className="text-2xl font-bold">{mpSyncResult.applied}</p>
                        <p className="text-xs text-muted-foreground">Aplicados nesta execução</p>
                      </Card>
                    </div>

                    {/* Matches Table */}
                    {mpSyncResult.matches.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Matches Encontrados</h3>
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="px-3 py-2 text-left">Plano Local</th>
                                <th className="px-3 py-2 text-left">Plano MP (reason)</th>
                                <th className="px-3 py-2 text-left">MP Plan ID</th>
                                <th className="px-3 py-2 text-right">Valor MP</th>
                                <th className="px-3 py-2 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {mpSyncResult.matches.map((m) => (
                                <tr key={m.mp_plan_id} className="border-t">
                                  <td className="px-3 py-2">
                                    <span className="font-medium">{m.tenant_plan_name}</span>
                                    <span className="text-xs text-muted-foreground ml-1">({m.tenant_plan_code})</span>
                                  </td>
                                  <td className="px-3 py-2 text-xs">{m.mp_plan_reason}</td>
                                  <td className="px-3 py-2">
                                    <code className="text-xs bg-muted px-1 py-0.5 rounded">{m.mp_plan_id}</code>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: m.mp_currency }).format(m.mp_amount)}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {m.already_linked ? (
                                      <Badge className="bg-primary text-primary-foreground text-[9px]">
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        Vinculado
                                      </Badge>
                                    ) : (
                                      <Badge variant="secondary" className="text-[9px]">
                                        <AlertCircle className="w-3 h-3 mr-1" />
                                        Pendente
                                      </Badge>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Unmatched MP Plans */}
                    {mpSyncResult.unmatched_mp.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Planos MP sem match ({mpSyncResult.unmatched_mp.length})</h3>
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="px-3 py-2 text-left">MP Plan ID</th>
                                <th className="px-3 py-2 text-left">Reason</th>
                                <th className="px-3 py-2 text-right">Valor</th>
                                <th className="px-3 py-2 text-left">Vincular a</th>
                              </tr>
                            </thead>
                            <tbody>
                              {mpSyncResult.unmatched_mp.map((u) => (
                                <tr key={u.mp_plan_id} className="border-t">
                                  <td className="px-3 py-2">
                                    <code className="text-xs bg-muted px-1 py-0.5 rounded">{u.mp_plan_id}</code>
                                  </td>
                                  <td className="px-3 py-2 text-xs">{u.mp_plan_reason}</td>
                                  <td className="px-3 py-2 text-right">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(u.mp_amount)}
                                  </td>
                                  <td className="px-3 py-2">
                                    <Select
                                      value={manualMappings[mpSyncResult.tenant_plans.find(tp => !tp.is_enterprise)?.id || ''] || ''}
                                      onValueChange={(tpId) => {
                                        setManualMappings(prev => ({ ...prev, [tpId]: u.mp_plan_id }));
                                      }}
                                    >
                                      <SelectTrigger className="h-7 text-xs w-48">
                                        <SelectValue placeholder="Selecionar plano..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {mpSyncResult.tenant_plans
                                          .filter(tp => !tp.is_enterprise)
                                          .map(tp => (
                                            <SelectItem key={tp.id} value={tp.id}>
                                              {tp.name} {tp.current_mp_id ? '✓' : ''}
                                            </SelectItem>
                                          ))
                                        }
                                      </SelectContent>
                                    </Select>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {Object.keys(manualMappings).length > 0 && (
                          <div className="flex justify-end mt-3">
                            <Button size="sm" onClick={handleManualMapping} disabled={mpSyncLoading}>
                              {mpSyncLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                              Aplicar Mapeamento Manual
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Current tenant_plans status */}
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Status Atual dos Tenant Plans</h3>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="px-3 py-2 text-left">Plano</th>
                              <th className="px-3 py-2 text-left">Code</th>
                              <th className="px-3 py-2 text-left">MP Plan ID</th>
                              <th className="px-3 py-2 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mpSyncResult.tenant_plans.map(tp => (
                              <tr key={tp.id} className="border-t">
                                <td className="px-3 py-2 font-medium">{tp.name}</td>
                                <td className="px-3 py-2">
                                  <code className="text-xs bg-muted px-1 py-0.5 rounded">{tp.code}</code>
                                </td>
                                <td className="px-3 py-2">
                                  {tp.current_mp_id ? (
                                    <code className="text-xs bg-muted px-1 py-0.5 rounded">{tp.current_mp_id}</code>
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">
                                      {tp.is_enterprise ? 'Enterprise (sem checkout)' : 'Não vinculado'}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {tp.is_enterprise ? (
                                    <Badge variant="outline" className="text-[9px]">Enterprise</Badge>
                                  ) : tp.current_mp_id ? (
                                    <Badge className="bg-primary text-primary-foreground text-[9px]">
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      OK
                                    </Badge>
                                  ) : (
                                    <Badge variant="destructive" className="text-[9px]">
                                      <AlertCircle className="w-3 h-3 mr-1" />
                                      Pendente
                                    </Badge>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}

                {!mpSyncResult && !mpSyncLoading && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Clique em "Buscar Planos MP" para iniciar a sincronização</p>
                  </div>
                )}

                {mpSyncLoading && !mpSyncResult && (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Buscando planos no Mercado Pago...</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
