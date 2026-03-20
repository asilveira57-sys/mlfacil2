import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { TenantLimitCheck } from '@/hooks/useTenantLimits';

interface PlanLimitBannerProps {
  limitCheck: TenantLimitCheck;
  compact?: boolean;
}

export function PlanLimitBanner({ limitCheck, compact = false }: PlanLimitBannerProps) {
  const navigate = useNavigate();
  const { usage_percent, exceeds_limit, total_sales_30d, plan_max_sales, plan_name } = limitCheck;

  // Show nothing if usage is below 80%
  if (usage_percent < 80 && !exceeds_limit) return null;

  const isWarning = usage_percent >= 80 && !exceeds_limit;
  const isCritical = exceeds_limit;

  if (compact) {
    return (
      <Alert className={isCritical ? 'border-destructive/50 bg-destructive/10' : 'border-warning/50 bg-warning/10'}>
        {isCritical ? <AlertTriangle className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
        <AlertDescription className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-sm">
            {isCritical
              ? `Limite excedido: ${total_sales_30d}/${plan_max_sales} vendas (${plan_name})`
              : `${usage_percent.toFixed(0)}% do limite: ${total_sales_30d}/${plan_max_sales} vendas`
            }
          </span>
          <Button size="sm" variant={isCritical ? 'destructive' : 'outline'} onClick={() => navigate('/settings?section=plano')}>
            {isCritical ? 'Fazer upgrade' : 'Ver planos'}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className={isCritical ? 'border-destructive/50 bg-destructive/10' : 'border-warning/50 bg-warning/10'}>
      {isCritical ? <AlertTriangle className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
      <AlertDescription className="space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-medium text-sm">
              {isCritical
                ? 'Limite do plano excedido'
                : 'Você está se aproximando do limite do plano'
              }
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {total_sales_30d} de {plan_max_sales} vendas nos últimos 30 dias
              {limitCheck.accounts_count > 1 && ` (${limitCheck.accounts_count} contas somadas)`}
            </p>
          </div>
          <Button size="sm" variant={isCritical ? 'destructive' : 'outline'} onClick={() => navigate('/settings?section=plano')}>
            {isCritical ? 'Fazer upgrade agora' : 'Ver planos'}
          </Button>
        </div>
        <Progress value={Math.min(usage_percent, 100)} className="h-2" />
        {isCritical && (
          <p className="text-xs text-destructive">
            Sincronizações pesadas e novas contas estão bloqueadas até o upgrade.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
