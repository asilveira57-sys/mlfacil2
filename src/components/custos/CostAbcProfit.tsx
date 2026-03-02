import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, TrendingUp, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';

interface CostAbcProfitProps {
  sellerId: string;
}

interface AbcItem {
  product_key: string;
  display_name: string | null;
  value_total: number;
  percent: number;
  cumulative_percent: number;
  class: 'A' | 'B' | 'C';
  quantity_total?: number;
  margin_percent?: number;
}

export function CostAbcProfit({ sellerId }: CostAbcProfitProps) {
  const [items, setItems] = useState<AbcItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [periodDays, setPeriodDays] = useState('30');
  const [metric, setMetric] = useState<'profit' | 'revenue'>('profit');

  const loadAbc = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const params = new URLSearchParams({
        seller_id: sellerId,
        period_days: periodDays,
        metric,
      });

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/abc?${params}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setItems(data.data || []);
      }
    } catch (error) {
      console.error('Error loading ABC:', error);
      toast.error('Erro ao carregar curva ABC');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sellerId) {
      loadAbc();
    }
  }, [sellerId, periodDays, metric]);

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/abc/calculate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ seller_id: sellerId, period_days: parseInt(periodDays) }),
        }
      );

      if (response.ok) {
        toast.success('Cálculo ABC iniciado');
        setTimeout(() => {
          loadAbc();
          setCalculating(false);
        }, 3000);
      }
    } catch (error) {
      toast.error('Erro ao calcular ABC');
      setCalculating(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getClassColor = (cls: string) => {
    switch (cls) {
      case 'A': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'B': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'C': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return '';
    }
  };

  const countByClass = (cls: string) => items.filter(i => i.class === cls).length;
  const sumByClass = (cls: string) => items.filter(i => i.class === cls).reduce((sum, i) => sum + i.value_total, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Curva ABC por {metric === 'profit' ? 'Lucro' : 'Faturamento'}
            </span>
            <div className="flex items-center gap-2">
              <Select value={periodDays} onValueChange={setPeriodDays}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                </SelectContent>
              </Select>

              <Select value={metric} onValueChange={(v: 'profit' | 'revenue') => setMetric(v)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="profit">Por Lucro</SelectItem>
                  <SelectItem value="revenue">Por Faturamento</SelectItem>
                </SelectContent>
              </Select>

              <Button onClick={handleCalculate} disabled={calculating}>
                <RefreshCw className={`h-4 w-4 mr-2 ${calculating ? 'animate-spin' : ''}`} />
                {calculating ? 'Calculando...' : 'Atualizar ABC'}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length > 0 && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                <CardContent className="pt-4">
                  <div className="text-center">
                    <Badge className={getClassColor('A')}>Classe A</Badge>
                    <p className="text-2xl font-bold mt-2">{countByClass('A')} produtos</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(sumByClass('A'))} ({((sumByClass('A') / items.reduce((s, i) => s + i.value_total, 0)) * 100).toFixed(0)}%)
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
                <CardContent className="pt-4">
                  <div className="text-center">
                    <Badge className={getClassColor('B')}>Classe B</Badge>
                    <p className="text-2xl font-bold mt-2">{countByClass('B')} produtos</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(sumByClass('B'))} ({((sumByClass('B') / items.reduce((s, i) => s + i.value_total, 0)) * 100).toFixed(0)}%)
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800">
                <CardContent className="pt-4">
                  <div className="text-center">
                    <Badge className={getClassColor('C')}>Classe C</Badge>
                    <p className="text-2xl font-bold mt-2">{countByClass('C')} produtos</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(sumByClass('C'))} ({((sumByClass('C') / items.reduce((s, i) => s + i.value_total, 0)) * 100).toFixed(0)}%)
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">
                Nenhum dado ABC disponível. Clique em "Atualizar ABC" para calcular.
              </p>
              <Button onClick={handleCalculate} disabled={calculating}>
                <RefreshCw className={`h-4 w-4 mr-2 ${calculating ? 'animate-spin' : ''}`} />
                Calcular ABC
              </Button>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">{metric === 'profit' ? 'Lucro' : 'Faturamento'}</TableHead>
                    <TableHead className="text-right">% Individual</TableHead>
                    <TableHead className="text-right">% Acumulado</TableHead>
                    <TableHead className="text-center">Classe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={item.product_key}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <div className="truncate max-w-[300px]" title={item.display_name || item.product_key}>
                          {item.display_name || item.product_key}
                        </div>
                      </TableCell>
                      <TableCell className={`text-right font-medium ${metric === 'profit' && item.value_total < 0 ? 'text-destructive' : ''}`}>
                        {formatCurrency(item.value_total)}
                      </TableCell>
                      <TableCell className="text-right">{item.percent.toFixed(1)}%</TableCell>
                      <TableCell className="text-right">{item.cumulative_percent.toFixed(1)}%</TableCell>
                      <TableCell className="text-center">
                        <Badge className={getClassColor(item.class)}>{item.class}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
