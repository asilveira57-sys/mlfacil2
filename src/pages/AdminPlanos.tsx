import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useBillingAdmin } from "@/hooks/useBillingAdmin";
import { formatPriceBRL } from "@/hooks/useBillingPlans";
import { ArrowLeft, Save, Eye, EyeOff, Check, X, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AdminPlanos() {
  const navigate = useNavigate();
  const { 
    plans, 
    settings, 
    loading, 
    refetch,
    updatePlan,
    updatePrice,
    publishPrice,
    unpublishPrice,
    updateSettings,
  } = useBillingAdmin();

  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState<string>("");

  const volumePlans = plans.filter(p => p.category === 'volume');
  const zplPlans = plans.filter(p => p.category === 'zpl');

  const annualEnabled = (settings.campaigns as { annual_enabled?: boolean })?.annual_enabled ?? false;

  const handleAmountSave = async (priceId: string) => {
    const cents = Math.round(parseFloat(editingAmount) * 100);
    if (isNaN(cents) || cents <= 0) return;
    
    await updatePrice({ id: priceId, amount_cents: cents });
    setEditingPriceId(null);
  };

  const periodLabel = (period: string) => {
    const labels: Record<string, string> = {
      monthly: 'Mensal',
      quarterly: 'Trimestral',
      semiannual: 'Semestral',
      annual_campaign: 'Anual (Campanha)',
    };
    return labels[period] || period;
  };

  const modeLabel = (mode: string) => {
    return mode === 'one_time' ? 'Avulso' : 'Assinatura';
  };

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
            <CardTitle className="text-lg">Configurações</CardTitle>
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
                checked={annualEnabled}
                onCheckedChange={(checked) => 
                  updateSettings('campaigns', { annual_enabled: checked })
                }
              />
            </div>
          </CardContent>
        </Card>

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
                      <Badge variant={plan.is_active ? "default" : "secondary"}>
                        {plan.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <p className="text-sm text-muted-foreground">{plan.description}</p>
                      
                      {/* Prices Table */}
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="px-3 py-2 text-left">Período</th>
                              <th className="px-3 py-2 text-left">Modo</th>
                              <th className="px-3 py-2 text-right">Valor</th>
                              <th className="px-3 py-2 text-center">Visível</th>
                              <th className="px-3 py-2 text-center">Status</th>
                              <th className="px-3 py-2 text-center">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {plan.billing_plan_prices
                              .sort((a, b) => a.ui_order - b.ui_order)
                              .map((price) => (
                                <tr key={price.id} className="border-t">
                                  <td className="px-3 py-2">{periodLabel(price.period)}</td>
                                  <td className="px-3 py-2">
                                    <Badge variant="outline" className="text-xs">
                                      {modeLabel(price.mode)}
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
                                        className="hover:underline"
                                        onClick={() => {
                                          setEditingPriceId(price.id);
                                          setEditingAmount((price.amount_cents / 100).toFixed(2));
                                        }}
                                      >
                                        {formatPriceBRL(price.amount_cents)}
                                      </button>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <Switch
                                      checked={price.is_visible}
                                      onCheckedChange={(checked) => 
                                        updatePrice({ id: price.id, is_visible: checked })
                                      }
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {price.published_at ? (
                                      <Badge className="bg-success text-white text-xs">Publicado</Badge>
                                    ) : (
                                      <Badge variant="secondary" className="text-xs">Rascunho</Badge>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {price.published_at ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs"
                                        onClick={() => unpublishPrice(price.id)}
                                      >
                                        <EyeOff className="w-3 h-3 mr-1" />
                                        Despublicar
                                      </Button>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs text-success"
                                        onClick={() => publishPrice(price.id)}
                                      >
                                        <Eye className="w-3 h-3 mr-1" />
                                        Publicar
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
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
                      <Badge variant={plan.is_active ? "default" : "secondary"}>
                        {plan.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <p className="text-sm text-muted-foreground">{plan.description}</p>
                      
                      {/* Same prices table structure */}
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="px-3 py-2 text-left">Período</th>
                              <th className="px-3 py-2 text-left">Modo</th>
                              <th className="px-3 py-2 text-right">Valor</th>
                              <th className="px-3 py-2 text-left">Badge</th>
                              <th className="px-3 py-2 text-center">Visível</th>
                              <th className="px-3 py-2 text-center">Status</th>
                              <th className="px-3 py-2 text-center">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {plan.billing_plan_prices
                              .sort((a, b) => a.ui_order - b.ui_order)
                              .map((price) => (
                                <tr key={price.id} className="border-t">
                                  <td className="px-3 py-2">{periodLabel(price.period)}</td>
                                  <td className="px-3 py-2">
                                    <Badge variant="outline" className="text-xs">
                                      {modeLabel(price.mode)}
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
                                        className="hover:underline"
                                        onClick={() => {
                                          setEditingPriceId(price.id);
                                          setEditingAmount((price.amount_cents / 100).toFixed(2));
                                        }}
                                      >
                                        {formatPriceBRL(price.amount_cents)}
                                      </button>
                                    )}
                                  </td>
                                  <td className="px-3 py-2">
                                    {price.badge_text && (
                                      <Badge className="bg-success text-white text-xs">
                                        {price.badge_text}
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <Switch
                                      checked={price.is_visible}
                                      onCheckedChange={(checked) => 
                                        updatePrice({ id: price.id, is_visible: checked })
                                      }
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {price.published_at ? (
                                      <Badge className="bg-success text-white text-xs">Publicado</Badge>
                                    ) : (
                                      <Badge variant="secondary" className="text-xs">Rascunho</Badge>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {price.published_at ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs"
                                        onClick={() => unpublishPrice(price.id)}
                                      >
                                        <EyeOff className="w-3 h-3 mr-1" />
                                        Despublicar
                                      </Button>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs text-success"
                                        onClick={() => publishPrice(price.id)}
                                      >
                                        <Eye className="w-3 h-3 mr-1" />
                                        Publicar
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
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
