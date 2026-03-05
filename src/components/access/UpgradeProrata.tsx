import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Calculator } from 'lucide-react';
import type { ProrataCalculation } from '@/hooks/useTenantLimits';

interface UpgradeProrataProps {
  planId: string;
  planName: string;
  planPriceCents: number;
  calculateProrata: (planId: string) => Promise<ProrataCalculation | null>;
  onConfirmUpgrade: (planId: string) => Promise<boolean>;
}

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function UpgradeProrata({ planId, planName, planPriceCents, calculateProrata, onConfirmUpgrade }: UpgradeProrataProps) {
  const [prorata, setProrata] = useState<ProrataCalculation | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    setLoading(true);
    calculateProrata(planId).then(result => {
      setProrata(result);
      setLoading(false);
    });
  }, [planId, calculateProrata]);

  const handleUpgrade = async () => {
    setUpgrading(true);
    await onConfirmUpgrade(planId);
    setUpgrading(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!prorata) return null;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calculator className="h-5 w-5" />
          Upgrade para {planName}
        </CardTitle>
        <CardDescription>
          Cálculo proporcional para o período restante
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dias restantes no ciclo</span>
            <span className="font-medium">{prorata.days_remaining} de {prorata.days_total} dias</span>
          </div>
          {prorata.current_plan_price_cents != null && prorata.current_plan_price_cents > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Crédito do plano atual</span>
              <span className="font-medium text-green-600">-{formatCents(prorata.credit_cents)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Valor proporcional novo plano</span>
            <span className="font-medium">{formatCents(prorata.prorata_amount_cents)}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-base font-semibold">
            <span>Valor a pagar agora</span>
            <span className="text-primary">{formatCents(prorata.charge_cents)}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Na próxima renovação, o valor será {formatCents(prorata.new_plan_price_cents)}/mês.
        </p>

        <Button className="w-full gap-2" onClick={handleUpgrade} disabled={upgrading}>
          {upgrading ? 'Processando...' : (
            <>
              Confirmar upgrade <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
