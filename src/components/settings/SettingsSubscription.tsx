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
  CheckCircle2,
  Clock,
  Lock,
  Sparkles,
  Zap,
  Crown,
  Star,
  AlertTriangle,
  MessageCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTierOffersCatalog, formatPriceBRL, type PlanTier } from "@/hooks/useTierOffers";
import { useUserSalesVolume } from "@/hooks/useUserSalesVolume";
import { useCheckoutWithPayerEmail } from "@/hooks/useCheckoutWithPayerEmail";
import { MpPayerEmailDialog } from "@/components/billing/MpPayerEmailDialog";
import { useUserAccess } from "@/contexts/UserAccessContext";

const TIER_ICONS: Record<string, typeof Zap> = {
  volume_ate_50: Zap,
  volume_51_300: Zap,
  volume_301_700: Sparkles,
  volume_701_1500: Sparkles,
  volume_1501_3000: Star,
  volume_acima_3000: Crown,
};

const SettingsSubscription = () => {
  const navigate = useNavigate();
  const { data: catalog, isLoading: catalogLoading } = useTierOffersCatalog();
  const { totalSales30d, loading: salesLoading } = useUserSalesVolume();
  const { startCheckout, dialogOpen, defaultEmail, confirmEmail, cancel, loading: checkoutLoading } = useCheckoutWithPayerEmail();
  const { trialActive, trialExpired, flags } = useUserAccess();

  const tiers = catalog?.tiers ?? [];
  const hasActiveSub = flags?.has_active_subscription ?? false;
  const trialDaysRemaining = flags?.trial_days_remaining ?? 0;

  const getRecommendedTier = (tiers: PlanTier[]): string | null => {
    if (totalSales30d <= 0) return null;
    const sorted = [...tiers].sort((a, b) => a.display_order - b.display_order);
    for (const t of sorted) {
      if (t.is_enterprise) continue;
      if (t.max_orders_30d === null || totalSales30d <= t.max_orders_30d) return t.id;
    }
    return sorted.find(t => t.is_enterprise)?.id ?? null;
  };

  const isTooSmall = (tier: PlanTier): boolean => {
    if (tier.is_enterprise) return false;
    if (tier.code.startsWith('zpl')) return false; // ZPL plans have no volume limit
    if (totalSales30d <= 0) return false;
    if (tier.max_orders_30d === null) return false;
    return totalSales30d > tier.max_orders_30d;
  };

  const recommendedTierId = getRecommendedTier(tiers);

  const getCheapestOffer = (tier: PlanTier) => {
    if (!tier.offers || tier.offers.length === 0) return null;
    return [...tier.offers].sort((a, b) => a.price_brl - b.price_brl)[0];
  };

  const handleChoosePlan = async (tier: PlanTier) => {
    if (tier.is_enterprise) {
      navigate("/contato");
      return;
    }
    const offer = getCheapestOffer(tier);
    if (offer) {
      await checkout(offer.id);
    }
  };

  const getTierIcon = (tier: PlanTier) => {
    return TIER_ICONS[tier.code] || Zap;
  };

  const formatOrderRange = (tier: PlanTier): string => {
    if (tier.is_enterprise) return "Acima de 3.000 vendas/mês";
    if (tier.code.startsWith('zpl')) return "Sem limite de vendas";
    if (tier.max_orders_30d === null) return `A partir de ${tier.min_orders_30d} vendas/mês`;
    if (tier.min_orders_30d === 0) return `Até ${tier.max_orders_30d} vendas/mês`;
    return `${tier.min_orders_30d} a ${tier.max_orders_30d} vendas/mês`;
  };

  const isLoading = catalogLoading || salesLoading;

  return (
    <div className="space-y-6">
      {/* Current Plan Status */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Plano Atual
              </CardTitle>
              <CardDescription>Status da sua assinatura</CardDescription>
            </div>
            <div className="text-right">
              {trialActive && (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                  <Clock className="h-3 w-3 mr-1" />
                  Teste ativo — {trialDaysRemaining} dias restantes
                </Badge>
              )}
              {trialExpired && !hasActiveSub && (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Teste expirado
                </Badge>
              )}
              {hasActiveSub && (
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Assinatura ativa
                </Badge>
              )}
              {!trialActive && !trialExpired && !hasActiveSub && (
                <Badge variant="outline" className="text-muted-foreground">
                  Nenhum plano ativo
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {trialActive && (
            <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-lg border border-primary/10">
              <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Período de teste gratuito</p>
                <p className="text-xs text-muted-foreground">
                  Você pode contratar um plano a qualquer momento. Escolha abaixo o plano ideal para o seu volume de vendas.
                </p>
              </div>
            </div>
          )}
          {trialExpired && !hasActiveSub && (
            <div className="flex items-center gap-3 p-4 bg-destructive/5 rounded-lg border border-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Seu período de teste expirou</p>
                <p className="text-xs text-muted-foreground">
                  Escolha um plano abaixo para continuar utilizando todas as funcionalidades.
                </p>
              </div>
            </div>
          )}
          {!trialActive && !trialExpired && !hasActiveSub && (
            <p className="text-sm text-muted-foreground">
              Nenhum plano ou teste ativo. Escolha um plano abaixo para começar.
            </p>
          )}

          {totalSales30d > 0 && (
            <>
              <Separator className="my-4" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Volume de vendas (últimos 30 dias)</span>
                <span className="font-semibold">{totalSales30d.toLocaleString("pt-BR")} vendas</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Available Plans */}
      <div>
        <h3 className="text-lg font-medium mb-4">Planos disponíveis</h3>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader className="text-center pb-2">
                  <Skeleton className="h-12 w-12 rounded-full mx-auto mb-2" />
                  <Skeleton className="h-5 w-32 mx-auto" />
                  <Skeleton className="h-4 w-24 mx-auto mt-1" />
                  <Skeleton className="h-8 w-28 mx-auto mt-2" />
                </CardHeader>
                <CardContent>
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
                const cheapest = getCheapestOffer(tier);
                const TierIcon = getTierIcon(tier);

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
                      <CardDescription>{formatOrderRange(tier)}</CardDescription>
                      <div className="pt-2">
                        {tier.is_enterprise ? (
                          <span className="text-lg font-semibold text-muted-foreground">Sob consulta</span>
                        ) : cheapest ? (
                          <>
                            <span className="text-3xl font-bold">{formatPriceBRL(cheapest.price_brl)}</span>
                            <span className="text-muted-foreground text-sm">
                              {cheapest.period_months === 1 ? "/mês" : `/${cheapest.period_months}m`}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                      {tier.description && (
                        <p className="text-xs text-muted-foreground mt-1">{tier.description}</p>
                      )}
                    </CardHeader>
                    <CardContent>
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
                        ) : (
                          <Button
                            className="w-full"
                            variant={isRecommended ? "default" : "outline"}
                            disabled={checkoutLoading}
                            onClick={() => handleChoosePlan(tier)}
                          >
                            {checkoutLoading ? "Processando..." : "Escolher plano"}
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

      {/* Payment History - placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de pagamentos</CardTitle>
          <CardDescription>Todos os pagamentos realizados na sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground text-sm">
            Nenhum pagamento registrado.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsSubscription;
