import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, Save, X, Plus } from 'lucide-react';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { invokeEdgeFunction } from '@/lib/edgeFunctionClient';
import { useToast } from '@/hooks/use-toast';

interface ShippingResult {
  weight: number;
  price: number;
  listing_type: string;
  logistic_type: string;
  list_cost: number | null;
  discount_rate: number | null;
  subsidized_cost: number | null;
  billable_weight: number | null;
  free_shipping: boolean;
  error?: string;
}

interface QueryResponse {
  results: ShippingResult[];
  meta: {
    seller_id: string;
    listing_type_id: string;
    logistic_type: string;
    category_id: string | null;
    total_queries: number;
    successful: number;
    queried_at: string;
  };
}

interface FreightApiQueryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveAsRuleset?: (results: ShippingResult[], meta: QueryResponse['meta']) => void;
}

const DEFAULT_WEIGHTS = [0.3, 0.5, 1, 2, 5, 10, 15, 30];
const DEFAULT_PRICES = [79, 120, 200, 350, 500, 1000];

const LISTING_TYPES = [
  { value: 'gold_pro', label: 'Premium (gold_pro)' },
  { value: 'gold_special', label: 'Clássico (gold_special)' },
];

const LOGISTIC_TYPES = [
  { value: 'drop_off', label: 'Drop Off (Correios/Agência)' },
  { value: 'xd_drop_off', label: 'Cross Docking (Coleta)' },
  { value: 'fulfillment', label: 'Fulfillment (Full)' },
];

export function FreightApiQueryDialog({ open, onOpenChange, onSaveAsRuleset }: FreightApiQueryDialogProps) {
  const { activeAccountId } = useActiveAccount();
  const { toast } = useToast();

  const [listingType, setListingType] = useState('gold_pro');
  const [logisticType, setLogisticType] = useState('drop_off');
  const [categoryId, setCategoryId] = useState('');
  const [weights, setWeights] = useState<number[]>(DEFAULT_WEIGHTS);
  const [prices, setPrices] = useState<number[]>(DEFAULT_PRICES);
  const [newWeight, setNewWeight] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ShippingResult[] | null>(null);
  const [meta, setMeta] = useState<QueryResponse['meta'] | null>(null);

  const handleQuery = async () => {
    if (!activeAccountId) {
      toast({ title: 'Selecione uma conta ML', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setResults(null);

    try {
      const result = await invokeEdgeFunction<QueryResponse>('freight-table-query', {
        body: {
          seller_id: activeAccountId,
          listing_type_id: listingType,
          logistic_type: logisticType,
          category_id: categoryId || undefined,
          weight_ranges: [...weights].sort((a, b) => a - b),
          price_ranges: [...prices].sort((a, b) => a - b),
        },
      });

      if (result.success && result.data) {
        setResults(result.data.results);
        setMeta(result.data.meta);
        toast({
          title: 'Consulta concluída',
          description: `${result.data.meta.successful}/${result.data.meta.total_queries} combinações consultadas com sucesso`,
        });
      } else {
        toast({
          title: 'Erro na consulta',
          description: result.error || 'Erro desconhecido',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Erro na consulta',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const addWeight = () => {
    const val = parseFloat(newWeight);
    if (!isNaN(val) && val > 0 && !weights.includes(val)) {
      setWeights([...weights, val].sort((a, b) => a - b));
      setNewWeight('');
    }
  };

  const addPrice = () => {
    const val = parseFloat(newPrice);
    if (!isNaN(val) && val > 0 && !prices.includes(val)) {
      setPrices([...prices, val].sort((a, b) => a - b));
      setNewPrice('');
    }
  };

  const removeWeight = (w: number) => setWeights(weights.filter(v => v !== w));
  const removePrice = (p: number) => setPrices(prices.filter(v => v !== p));

  const formatCurrency = (value: number | null) => {
    if (value === null) return '—';
    return `R$ ${value.toFixed(2)}`;
  };

  // Build grid: rows = weights, cols = prices
  const sortedWeights = [...weights].sort((a, b) => a - b);
  const sortedPrices = [...prices].sort((a, b) => a - b);

  const getResult = (weight: number, price: number) =>
    results?.find(r => r.weight === weight && r.price === price);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consultar Tabela Oficial do Mercado Livre</DialogTitle>
          <DialogDescription>
            Consulta a API do ML para obter os custos oficiais de frete por combinação de peso e preço.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Anúncio</Label>
              <Select value={listingType} onValueChange={setListingType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LISTING_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo Logístico</Label>
              <Select value={logisticType} onValueChange={setLogisticType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOGISTIC_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Categoria (opcional)</Label>
              <Input
                placeholder="Ex: MLB1234"
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
              />
            </div>
          </div>

          {/* Weight ranges */}
          <div className="space-y-2">
            <Label>Faixas de Peso (kg)</Label>
            <div className="flex flex-wrap gap-1.5">
              {sortedWeights.map(w => (
                <Badge key={w} variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeWeight(w)}>
                  {w} kg
                  <X className="h-3 w-3" />
                </Badge>
              ))}
              <div className="flex items-center gap-1">
                <Input
                  className="h-7 w-20 text-xs"
                  placeholder="kg"
                  value={newWeight}
                  onChange={e => setNewWeight(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addWeight()}
                />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={addWeight}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* Price ranges */}
          <div className="space-y-2">
            <Label>Faixas de Preço (R$)</Label>
            <div className="flex flex-wrap gap-1.5">
              {sortedPrices.map(p => (
                <Badge key={p} variant="secondary" className="gap-1 cursor-pointer" onClick={() => removePrice(p)}>
                  R$ {p}
                  <X className="h-3 w-3" />
                </Badge>
              ))}
              <div className="flex items-center gap-1">
                <Input
                  className="h-7 w-20 text-xs"
                  placeholder="R$"
                  value={newPrice}
                  onChange={e => setNewPrice(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addPrice()}
                />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={addPrice}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* Query button */}
          <Button onClick={handleQuery} disabled={loading || !activeAccountId} className="gap-2 w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? `Consultando ${sortedWeights.length * sortedPrices.length} combinações...` : 'Consultar API'}
          </Button>

          {/* Results grid */}
          {results && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  Resultado: {meta?.successful}/{meta?.total_queries} consultas OK
                </h3>
                {onSaveAsRuleset && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => onSaveAsRuleset(results, meta!)}
                  >
                    <Save className="h-3 w-3" />
                    Salvar como Tabela
                  </Button>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold bg-muted/50">Peso ↓ / Preço →</TableHead>
                      {sortedPrices.map(p => (
                        <TableHead key={p} className="text-xs text-center bg-muted/50">R$ {p}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedWeights.map(w => (
                      <TableRow key={w}>
                        <TableCell className="text-xs font-medium bg-muted/30">{w} kg</TableCell>
                        {sortedPrices.map(p => {
                          const r = getResult(w, p);
                          const isFree = r?.free_shipping;
                          return (
                            <TableCell
                              key={p}
                              className={`text-xs text-center ${
                                r?.error ? 'text-destructive' :
                                isFree ? 'text-green-600 font-medium bg-green-50 dark:bg-green-950/20' :
                                ''
                              }`}
                            >
                              {r?.error
                                ? '⚠️'
                                : isFree
                                  ? 'Grátis'
                                  : formatCurrency(r?.list_cost ?? null)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Legend */}
              <p className="text-xs text-muted-foreground">
                Valores = custo oficial (list_cost) que o seller paga. "Grátis" = frete subsidiado pelo ML.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
