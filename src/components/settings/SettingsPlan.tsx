import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CreditCard,
  Clock,
  Lock,
  Sparkles,
  Zap,
  Crown,
  Star,
  AlertTriangle,
  FileText,
  Calendar,
  TrendingUp,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUserAccessState } from "@/hooks/useUserAccessState";
import { useUserSalesVolume } from "@/hooks/useUserSalesVolume";
import {
  useTierOffersCatalog,
  formatPriceBRL,
  getPeriodLabel,
  getPeriodSuffix,
  type PlanTier,
  type TierOffer,
} from "@/hooks/useTierOffers";
import { useCheckoutWithPayerEmail } from "@/hooks/useCheckoutWithPayerEmail";
import { MpPayerEmailDialog } from "@/components/billing/MpPayerEmailDialog";

const TIER_ICONS: Record<string, typeof Zap> = {
  volume_ate_50: Zap,
  volume_51_300: Zap,
  volume_301_700: Sparkles,
  volume_701_1500: TrendingUp,
  volume_1501_3000: Star,
  volume_acima_3000: Crown,
};

type BillingMode = "one_time" | "recurring";

const MODE_LABELS: Record<BillingMode, string> = {
  one_time: "Avulso (pré-pago)",
  recurring: "Assinatura",
};

// Filter out 12-month offers (campaign-only, not active now)
const MAX_VISIBLE_MONTHS = 6;

function getVisibleOffers(offers: TierOffer[]): TierOffer[] {
  return offers.filter((o) => o.period_months <= MAX_VISIBLE_MONTHS);
}

function getAvailableModes(offers: TierOffer[]): BillingMode[] {
  const modes = new Set(offers.map((o) => o.billing_mode));
  const result: BillingMode[] = [];
  if (modes.has("recurring")) result.push("recurring");
  if (modes.has("one_time")) result.push("one_time");
  return result;
}

function getOffersForMode(offers: TierOffer[], mode: BillingMode): TierOffer[] {
  return offers
    .filter((o) => o.billing_mode === mode)
    .sort((a, b) => a.period_months - b.period_months);
}

const SettingsPlan = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { flags, selectedPlan, trialActive, trialExpired, loading: userLoading } = useUserAccessState();
  const { totalSales30d } = useUserSalesVolume();
  const { data: catalog, isLoading: catalogLoading } = useTierOffersCatalog();
  const { startCheckout, dialogOpen, defaultEmail, confirmEmail, cancel, loading: checkoutLoading } = useCheckoutWithPayerEmail();

  // State: selected mode and offer per tier
  const [selectedModes, setSelectedModes] = useState<Record<string, BillingMode>>({});
  const [selectedOfferIds, setSelectedOfferIds] = useState<Record<string, string>>({});

  // Veterano support: invisible tier with hidden offers, only available for users with VETERANO tag
  const [userTag, setUserTag] = useState<string | null>(null);
  const [veteranoOffers, setVeteranoOffers] = useState<TierOffer[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('tag')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setUserTag(profile?.tag ?? null);

      if (profile?.tag === 'VETERANO') {
        const { data: offers } = await supabase
          .from('plan_offers')
          .select('id, offer_code, billing_mode, period_months, price_brl, badge_text, is_campaign, mp_product_ref')
          .eq('tier_id', 'f1e2d3c4-b5a6-7890-abcd-ef1234567890')
          .eq('is_active', true)
          .order('period_months');
        if (offers && !cancelled) {
          setVeteranoOffers(offers.map((o: any) => ({ ...o, price_brl: Number(o.price_brl) })) as TierOffer[]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isVeterano = userTag === 'VETERANO';

  const tiers = (() => {
    const base = catalog?.tiers ?? [];
    if (isVeterano) {
      return base.map((t) => (t.code === 'veterano' ? { ...t, offers: veteranoOffers } : t));
    }
    // Hide veterano tier from non-veteran users
    return base.filter((t) => t.code !== 'veterano');
  })();
  const trialDaysRemaining = flags?.trial_days_remaining ?? 0;
  const trialEndAt = flags?.trial_end_at;

  const formatDate = (date: string) => new Date(date).toLocaleDateString("pt-BR");
  const formatCurrency = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const isTooSmall = (tier: PlanTier): boolean => {
    if (tier.is_enterprise) return false;
    if (tier.code.startsWith('zpl')) return false; // ZPL plans have no volume limit
    if (totalSales30d <= 0) return false;
    if (tier.max_orders_30d === null) return false;
    return totalSales30d > tier.max_orders_30d;
  };

  const getRecommendedTierId = (): string | null => {
    if (totalSales30d <= 0) return null;
    const sorted = [...tiers].sort((a, b) => a.display_order - b.display_order);
    for (const t of sorted) {
      if (t.is_enterprise) continue;
      if (t.max_orders_30d === null || totalSales30d <= t.max_orders_30d) return t.id;
    }
    return sorted.find((t) => t.is_enterprise)?.id ?? null;
  };

  const recommendedTierId = getRecommendedTierId();

  const getActiveMode = (tier: PlanTier): BillingMode => {
    if (selectedModes[tier.id]) return selectedModes[tier.id];
    const visible = getVisibleOffers(tier.offers);
    const modes = getAvailableModes(visible);
    return modes[0] || "recurring";
  };

  const getSelectedOffer = (tier: PlanTier): TierOffer | null => {
    const visible = getVisibleOffers(tier.offers);
    const mode = getActiveMode(tier);
    const modeOffers = getOffersForMode(visible, mode);
    if (selectedOfferIds[tier.id]) {
      const found = modeOffers.find((o) => o.id === selectedOfferIds[tier.id]);
      if (found) return found;
    }
    return modeOffers[0] || null;
  };

  const handleModeChange = (tierId: string, mode: BillingMode) => {
    setSelectedModes((prev) => ({ ...prev, [tierId]: mode }));
    // Reset selected offer when mode changes
    setSelectedOfferIds((prev) => {
      const next = { ...prev };
      delete next[tierId];
      return next;
    });
  };

  const handleOfferSelect = (tierId: string, offerId: string) => {
    setSelectedOfferIds((prev) => ({ ...prev, [tierId]: offerId }));
  };

  const handleChoosePlan = async (tier: PlanTier) => {
    if (tier.is_enterprise) {
      navigate("/contato");
      return;
    }
    const offer = getSelectedOffer(tier);
    if (offer) {
      await startCheckout(offer);
    }
  };

  const getTierIcon = (tier: PlanTier) => TIER_ICONS[tier.code] || Zap;

  const formatOrderRange = (tier: PlanTier): string => {
    if (tier.is_enterprise) return "Acima de 3.000 vendas/mês";
    if (tier.code.startsWith('zpl')) return "Sem limite de vendas";
    if (tier.max_orders_30d === null) return `A partir de ${tier.min_orders_30d} vendas/mês`;
    if (tier.min_orders_30d === 0) return `Até ${tier.max_orders_30d} vendas/mês`;
    return `${tier.min_orders_30d} a ${tier.max_orders_30d} vendas/mês`;
  };

  const isLoading = catalogLoading || userLoading;

  return (
    <div className="space-y-6">
      {/* Trial Status Banner */}
      {(trialActive || trialExpired) && (
        <Card className={trialExpired 
          ? "border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800" 
          : "border-primary/30 bg-primary/5"
        }>
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              {trialExpired ? (
                <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0" />
              ) : (
                <Clock className="h-6 w-6 text-primary flex-shrink-0" />
              )}
              <div className="flex-1">
                <h3 className={`font-semibold text-lg ${trialExpired ? 'text-red-800 dark:text-red-200' : 'text-foreground'}`}>
                  {trialExpired 
                    ? t('settings:plan.trial_expired_title')
                    : t('settings:plan.trial_active_title')
                  }
                </h3>
                <p className={`text-sm mt-1 ${trialExpired ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground'}`}>
                  {trialExpired 
                    ? t('settings:plan.trial_expired_message')
                    : t('settings:plan.trial_active_message', { days: trialDaysRemaining })
                  }
                </p>
                {trialEndAt && !trialExpired && (
                  <div className="flex items-center gap-2 mt-3 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {t('settings:plan.trial_ends_at')}: <strong>{formatDate(trialEndAt)}</strong>
                    </span>
                  </div>
                )}
                {trialDaysRemaining > 0 && trialDaysRemaining <= 7 && (
                  <Badge variant="destructive" className="mt-3">
                    {t('settings:plan.trial_ending_soon')}
                  </Badge>
                )}
                {trialActive && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Você pode contratar um plano a qualquer momento, mesmo durante o teste.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Plan */}
      {selectedPlan && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  {t('settings:plan.current_plan')}: {selectedPlan.name}
                </CardTitle>
                <CardDescription>
                  {selectedPlan.billing_period === 'mensal' 
                    ? t('settings:plan.monthly_subscription')
                    : t('settings:plan.annual_subscription')
                  }
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-foreground">
                  {formatCurrency(selectedPlan.price_cents)}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{selectedPlan.billing_period === 'mensal' ? t('settings:plan.month') : t('settings:plan.year')}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className="bg-green-500/10 text-green-600 border-green-200 mt-1"
                >
                  {trialActive ? t('settings:plan.trial') : t('settings:plan.active')}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {trialActive 
                  ? t('settings:plan.payment_after_trial')
                  : t('settings:plan.auto_renew')
                }
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sales Volume Info */}
      {totalSales30d > 0 && (
        <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          <span>Seu volume consolidado: <strong className="text-foreground">{totalSales30d.toLocaleString("pt-BR")} vendas</strong> nos últimos 30 dias</span>
        </div>
      )}

      {/* Available Plans */}
      <div>
        <h3 className="text-lg font-medium mb-4">{t('settings:plan.available_plans')}</h3>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader className="text-center pb-2">
                  <Skeleton className="h-12 w-12 rounded-full mx-auto mb-2" />
                  <Skeleton className="h-5 w-24 mx-auto" />
                  <Skeleton className="h-4 w-32 mx-auto mt-2" />
                  <Skeleton className="h-8 w-20 mx-auto mt-4" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((j) => (
                      <Skeleton key={j} className="h-4 w-full" />
                    ))}
                  </div>
                  <Skeleton className="h-10 w-full mt-4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : tiers.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum plano disponível no momento.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tiers
              .sort((a, b) => a.display_order - b.display_order)
              .map((tier) => {
                const tooSmall = isTooSmall(tier);
                const isRecommended = tier.id === recommendedTierId;
                const TierIcon = getTierIcon(tier);
                const visibleOffers = getVisibleOffers(tier.offers);
                const availableModes = getAvailableModes(visibleOffers);
                const activeMode = getActiveMode(tier);
                const modeOffers = getOffersForMode(visibleOffers, activeMode);
                const selectedOffer = getSelectedOffer(tier);

                return (
                  <Card
                    key={tier.id}
                    className={`relative transition-all ${
                      isRecommended ? "border-primary ring-1 ring-primary shadow-lg" : ""
                    } ${tooSmall ? "opacity-60" : ""}`}
                  >
                    {isRecommended && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground">Recomendado</Badge>
                      </div>
                    )}
                    <CardHeader className="text-center pb-2">
                      <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                        <TierIcon className="h-6 w-6 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{tier.name}</CardTitle>
                      <CardDescription className="text-xs">{formatOrderRange(tier)}</CardDescription>

                      {/* Price display */}
                      <div className="pt-3">
                        {tier.is_enterprise ? (
                          <span className="text-lg font-semibold text-muted-foreground">Sob consulta</span>
                        ) : selectedOffer ? (
                          <div>
                            <span className="text-3xl font-bold text-foreground">
                              {formatPriceBRL(selectedOffer.price_brl)}
                            </span>
                            <span className="text-muted-foreground text-sm">
                              {getPeriodSuffix(selectedOffer.period_months)}
                            </span>
                            {selectedOffer.billing_mode === "recurring" && (
                              <div className="flex items-center justify-center gap-1 mt-1">
                                <RefreshCw className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Renovação automática</span>
                              </div>
                            )}
                            {selectedOffer.badge_text && (
                              <Badge variant="secondary" className="mt-2 text-xs bg-green-500/10 text-green-700 border-green-200">
                                {selectedOffer.badge_text}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>

                      {tier.description && (
                        <p className="text-xs text-muted-foreground mt-1">{tier.description}</p>
                      )}
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {/* Billing mode toggle */}
                      {!tier.is_enterprise && availableModes.length > 1 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground text-left">Tipo de cobrança</p>
                          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                            {availableModes.map((mode) => (
                              <button
                                key={mode}
                                onClick={() => handleModeChange(tier.id, mode)}
                                className={`rounded-md px-2 py-1.5 text-xs font-medium transition-all ${
                                  activeMode === mode
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                {MODE_LABELS[mode]}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Period selector */}
                      {!tier.is_enterprise && modeOffers.length > 1 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground text-left">Período</p>
                          <div className="flex flex-wrap gap-1.5">
                            {modeOffers.map((offer) => {
                              const isSelected = selectedOffer?.id === offer.id;
                              return (
                                <button
                                  key={offer.id}
                                  onClick={() => handleOfferSelect(tier.id, offer.id)}
                                  className={`flex flex-col items-center gap-0.5 rounded-md border px-3 py-2 text-xs font-medium transition-all ${
                                    isSelected
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                                  }`}
                                >
                                  <span>{getPeriodLabel(offer.period_months)}</span>
                                  {offer.badge_text && (
                                    <span className="text-[9px] leading-tight bg-green-600 text-white px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                      {offer.badge_text}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Single offer label when only one option */}
                      {!tier.is_enterprise && modeOffers.length === 1 && availableModes.length <= 1 && selectedOffer && (
                        <div className="text-xs text-muted-foreground text-center">
                          {MODE_LABELS[selectedOffer.billing_mode]} · {getPeriodLabel(selectedOffer.period_months)}
                        </div>
                      )}

                      {/* Volume warning */}
                      {tooSmall && (
                        <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                            <p className="text-[11px] leading-tight text-destructive">
                              Seu volume ({totalSales30d.toLocaleString("pt-BR")} vendas) excede o limite deste plano.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Action button */}
                      <TooltipProvider>
                        {tooSmall ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button className="w-full" variant="outline" disabled>
                                <Lock className="h-4 w-4 mr-2" />
                                Volume acima do limite
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Seu volume de vendas ({totalSales30d.toLocaleString("pt-BR")}) excede o limite deste plano.</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : tier.is_enterprise ? (
                          <Button
                            className="w-full"
                            variant="outline"
                            onClick={() => navigate("/contato")}
                          >
                            <MessageCircle className="h-4 w-4 mr-2" />
                            Fale conosco
                          </Button>
                        ) : !selectedOffer ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button className="w-full" variant="outline" disabled>
                                <Lock className="h-4 w-4 mr-2" />
                                Indisponível
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Sem oferta configurada para este plano. Contate o suporte.</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button
                            className="w-full"
                            variant={isRecommended ? "default" : "outline"}
                            disabled={checkoutLoading}
                            onClick={() => handleChoosePlan(tier)}
                          >
                            {checkoutLoading ? "Processando..." : t('settings:plan.choose_plan')}
                          </Button>
                        )}
                      </TooltipProvider>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        )}
      </div>

      <Separator />

      {/* Invoices Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            {t('settings:plan.invoices')}
          </CardTitle>
          <CardDescription>
            {t('settings:plan.invoices_description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {t('settings:plan.no_invoices')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('settings:plan.invoices_available_after_payment')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cancel Subscription Warning */}
      {selectedPlan && !trialActive && (
        <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-red-800 dark:text-red-200">
                  {t('settings:plan.cancel_subscription')}
                </h4>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  {t('settings:plan.cancel_warning')}
                </p>
                <Button variant="outline" size="sm" className="mt-3 text-red-600 border-red-300">
                  {t('settings:plan.cancel_subscription')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SettingsPlan;
