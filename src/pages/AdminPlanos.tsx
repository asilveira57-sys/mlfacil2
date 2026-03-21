import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useBillingAdminTiers } from "@/hooks/useBillingAdminTiers";
import { formatPriceBRL, getPeriodLabel } from "@/hooks/useTierOffers";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Save, Eye, EyeOff, Check, X, RefreshCw, Zap, CheckCircle, AlertCircle, Loader2,
  Package, Printer, CreditCard, Repeat, Tag, Blocks,
} from "lucide-react";
import { PlanModulesTab } from "@/components/admin/plans/PlanModulesTab";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { AdminOffer, AdminAddonOffer } from "@/hooks/useBillingAdminTiers";

// ─── Offer row editor ───
function OfferRow({
  offer,
  onUpdate,
}: {
  offer: AdminOffer | AdminAddonOffer;
  onUpdate: (id: string, updates: Partial<AdminOffer>) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState("");
  const [badge, setBadge] = useState("");

  const startEdit = () => {
    setEditing(true);
    setPrice(offer.price_brl.toFixed(2));
    setBadge(offer.badge_text || "");
  };

  const saveEdit = async () => {
    const val = parseFloat(price);
    if (isNaN(val) || val <= 0) return;
    await onUpdate(offer.id, { price_brl: val as any, badge_text: badge || null });
    setEditing(false);
  };

  return (
    <tr className="border-t">
      <td className="px-3 py-2 text-sm">{getPeriodLabel(offer.period_months)}</td>
      <td className="px-3 py-2">
        <Badge variant="outline" className="text-xs">
          {offer.billing_mode === "one_time" ? "Pré-pago" : "Recorrente"}
        </Badge>
      </td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <div className="flex items-center gap-1 justify-end">
            <Input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className="w-24 h-7 text-right" />
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={saveEdit}><Check className="w-3 h-3 text-success" /></Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(false)}><X className="w-3 h-3" /></Button>
          </div>
        ) : (
          <button className="hover:underline font-medium text-sm" onClick={startEdit}>
            {formatPriceBRL(offer.price_brl)}
          </button>
        )}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <Input type="text" value={badge} onChange={e => setBadge(e.target.value)} className="w-32 h-7 text-xs" placeholder="Badge" />
        ) : (
          offer.badge_text && <Badge className="bg-success/10 text-success border-success/20 text-[9px]"><Tag className="w-3 h-3 mr-1" />{offer.badge_text}</Badge>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <Switch checked={offer.is_visible} onCheckedChange={checked => onUpdate(offer.id, { is_visible: checked })} />
      </td>
      <td className="px-3 py-2 text-center">
        {offer.is_campaign ? (
          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[9px]">Campanha</Badge>
        ) : <span className="text-muted-foreground text-xs">-</span>}
      </td>
      <td className="px-3 py-2 text-center">
        {offer.mp_product_ref ? (
          <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px]">
            <CheckCircle className="w-3 h-3 mr-1" />Vinculado
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </td>
    </tr>
  );
}

// ─── Offers table ───
function OffersTable({
  offers,
  onUpdate,
}: {
  offers: (AdminOffer | AdminAddonOffer)[];
  onUpdate: (id: string, updates: Partial<AdminOffer>) => Promise<boolean>;
}) {
  const oneTime = offers.filter(o => o.billing_mode === "one_time").sort((a, b) => a.period_months - b.period_months);
  const recurring = offers.filter(o => o.billing_mode === "recurring").sort((a, b) => a.period_months - b.period_months);

  const renderSection = (title: string, icon: React.ReactNode, items: typeof offers) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</span>
        </div>
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
                <th className="px-3 py-2 text-center">MP</th>
              </tr>
            </thead>
            <tbody>
              {items.map(o => <OfferRow key={o.id} offer={o} onUpdate={onUpdate} />)}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <>
      {renderSection("Pagamento Antecipado", <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />, oneTime)}
      {renderSection("Assinatura Recorrente", <Repeat className="w-3.5 h-3.5 text-muted-foreground" />, recurring)}
    </>
  );
}

// ─── Main ───
export default function AdminPlanos() {
  const navigate = useNavigate();
  const {
    tiers, addons, settings, loading, refetch,
    updateOffer, updateAddonOffer, updateTier, updateAddon, updateSettings,
  } = useBillingAdminTiers();

  // MP Sync
  const [mpSyncResult, setMpSyncResult] = useState<any>(null);
  const [mpSyncLoading, setMpSyncLoading] = useState(false);

  const handleMPSync = async (autoApply = false) => {
    try {
      setMpSyncLoading(true);
      const { data, error } = await supabase.functions.invoke('mp-sync-tenant-plans', {
        body: { auto_apply: autoApply },
      });
      if (error) throw error;
      setMpSyncResult(data);
      if (autoApply && data.applied > 0) {
        toast.success(`${data.applied} plano(s) vinculado(s)`);
      } else if (autoApply) {
        toast.info('Nenhum novo vínculo necessário');
      }
    } catch (err) {
      toast.error('Erro ao sincronizar com Mercado Pago');
    } finally {
      setMpSyncLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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
            <h1 className="text-2xl font-bold text-foreground">Admin: Tiers, Ofertas & Add-ons</h1>
          </div>
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
          </Button>
        </div>

        {/* Settings */}
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-lg">Configurações</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Campanha Anual</p>
                <p className="text-xs text-muted-foreground">Exibe assinatura anual "pague 10, use 12"</p>
              </div>
              <Switch
                checked={settings.enable_annual_campaign}
                onCheckedChange={checked => updateSettings({ enable_annual_campaign: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="tiers">
          <TabsList className="mb-4">
            <TabsTrigger value="tiers">
              <Package className="w-3.5 h-3.5 mr-1.5" /> Faixas ({tiers.length})
            </TabsTrigger>
            <TabsTrigger value="addons">
              <Printer className="w-3.5 h-3.5 mr-1.5" /> Add-ons ({addons.length})
            </TabsTrigger>
            <TabsTrigger value="mp-sync">
              <Zap className="w-3.5 h-3.5 mr-1.5" /> MP Sync
            </TabsTrigger>
            <TabsTrigger value="modules">
              <Blocks className="w-3.5 h-3.5 mr-1.5" /> Módulos
            </TabsTrigger>
          </TabsList>

          {/* ─── TIERS ─── */}
          <TabsContent value="tiers">
            <Accordion type="multiple" className="space-y-2">
              {tiers.map(tier => (
                <AccordionItem key={tier.id} value={tier.id} className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3">
                      <Package className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-foreground">{tier.display_name || tier.name}</span>
                      <Badge variant="outline" className="text-[10px]">{tier.code}</Badge>
                      {tier.is_enterprise && <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[9px]">Enterprise</Badge>}
                      <Badge variant={tier.is_active ? "default" : "secondary"} className="text-[9px]">
                        {tier.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-auto mr-2">
                        {tier.offers.length} oferta(s)
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          {tier.min_orders_30d}{tier.max_orders_30d ? `–${tier.max_orders_30d}` : "+"} pedidos/mês
                          {tier.description && ` • ${tier.description}`}
                        </p>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={tier.is_active}
                            onCheckedChange={checked => updateTier(tier.id, { is_active: checked })}
                          />
                          <span className="text-xs text-muted-foreground">Ativo</span>
                        </div>
                      </div>

                      {tier.is_enterprise ? (
                        <p className="text-sm text-muted-foreground italic">Sob consulta — sem checkout automático.</p>
                      ) : (
                        <OffersTable offers={tier.offers} onUpdate={updateOffer} />
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </TabsContent>

          {/* ─── ADD-ONS ─── */}
          <TabsContent value="addons">
            <Accordion type="multiple" className="space-y-2">
              {addons.map(addon => (
                <AccordionItem key={addon.id} value={addon.id} className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3">
                      <Printer className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-foreground">{addon.name}</span>
                      <Badge variant="outline" className="text-[10px]">{addon.code}</Badge>
                      <Badge variant={addon.is_active ? "default" : "secondary"} className="text-[9px]">
                        {addon.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-auto mr-2">
                        {addon.offers.length} oferta(s)
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">{addon.description || "Sem descrição"}</p>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={addon.is_active}
                            onCheckedChange={checked => updateAddon(addon.id, { is_active: checked })}
                          />
                          <span className="text-xs text-muted-foreground">Ativo</span>
                        </div>
                      </div>

                      <OffersTable offers={addon.offers} onUpdate={updateAddonOffer} />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
              {addons.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum add-on cadastrado.</p>
              )}
            </Accordion>
          </TabsContent>

          {/* ─── MP SYNC ─── */}
          <TabsContent value="mp-sync">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Sincronizar com Mercado Pago</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleMPSync(false)} disabled={mpSyncLoading}>
                      {mpSyncLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                      Buscar
                    </Button>
                    <Button size="sm" onClick={() => handleMPSync(true)} disabled={mpSyncLoading}>
                      {mpSyncLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                      Auto-vincular
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Busca planos no Mercado Pago e vincula a plan_tiers.</p>
              </CardHeader>
              <CardContent>
                {mpSyncResult ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <Card className="p-4">
                        <p className="text-2xl font-bold">{mpSyncResult.mp_plans_found}</p>
                        <p className="text-xs text-muted-foreground">Encontrados no MP</p>
                      </Card>
                      <Card className="p-4">
                        <p className="text-2xl font-bold text-primary">{mpSyncResult.matches?.length || 0}</p>
                        <p className="text-xs text-muted-foreground">Matches</p>
                      </Card>
                      <Card className="p-4">
                        <p className="text-2xl font-bold">{mpSyncResult.applied}</p>
                        <p className="text-xs text-muted-foreground">Aplicados</p>
                      </Card>
                    </div>

                    {/* Tier status */}
                    {mpSyncResult.tenant_plans?.length > 0 && (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="px-3 py-2 text-left">Faixa</th>
                              <th className="px-3 py-2 text-left">Code</th>
                              <th className="px-3 py-2 text-left">MP ID</th>
                              <th className="px-3 py-2 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mpSyncResult.tenant_plans.map((tp: any) => (
                              <tr key={tp.id} className="border-t">
                                <td className="px-3 py-2 font-medium">{tp.name}</td>
                                <td className="px-3 py-2"><code className="text-xs bg-muted px-1 py-0.5 rounded">{tp.code}</code></td>
                                <td className="px-3 py-2">
                                  {tp.current_mp_id ? (
                                    <code className="text-xs bg-muted px-1 py-0.5 rounded">{tp.current_mp_id}</code>
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">
                                      {tp.is_enterprise ? "Enterprise" : "Não vinculado"}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {tp.is_enterprise ? (
                                    <Badge variant="outline" className="text-[9px]">Enterprise</Badge>
                                  ) : tp.current_mp_id ? (
                                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px]"><CheckCircle className="w-3 h-3 mr-1" />OK</Badge>
                                  ) : (
                                    <Badge variant="destructive" className="text-[9px]"><AlertCircle className="w-3 h-3 mr-1" />Pendente</Badge>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : mpSyncLoading ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Buscando planos…</p>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Clique em "Buscar" para iniciar</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── MODULES ─── */}
          <TabsContent value="modules">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Módulos por Plano</CardTitle>
                <CardDescription>Selecione quais módulos cada plano terá acesso.</CardDescription>
              </CardHeader>
              <CardContent>
                <PlanModulesTab />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
