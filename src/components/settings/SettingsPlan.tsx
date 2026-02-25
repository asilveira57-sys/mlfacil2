import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CreditCard,
  CheckCircle2,
  Clock,
  XCircle,
  Sparkles,
  Zap,
  Crown,
  Download,
  AlertTriangle,
  FileText,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserAccessState } from "@/hooks/useUserAccessState";
import { useUserSalesVolume, isPlanTooSmall } from "@/hooks/useUserSalesVolume";

interface Plan {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  features: string[];
  sort_order: number;
  prices: PlanPrice[];
}

interface PlanPrice {
  id: string;
  plan_id: string;
  mode: string;
  period: string;
  price_cents: number;
  currency: string;
  recurring: boolean;
  badge_text: string | null;
  is_campaign: boolean;
  mp_checkout_url: string | null;
}

interface Invoice {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: "paid" | "pending" | "failed";
  invoice_url?: string;
}

const SettingsPlan = () => {
  const { t } = useTranslation();
  const { flags, selectedPlan, trialActive, trialExpired, loading: userLoading } = useUserAccessState();
  const { totalSales30d, accountBreakdown } = useUserSalesVolume();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);

  // Fetch plans from database
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        // Fetch plans
        const { data: plansData, error: plansError } = await supabase
          .from('plans')
          .select('id, name, slug, category, description, features, sort_order')
          .eq('active', true)
          .eq('category', 'volume') // Only volume plans for main display
          .order('sort_order');

        if (plansError) throw plansError;

        // Fetch prices
        const { data: pricesData, error: pricesError } = await supabase
          .from('plan_prices')
          .select('id, plan_id, mode, period, price_cents, currency, recurring, badge_text, is_campaign, mp_checkout_url')
          .eq('visible', true);

        if (pricesError) throw pricesError;

        // Combine plans with prices
        const plansWithPrices: Plan[] = (plansData || []).map(plan => ({
          ...plan,
          features: Array.isArray(plan.features) 
            ? (plan.features as unknown as string[])
            : [],
          prices: (pricesData || []).filter(p => p.plan_id === plan.id).map(p => ({
            ...p,
            badge_text: p.badge_text || null,
            mp_checkout_url: p.mp_checkout_url || null,
          })),
        }));

        setPlans(plansWithPrices);
      } catch (error) {
        console.error('[SettingsPlan] Error fetching plans:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  // Fetch invoices (placeholder - will integrate with Olist)
  useEffect(() => {
    const fetchInvoices = async () => {
      // TODO: Integrate with Olist for real invoices
      // For now, show placeholder data
      setInvoices([]);
      setInvoicesLoading(false);
    };

    fetchInvoices();
  }, []);

  const formatCurrency = (cents: number) => {
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("pt-BR");
  };

  const getStatusBadge = (status: Invoice["status"]) => {
    switch (status) {
      case "paid":
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {t('settings:plan.paid')}
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200">
            <Clock className="h-3 w-3 mr-1" />
            {t('settings:plan.pending')}
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-200">
            <XCircle className="h-3 w-3 mr-1" />
            {t('settings:plan.failed')}
          </Badge>
        );
    }
  };

  const getPlanIcon = (index: number) => {
    const icons = [Zap, Sparkles, TrendingUp, Crown, Crown, Crown];
    return icons[Math.min(index, icons.length - 1)];
  };

  const getMonthlyPrice = (plan: Plan) => {
    const monthlyPrice = plan.prices.find(p => p.mode === 'assinatura' && p.period === 'mensal');
    return monthlyPrice?.price_cents || 0;
  };

  const isCurrentPlan = (planId: string) => {
    return selectedPlan?.id === planId;
  };

  // Trial days remaining
  const trialDaysRemaining = flags?.trial_days_remaining ?? 0;
  const trialEndAt = flags?.trial_end_at;

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
                {trialDaysRemaining > 0 && trialDaysRemaining <= 3 && (
                  <Badge variant="destructive" className="mt-3">
                    {t('settings:plan.trial_ending_soon')}
                  </Badge>
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

      {/* Available Plans */}
      <div>
        <h3 className="text-lg font-medium mb-4">{t('settings:plan.available_plans')}</h3>
        {loading ? (
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
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.slice(0, 6).map((plan, index) => {
              const PlanIcon = getPlanIcon(index);
              const monthlyPrice = getMonthlyPrice(plan);
              const isCurrent = isCurrentPlan(plan.id);
              const isPopular = index === 1;
              const tooSmall = isPlanTooSmall(plan.slug, totalSales30d);

              return (
                <Card
                  key={plan.id}
                  className={`relative ${isCurrent ? "border-primary ring-1 ring-primary" : ""} ${
                    isPopular ? "shadow-lg" : ""
                  } ${tooSmall ? "opacity-60" : ""}`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground">
                        {t('settings:plan.most_popular')}
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="text-center pb-2">
                    <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                      <PlanIcon className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <CardDescription className="text-xs">{plan.description}</CardDescription>
                    <div className="pt-2">
                      <span className="text-3xl font-bold">{formatCurrency(monthlyPrice)}</span>
                      <span className="text-muted-foreground">/{t('settings:plan.month')}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-2">
                      {plan.features.slice(0, 5).map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {tooSmall && (
                      <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                          <p className="text-[11px] leading-tight text-destructive">
                            Seu volume ({totalSales30d} vendas) excede este plano. Deslogue contas para contratar.
                          </p>
                        </div>
                      </div>
                    )}

                    <Button
                      className="w-full"
                      variant={isCurrent ? "outline" : "default"}
                      disabled={isCurrent || tooSmall}
                    >
                      {isCurrent 
                        ? t('settings:plan.current') 
                        : tooSmall 
                          ? 'Plano insuficiente'
                          : t('settings:plan.choose_plan')
                      }
                    </Button>
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
          {invoicesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                {t('settings:plan.no_invoices')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('settings:plan.invoices_available_after_payment')}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('settings:plan.date')}</TableHead>
                  <TableHead>{t('settings:plan.description')}</TableHead>
                  <TableHead>{t('settings:plan.amount')}</TableHead>
                  <TableHead>{t('settings:plan.status')}</TableHead>
                  <TableHead className="text-right">{t('settings:plan.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{formatDate(invoice.date)}</TableCell>
                    <TableCell>{invoice.description}</TableCell>
                    <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                    <TableCell className="text-right">
                      {invoice.status === "paid" && invoice.invoice_url && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={invoice.invoice_url} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
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
