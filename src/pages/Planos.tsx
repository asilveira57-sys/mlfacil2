import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LandingHeader, LandingFooter } from "@/components/landing";
import { useTierOffersCatalog, useOfferCheckout, formatPriceBRL, getPeriodLabel, getPeriodSuffix } from "@/hooks/useTierOffers";
import { useUserAccess } from "@/contexts/UserAccessContext";
import { useUserSalesVolume } from "@/hooks/useUserSalesVolume";
import { toast } from "sonner";
import {
  Sparkles, CheckCircle, ArrowLeft, ArrowDown, AlertTriangle, Tag,
  LayoutDashboard, DollarSign, BarChart3, Settings2, FileText, RefreshCw,
  ChevronDown, ChevronRight, CreditCard, Repeat, Package, Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanTier, TierOffer } from "@/hooks/useTierOffers";

const INCLUDED_FEATURES = [
  { icon: LayoutDashboard, label: "Dashboard completo" },
  { icon: DollarSign, label: "Precificação inteligente com margem real" },
  { icon: BarChart3, label: "Análise estratégica de anúncios" },
  { icon: Settings2, label: "Gestão operacional" },
  { icon: FileText, label: "Relatórios e indicadores" },
  { icon: RefreshCw, label: "Sincronização automática" },
];

const FAQ_ITEMS = [
  { q: "O que muda de um plano para outro?", a: "Apenas o limite mensal de pedidos. As funcionalidades são exatamente iguais em todos os planos." },
  { q: "Qual a diferença entre Pré-pago e Assinatura?", a: "No Pré-pago você paga antecipado pelo período escolhido. Na Assinatura, a cobrança é mensal e recorrente." },
  { q: "Posso trocar de plano depois?", a: "Sim. Você pode ajustar seu plano a qualquer momento conforme seu volume mudar." },
  { q: "O teste grátis exige cartão?", a: "Não. Você pode testar por 14 dias sem precisar cadastrar nenhum método de pagamento." },
];

const Planos = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: catalog, isLoading, error } = useTierOffersCatalog();
  const { checkout, loading: checkoutLoading } = useOfferCheckout();
  const { isAuthenticated, trialActive, trialExpired, flags } = useUserAccess();
  const { totalSales30d } = useUserSalesVolume();

  const [selectedTierCode, setSelectedTierCode] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [userTag, setUserTag] = useState<string | null>(null);
  const [veteranoOffers, setVeteranoOffers] = useState<TierOffer[]>([]);

  // Fetch user tag for veterano check
  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('tag').eq('id', user.id).single();
      setUserTag(data?.tag ?? null);

      // If veterano, fetch hidden offers
      if (data?.tag === 'VETERANO') {
        const { data: offers } = await supabase
          .from('plan_offers')
          .select('id, offer_code, billing_mode, period_months, price_brl, badge_text, is_campaign, mp_product_ref')
          .eq('tier_id', 'f1e2d3c4-b5a6-7890-abcd-ef1234567890')
          .eq('is_active', true)
          .order('period_months');
        if (offers) {
          setVeteranoOffers(offers.map(o => ({ ...o, price_brl: Number(o.price_brl) })) as TierOffer[]);
        }
      }
    })();
  }, [isAuthenticated]);

  const isVeterano = userTag === 'VETERANO';

  // Filter tiers: hide veterano for non-veterano users, inject offers for veterano users
  const tiers = useMemo(() => {
    const baseTiers = catalog?.tiers || [];
    if (isVeterano) {
      // Inject veterano offers into the veterano tier
      return baseTiers.map(t =>
        t.code === 'veterano' ? { ...t, offers: veteranoOffers } : t
      );
    }
    // Non-veterano: hide veterano tier entirely
    return baseTiers.filter(t => t.code !== 'veterano');
  }, [catalog?.tiers, isVeterano, veteranoOffers]);

  const addons = catalog?.addons || [];
  const settings = catalog?.settings || { enable_annual_campaign: false };

  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "failure") toast.error("Pagamento não concluído", { description: "Houve um problema com seu pagamento. Tente novamente." });
    if (paymentStatus === "success") toast.success("Pagamento processado!", { description: "Seu plano foi ativado com sucesso." });
  }, [searchParams]);

  const selectedTier = useMemo(() => tiers.find(t => t.code === selectedTierCode) || null, [tiers, selectedTierCode]);

  const oneTimeOffers = useMemo(() => {
    if (!selectedTier) return [];
    return selectedTier.offers
      .filter(o => o.billing_mode === "one_time")
      .filter(o => !o.is_campaign || settings.enable_annual_campaign)
      .sort((a, b) => a.period_months - b.period_months);
  }, [selectedTier, settings]);

  const recurringOffers = useMemo(() => {
    if (!selectedTier) return [];
    return selectedTier.offers
      .filter(o => o.billing_mode === "recurring")
      .filter(o => !o.is_campaign || settings.enable_annual_campaign)
      .sort((a, b) => a.period_months - b.period_months);
  }, [selectedTier, settings]);

  const zplAddon = addons.find(a => a.code === "zpl_full");

  const isTierTooSmall = (tier: PlanTier) => {
    if (!isAuthenticated || totalSales30d <= 0) return false;
    if (tier.code.startsWith('zpl')) return false; // ZPL plans have no volume limit
    return tier.max_orders_30d !== null && tier.max_orders_30d < totalSales30d;
  };

  const handleSelectTier = (code: string) => {
    setSelectedTierCode(code);
    setTimeout(() => document.getElementById("plan-detail")?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const handleBack = () => {
    setSelectedTierCode(null);
    setTimeout(() => document.getElementById("camadas")?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const handleOfferClick = (offer: TierOffer) => {
    if (!isAuthenticated) {
      const params = new URLSearchParams();
      if (selectedTierCode) params.set('plan', selectedTierCode);
      params.set('offer', offer.offer_code);
      navigate(`/criar-acesso?${params.toString()}`);
      return;
    }
    checkout(offer.id);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <LandingHeader />
        <main className="pt-20">
          <div className="text-center max-w-3xl mx-auto px-4 py-16">
            <Skeleton className="h-10 w-96 mx-auto mb-4" />
            <Skeleton className="h-5 w-[500px] mx-auto mb-8" />
          </div>
          <div className="max-w-5xl mx-auto px-4 py-12">
            <div className="grid md:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="p-6 rounded-xl border border-border bg-card">
                  <Skeleton className="h-6 w-40 mb-2" />
                  <Skeleton className="h-4 w-56 mb-4" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          </div>
        </main>
        <LandingFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />
      <main className="pt-16">
        {/* ─── HERO ─── */}
        <section className="bg-gradient-to-b from-primary/5 to-background py-16 md:py-24 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-4">
              Uma plataforma completa.{" "}
              <span className="text-primary">Você escolhe apenas o volume.</span>
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
              Todos os planos incluem as mesmas funcionalidades. A diferença está apenas na capacidade mensal de pedidos.
            </p>
            <div className="inline-flex items-center gap-2 bg-success/10 text-success px-4 py-2 rounded-full border border-success/20 mb-8">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-semibold">Teste grátis por 14 dias, sem cartão.</span>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button size="lg" className="gap-2 px-8 h-12 text-base" onClick={() => document.getElementById("camadas")?.scrollIntoView({ behavior: "smooth" })}>
                Escolher meu plano <ArrowDown className="w-4 h-4" />
              </Button>
              <Button size="lg" variant="outline" className="gap-2 px-6 h-12 text-base bg-background" onClick={() => document.getElementById("incluso")?.scrollIntoView({ behavior: "smooth" })}>
                Ver o que está incluso
              </Button>
            </div>
          </div>
        </section>

        {/* ─── INCLUSO ─── */}
        <section id="incluso" className="py-12 md:py-16 px-4 bg-background">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl md:text-2xl font-bold text-foreground text-center mb-2">Incluso em todos os planos</h2>
            <p className="text-sm text-muted-foreground text-center mb-8">Funcionalidades iguais em todos os planos.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {INCLUDED_FEATURES.map(feat => (
                <div key={feat.label} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <feat.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{feat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── ETAPA 1: SELEÇÃO DE FAIXA ─── */}
        <section id="camadas" className="py-12 md:py-16 px-4 bg-muted/40">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-xl md:text-2xl font-bold text-foreground text-center mb-2">Escolha sua capacidade mensal</h2>
            <p className="text-sm text-muted-foreground text-center mb-10">Selecione o volume de pedidos que corresponde à sua operação.</p>

            {isAuthenticated && totalSales30d > 0 && (
              <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5 mb-6 max-w-3xl mx-auto">
                <AlertTriangle className="w-4 h-4 text-primary flex-shrink-0" />
                <p className="text-xs text-foreground">
                  Seu volume nos últimos 30 dias: <strong>{totalSales30d} vendas</strong>. Planos com franquia inferior estão bloqueados.
                </p>
              </div>
            )}

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tiers.map(tier => {
                const tooSmall = isTierTooSmall(tier);
                const isSelected = selectedTierCode === tier.code;

                return (
                  <div
                    key={tier.code}
                    className={cn(
                      "relative flex flex-col rounded-2xl border p-6 transition-all duration-200",
                      isSelected ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "border-border bg-card hover:border-primary/30 hover:shadow-md",
                      tooSmall && "opacity-60"
                    )}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Package className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-foreground leading-tight">{tier.name}</h3>
                        {tier.description && <p className="text-xs text-muted-foreground mt-1">{tier.description}</p>}
                      </div>
                    </div>

                    {tooSmall ? (
                      <Button variant="outline" disabled className="w-full mt-auto gap-2">
                        <AlertTriangle className="w-4 h-4" /> Plano insuficiente
                      </Button>
                    ) : tier.is_enterprise ? (
                      <Button variant="outline" className="w-full mt-auto" onClick={() => navigate("/contato")}>
                        Fale conosco
                      </Button>
                    ) : (
                      <Button variant={isSelected ? "default" : "outline"} className="w-full mt-auto gap-2" onClick={() => handleSelectTier(tier.code)}>
                        Ver opções <ChevronRight className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── ETAPA 2: OFERTAS DA FAIXA ─── */}
        {selectedTier && !selectedTier.is_enterprise && (
          <section id="plan-detail" className="py-12 md:py-16 px-4 bg-background border-t border-border">
            <div className="max-w-4xl mx-auto">
              <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
                <button onClick={handleBack} className="hover:text-foreground transition-colors">Planos</button>
                <ChevronRight className="w-3 h-3" />
                <span className="text-foreground font-medium">{selectedTier.name}</span>
              </nav>

              <Button variant="ghost" size="sm" className="gap-2 mb-6 -ml-2" onClick={handleBack}>
                <ArrowLeft className="w-4 h-4" /> Voltar
              </Button>

              <h2 className="text-xl md:text-2xl font-bold text-foreground mb-2">{selectedTier.name}</h2>
              <p className="text-sm text-muted-foreground mb-10">As funcionalidades são as mesmas. Escolha apenas o período e a forma de pagamento.</p>

              {/* PRÉ-PAGO */}
              {oneTimeOffers.length > 0 && (
                <div className="mb-10">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <CreditCard className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground">Pagamento Antecipado (Pré-pago)</h3>
                      <p className="text-xs text-muted-foreground">Pague antecipado e use durante o período escolhido.</p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {oneTimeOffers.map(offer => (
                      <Card key={offer.id} className="border-border hover:border-primary/30 transition-all hover:shadow-md">
                        <CardContent className="p-5">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold text-foreground">{getPeriodLabel(offer.period_months)}</span>
                            {offer.badge_text && (
                              <Badge variant="secondary" className="bg-success/10 text-success border-success/20 text-[10px]">
                                <Tag className="w-3 h-3 mr-1" />{offer.badge_text}
                              </Badge>
                            )}
                          </div>
                          <div className="mb-4">
                            <span className="text-2xl font-bold text-foreground">{formatPriceBRL(offer.price_brl)}</span>
                            <span className="text-xs text-muted-foreground ml-1">{getPeriodSuffix(offer.period_months)}</span>
                          </div>
                          <Button className="w-full" disabled={checkoutLoading} onClick={() => handleOfferClick(offer)}>
                            Contratar
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* ASSINATURA RECORRENTE */}
              {recurringOffers.length > 0 && (
                <div className="mb-10">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-9 h-9 rounded-lg bg-accent/50 flex items-center justify-center">
                      <Repeat className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground">Assinatura Recorrente</h3>
                      <p className="text-xs text-muted-foreground">Cobrança automática. Cancele quando quiser.</p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {recurringOffers.map(offer => (
                      <Card key={offer.id} className="border-border hover:border-primary/30 transition-all hover:shadow-md">
                        <CardContent className="p-5">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold text-foreground">
                              Assinatura {getPeriodLabel(offer.period_months)}
                            </span>
                            {offer.badge_text && (
                              <Badge variant="secondary" className="bg-success/10 text-success border-success/20 text-[10px]">
                                <Tag className="w-3 h-3 mr-1" />{offer.badge_text}
                              </Badge>
                            )}
                          </div>
                          <div className="mb-4">
                            <span className="text-2xl font-bold text-foreground">{formatPriceBRL(offer.price_brl)}</span>
                            <span className="text-xs text-muted-foreground ml-1">/mês</span>
                          </div>
                          <Button className="w-full" variant="outline" disabled={checkoutLoading} onClick={() => handleOfferClick(offer)}>
                            Assinar
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center border-t border-border pt-6">
                O MKTP Fácil é o mesmo em qualquer plano. Você paga apenas pela capacidade mensal de pedidos.
              </p>
            </div>
          </section>
        )}

        {/* ─── COMPARATIVO ─── */}
        {!selectedTierCode && (
          <section className="py-12 md:py-16 px-4 bg-muted/30">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-xl md:text-2xl font-bold text-foreground text-center mb-8">Comparativo de funcionalidades</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-foreground">Funcionalidade</th>
                      {tiers.filter(t => !t.is_enterprise).map(tier => (
                        <th key={tier.code} className="text-center py-3 px-4 text-xs font-semibold text-foreground">
                          {tier.name.replace(" pedidos/mês", "")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {INCLUDED_FEATURES.map(feat => (
                      <tr key={feat.label} className="border-b border-border/50">
                        <td className="py-3 px-4 text-sm text-foreground">{feat.label}</td>
                        {tiers.filter(t => !t.is_enterprise).map(tier => (
                          <td key={tier.code} className="text-center py-3 px-4">
                            <CheckCircle className="w-5 h-5 text-success mx-auto" />
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-primary/5">
                      <td className="py-3 px-4 text-sm font-semibold text-foreground">Capacidade mensal</td>
                      {tiers.filter(t => !t.is_enterprise).map(tier => (
                        <td key={tier.code} className="text-center py-3 px-4 text-xs font-bold text-primary">
                          {tier.max_orders_30d ? `${tier.min_orders_30d}–${tier.max_orders_30d}` : `${tier.min_orders_30d}+`}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ─── ADD-ON ZPL FULL ─── */}
        {zplAddon && zplAddon.offers.length > 0 && (
          <section className="py-12 md:py-16 px-4 bg-background border-t border-border">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-xl md:text-2xl font-bold text-foreground text-center mb-2">
                <Printer className="w-5 h-5 inline-block mr-2" />
                Add-on {zplAddon.name}
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-8">
                {zplAddon.description || "Produto separado da camada de pedidos. Habilita impressão ZPL ilimitada."}
              </p>
              <Card className="border-border">
                <CardContent className="p-6">
                  {/* Pré-pago ZPL */}
                  {(() => {
                    const zplOneTime = zplAddon.offers.filter(o => o.billing_mode === "one_time");
                    if (zplOneTime.length === 0) return null;
                    return (
                      <div className="mb-5">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Pré-pago</p>
                        <div className="grid sm:grid-cols-3 gap-3">
                          {zplOneTime.sort((a, b) => a.period_months - b.period_months).map(offer => (
                            <Button key={offer.id} variant="outline" className="justify-between h-auto py-3" onClick={() => handleOfferClick(offer)} disabled={checkoutLoading}>
                              <span className="text-sm">{getPeriodLabel(offer.period_months)}</span>
                              <div className="flex flex-col items-end">
                                <span className="font-bold">{formatPriceBRL(offer.price_brl)}</span>
                                {offer.badge_text && <span className="text-[10px] text-success">{offer.badge_text}</span>}
                              </div>
                            </Button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Assinatura ZPL */}
                  {(() => {
                    const zplRecurring = zplAddon.offers.filter(o => o.billing_mode === "recurring");
                    if (zplRecurring.length === 0) return null;
                    return (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Assinatura Recorrente</p>
                        <div className="grid sm:grid-cols-3 gap-3">
                          {zplRecurring.sort((a, b) => a.period_months - b.period_months).map(offer => (
                            <Button key={offer.id} variant="outline" className="justify-between h-auto py-3" onClick={() => handleOfferClick(offer)} disabled={checkoutLoading}>
                              <span className="text-sm">{getPeriodLabel(offer.period_months)}</span>
                              <div className="flex flex-col items-end">
                                <span className="font-bold">{formatPriceBRL(offer.price_brl)}/mês</span>
                                {offer.badge_text && <span className="text-[10px] text-success">{offer.badge_text}</span>}
                              </div>
                            </Button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* ─── FAQ ─── */}
        <section className="py-12 md:py-16 px-4 bg-muted/30">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl md:text-2xl font-bold text-foreground text-center mb-8">Perguntas frequentes</h2>
            <div className="space-y-3">
              {FAQ_ITEMS.map((item, i) => (
                <button key={i} onClick={() => setExpandedFaq(expandedFaq === i ? null : i)} className="w-full text-left bg-card border border-border rounded-xl p-4 transition-colors hover:border-primary/30">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-medium text-foreground text-sm">{item.q}</h4>
                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform", expandedFaq === i && "rotate-180")} />
                  </div>
                  {expandedFaq === i && <p className="text-muted-foreground text-sm mt-2">{item.a}</p>}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA FINAL ─── */}
        <section className="py-12 md:py-16 px-4 bg-gradient-to-t from-primary/5 to-background">
          <div className="text-center max-w-xl mx-auto">
            {isAuthenticated && trialActive && (
              <Badge variant="secondary" className="mb-4 bg-success/10 text-success border-success/20">
                <CheckCircle className="w-3 h-3 mr-1" />
                Teste ativo • {flags?.trial_days_remaining || 0} dias restantes
              </Badge>
            )}
            {isAuthenticated && trialExpired && (
              <Badge variant="secondary" className="mb-4 bg-destructive/10 text-destructive border-destructive/20">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Teste expirado • Escolha um plano
              </Badge>
            )}
            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-2">Pronto para começar?</h2>
            <p className="text-muted-foreground mb-6 text-sm">Teste grátis por 14 dias. Cancele a qualquer momento.</p>
            <div className="flex items-center justify-center gap-3">
              <Button size="lg" className="h-12 text-base px-8" onClick={() => document.getElementById("camadas")?.scrollIntoView({ behavior: "smooth" })}>
                Escolher meu plano
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/")} className="h-12 text-base px-6 bg-background">
                Voltar ao início
              </Button>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
};

export default Planos;
