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
import { ArrowLeft, Save, Eye, EyeOff, Check, X, RefreshCw, Plus, Trash2, Link } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { PriceMode, PricePeriod, AdminPlanPrice } from "@/types/billing";

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

  const volumePlans = plans.filter(p => p.category === 'volume');
  const zplPlans = plans.filter(p => p.category === 'zpl');

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
        </Tabs>
      </div>
    </div>
  );
}
