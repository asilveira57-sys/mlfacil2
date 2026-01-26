import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Calculator, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2,
  Info,
  ArrowRight,
  DollarSign,
  Package,
  Target,
  Percent,
  RefreshCw,
} from 'lucide-react';
import { useAdsBudgetSimulator, SimulationInput, SimulationResult } from '@/hooks/useAdsBudgetSimulator';
import { cn } from '@/lib/utils';

interface AdsBudgetSimulatorProps {
  sellerId: string;
}

export function AdsBudgetSimulator({ sellerId }: AdsBudgetSimulatorProps) {
  const { simulate, result, loading, clearResult, targets, loadTargets, loadingTargets } = useAdsBudgetSimulator(sellerId);
  
  const [targetType, setTargetType] = useState<SimulationInput['targetType']>('global');
  const [targetId, setTargetId] = useState<string>('');
  const [budgetChange, setBudgetChange] = useState<number>(0);
  const [period, setPeriod] = useState<SimulationInput['period']>(14);

  useEffect(() => {
    loadTargets();
  }, [loadTargets]);

  const handleSimulate = async () => {
    await simulate({
      targetType,
      targetId: targetType !== 'global' ? targetId : undefined,
      budgetChangePercent: budgetChange,
      period,
    });
  };

  const handleReset = () => {
    setBudgetChange(0);
    clearResult();
  };

  const filteredTargets = targets.filter(t => 
    targetType === 'campaign' ? t.type === 'campaign' : t.type === 'item'
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatPercent = (value: number) => {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Simulator Input Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Simulador de Orçamento</CardTitle>
          </div>
          <CardDescription>
            Projete cenários antes de alterar seu investimento em publicidade
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Target Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Escopo da Simulação</Label>
              <Select 
                value={targetType} 
                onValueChange={(v) => {
                  setTargetType(v as SimulationInput['targetType']);
                  setTargetId('');
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Todo o Investimento</SelectItem>
                  <SelectItem value="campaign">Campanha Específica</SelectItem>
                  <SelectItem value="item">Produto Específico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {targetType !== 'global' && (
              <div className="space-y-2">
                <Label>{targetType === 'campaign' ? 'Campanha' : 'Produto'}</Label>
                {loadingTargets ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select value={targetId} onValueChange={setTargetId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredTargets.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Período Base</Label>
              <Select 
                value={period.toString()} 
                onValueChange={(v) => setPeriod(Number(v) as SimulationInput['period'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="14">Últimos 14 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Budget Change Slider */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Ajuste de Orçamento</Label>
              <Badge 
                variant={budgetChange === 0 ? 'secondary' : budgetChange > 0 ? 'default' : 'outline'}
                className={cn(
                  'text-base font-bold min-w-[80px] justify-center',
                  budgetChange > 0 && 'bg-success text-success-foreground',
                  budgetChange < 0 && 'bg-warning text-warning-foreground'
                )}
              >
                {budgetChange > 0 ? '+' : ''}{budgetChange}%
              </Badge>
            </div>
            
            <Slider
              value={[budgetChange]}
              onValueChange={([v]) => setBudgetChange(v)}
              min={-80}
              max={200}
              step={5}
              className="w-full"
            />

            <div className="flex justify-between text-xs text-muted-foreground">
              <span>-80%</span>
              <span>0%</span>
              <span>+100%</span>
              <span>+200%</span>
            </div>

            {/* Quick Buttons */}
            <div className="flex gap-2 flex-wrap">
              {[-50, -25, 0, 25, 50, 100].map(val => (
                <Button
                  key={val}
                  variant={budgetChange === val ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBudgetChange(val)}
                >
                  {val > 0 ? '+' : ''}{val}%
                </Button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button 
              onClick={handleSimulate} 
              disabled={loading || (targetType !== 'global' && !targetId)}
              className="flex-1"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Calculando...
                </>
              ) : (
                <>
                  <Calculator className="h-4 w-4 mr-2" />
                  Simular Cenário
                </>
              )}
            </Button>
            <Button variant="outline" onClick={handleReset}>
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && <SimulationResults result={result} budgetChange={budgetChange} />}
    </div>
  );
}

// Simulation Results Component
interface SimulationResultsProps {
  result: SimulationResult;
  budgetChange: number;
}

function SimulationResults({ result, budgetChange }: SimulationResultsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('pt-BR').format(Math.round(value));
  };

  const AssessmentIcon = {
    safe: CheckCircle2,
    moderate: Info,
    risky: AlertTriangle,
  }[result.assessment.level];

  const assessmentColor = {
    safe: 'text-success',
    moderate: 'text-warning',
    risky: 'text-destructive',
  }[result.assessment.level];

  const assessmentBg = {
    safe: 'bg-success/10 border-success/20',
    moderate: 'bg-warning/10 border-warning/20',
    risky: 'bg-destructive/10 border-destructive/20',
  }[result.assessment.level];

  return (
    <div className="space-y-6">
      {/* Assessment Banner */}
      <Card className={cn('border', assessmentBg)}>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AssessmentIcon className={cn('h-5 w-5 mt-0.5', assessmentColor)} />
            <div className="flex-1">
              <p className={cn('font-medium', assessmentColor)}>
                {result.assessment.level === 'safe' && 'Cenário Seguro'}
                {result.assessment.level === 'moderate' && 'Cenário Moderado'}
                {result.assessment.level === 'risky' && 'Cenário de Risco'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {result.assessment.message}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Historical */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Performance Atual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <MetricRow 
              icon={DollarSign} 
              label="Gasto" 
              value={formatCurrency(result.historical.spent)} 
            />
            <MetricRow 
              icon={TrendingUp} 
              label="Receita" 
              value={formatCurrency(result.historical.revenue)} 
            />
            <MetricRow 
              icon={Target} 
              label="ACOS" 
              value={`${result.historical.acos.toFixed(1)}%`} 
            />
            <MetricRow 
              icon={Percent} 
              label="ROAS" 
              value={`${result.historical.roas.toFixed(2)}x`} 
            />
            <Separator />
            <MetricRow 
              icon={DollarSign} 
              label="Margem" 
              value={formatCurrency(result.historical.margin)}
              valueClass={result.historical.margin >= 0 ? 'text-success' : 'text-destructive'}
            />
            <MetricRow 
              icon={Package} 
              label="Estoque Consumido" 
              value={`${formatNumber(result.historical.stockConsumed)} un`} 
            />
          </CardContent>
        </Card>

        {/* Projected */}
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Projeção ({budgetChange > 0 ? '+' : ''}{budgetChange}%)
              </CardTitle>
              <ArrowRight className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <MetricRow 
              icon={DollarSign} 
              label="Gasto" 
              value={formatCurrency(result.projected.spent)}
              delta={result.delta.spent}
              deltaPercent={result.percentChange.spent}
            />
            <MetricRow 
              icon={TrendingUp} 
              label="Receita" 
              value={formatCurrency(result.projected.revenue)}
              delta={result.delta.revenue}
              deltaPercent={result.percentChange.revenue}
            />
            <MetricRow 
              icon={Target} 
              label="ACOS" 
              value={`${result.projected.acos.toFixed(1)}%`}
              delta={result.projected.acos - result.historical.acos}
              invertColor
            />
            <MetricRow 
              icon={Percent} 
              label="ROAS" 
              value={`${result.projected.roas.toFixed(2)}x`}
              delta={result.projected.roas - result.historical.roas}
            />
            <Separator />
            <MetricRow 
              icon={DollarSign} 
              label="Margem" 
              value={formatCurrency(result.projected.margin)}
              delta={result.delta.margin}
              deltaPercent={result.percentChange.margin}
              valueClass={result.projected.margin >= 0 ? 'text-success' : 'text-destructive'}
            />
            <MetricRow 
              icon={Package} 
              label="Estoque Consumido" 
              value={`${formatNumber(result.projected.stockConsumed)} un`}
              delta={result.delta.stockConsumed}
              deltaPercent={result.percentChange.stockConsumed}
            />
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      {result.assessment.recommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recomendações</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {result.assessment.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-muted-foreground">•</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground text-center">
        ⚠️ Esta é uma projeção baseada em dados históricos. Resultados reais podem variar 
        devido a sazonalidade, concorrência e outros fatores de mercado.
      </p>
    </div>
  );
}

// Metric Row Component
interface MetricRowProps {
  icon: React.ElementType;
  label: string;
  value: string;
  delta?: number;
  deltaPercent?: number;
  valueClass?: string;
  invertColor?: boolean;
}

function MetricRow({ 
  icon: Icon, 
  label, 
  value, 
  delta, 
  deltaPercent,
  valueClass,
  invertColor = false,
}: MetricRowProps) {
  const showDelta = delta !== undefined && delta !== 0;
  const isPositive = invertColor ? delta! < 0 : delta! > 0;

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="flex items-center gap-2">
        <span className={cn('font-medium', valueClass)}>{value}</span>
        {showDelta && (
          <Badge 
            variant="outline" 
            className={cn(
              'text-xs',
              isPositive ? 'text-success border-success/30' : 'text-destructive border-destructive/30'
            )}
          >
            {isPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
            {deltaPercent !== undefined 
              ? `${deltaPercent > 0 ? '+' : ''}${deltaPercent.toFixed(0)}%`
              : `${delta! > 0 ? '+' : ''}${delta!.toFixed(0)}`
            }
          </Badge>
        )}
      </div>
    </div>
  );
}
