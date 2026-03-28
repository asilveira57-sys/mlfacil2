import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Package, Search, RefreshCw, Calculator, AlertCircle, CheckCircle2, Pencil, Loader2, ArrowUp, ArrowDown, ArrowUpDown, Info } from 'lucide-react';
import { CopyMlbId } from '@/components/ui/CopyMlbId';
import { useFreightProducts, type FreightProduct } from '@/hooks/useFreightProducts';
import { FreightProductEditDialog } from './FreightProductEditDialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useQueryClient } from '@tanstack/react-query';
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious,
} from '@/components/ui/pagination';
import { calculateFreight, type ProductDimensions, type FreightContext, type FreightRuleLine, type FreightRuleset } from '@/lib/freightEngine';

const PAGE_SIZE = 25;

type SortField = 'title' | 'weight_kg' | 'dimensions' | 'freight_profile' | 'dimensions_source' | 'expected_freight_cost' | 'price';
type SortDir = 'asc' | 'desc';

function getDimensionsSum(p: FreightProduct): number {
  if (p.height_cm && p.width_cm && p.length_cm) {
    return p.height_cm + p.width_cm + p.length_cm;
  }
  return 0;
}

function sortProducts(products: FreightProduct[], field: SortField, dir: SortDir): FreightProduct[] {
  return [...products].sort((a, b) => {
    let va: number | string = 0;
    let vb: number | string = 0;
    switch (field) {
      case 'title': va = a.title?.toLowerCase() || ''; vb = b.title?.toLowerCase() || ''; break;
      case 'weight_kg': va = a.weight_kg || 0; vb = b.weight_kg || 0; break;
      case 'dimensions': va = getDimensionsSum(a); vb = getDimensionsSum(b); break;
      case 'freight_profile': va = a.freight_profile || 'Z'; vb = b.freight_profile || 'Z'; break;
      case 'dimensions_source': va = a.dimensions_source || ''; vb = b.dimensions_source || ''; break;
      case 'expected_freight_cost': va = a.expected_freight_cost || 0; vb = b.expected_freight_cost || 0; break;
      case 'price': va = a.price || 0; vb = b.price || 0; break;
    }
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

function StatusBadge({ source }: { source: string | null }) {
  if (!source || source === 'none') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive" className="gap-1 cursor-help">
              <AlertCircle className="h-3 w-3" />
              Sem dados
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-xs text-xs">O anúncio não possui peso/dimensões cadastrados no Mercado Livre. Edite manualmente ou cadastre no ML e sincronize.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (source === 'estimated') {
    return <Badge variant="secondary" className="gap-1">Estimado</Badge>;
  }
  return (
    <Badge variant="outline" className="gap-1 text-success border-success/30">
      <CheckCircle2 className="h-3 w-3" />
      {source === 'manual' ? 'Manual' : 'OK'}
    </Badge>
  );
}

function DimensionsDisplay({ p }: { p: FreightProduct }) {
  if (p.height_cm && p.width_cm && p.length_cm) {
    return <>{p.height_cm}×{p.width_cm}×{p.length_cm} cm</>;
  }
  return <>-</>;
}

function SortableHeader({ label, field, currentField, currentDir, onClick }: {
  label: string; field: SortField; currentField: SortField; currentDir: SortDir;
  onClick: (f: SortField) => void;
}) {
  return (
    <button
      className="flex items-center gap-1 hover:text-foreground transition-colors w-full"
      onClick={() => onClick(field)}
    >
      {label}
      {currentField === field ? (
        currentDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

export function FreightProductsTab() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dimensionStatus, setDimensionStatus] = useState('all');
  const [freightProfile, setFreightProfile] = useState('all');
  const [page, setPage] = useState(1);
  const [editProduct, setEditProduct] = useState<FreightProduct | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [calculatingId, setCalculatingId] = useState<string | null>(null);
  const [massCalculating, setMassCalculating] = useState(false);
  const [sortField, setSortField] = useState<SortField>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { sellerId } = useActiveAccount();
  const queryClient = useQueryClient();

  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (val: string) => {
    setSearch(val);
    if (timer) clearTimeout(timer);
    const t = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 400);
    setTimer(t);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(1);
  };

  const { data: products, isLoading, refetch } = useFreightProducts({
    search: debouncedSearch,
    dimensionStatus,
    freightProfile,
  });

  const sorted = useMemo(() => {
    if (!products) return [];
    return sortProducts(products, sortField, sortDir);
  }, [products, sortField, sortDir]);

  const totalCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, page]);

  const handleSyncDimensions = async () => {
    if (!sellerId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('freight-sync-dimensions', {
        body: { seller_id: sellerId },
      });
      if (error) throw error;
      toast.success(`Dimensões atualizadas: ${data?.updated || 0} produtos`);
      queryClient.invalidateQueries({ queryKey: ['freight-products'] });
    } catch (err: any) {
      toast.error('Erro ao sincronizar dimensões: ' + (err.message || 'Erro'));
    } finally {
      setSyncing(false);
    }
  };

  const handleCalculate = async (product: FreightProduct) => {
    if (!product.weight_kg && !product.height_cm) {
      toast.error('Produto sem dimensões. Edite ou sincronize primeiro.');
      return;
    }
    setCalculatingId(product.id);
    try {
      const productDims: ProductDimensions = {
        weight_kg: product.weight_kg,
        height_cm: product.height_cm,
        width_cm: product.width_cm,
        length_cm: product.length_cm,
        freight_profile: (product.freight_profile as 'A' | 'B' | 'C') || 'B',
        dimensions_source: (product.dimensions_source as any) || 'none',
      };

      // Fetch global active ruleset first, then any active ruleset
      const { data: rulesets } = await supabase
        .from('freight_rulesets')
        .select('*')
        .eq('status', 'active')
        .order('is_global', { ascending: false })
        .limit(1);

      if (!rulesets || rulesets.length === 0) {
        toast.error('Nenhuma tabela de frete ativa. Gere a tabela oficial na aba "Tabela de Frete".');
        return;
      }

      const ruleset = rulesets[0];
      const { data: ruleLines } = await supabase
        .from('freight_rule_lines')
        .select('*')
        .eq('ruleset_id', ruleset.id)
        .order('sort_order', { ascending: true });

      if (!ruleLines || ruleLines.length === 0) {
        toast.error('Tabela de frete sem regras configuradas.');
        return;
      }

      // Map listing_type_id from ML to ad_type used in rules
      const adType = product.logistic_type === 'fulfillment' ? 'premium'
        : product.listing_type_id === 'gold_pro' ? 'premium' : 'classic';

      const context: FreightContext = {
        ruleset: ruleset as FreightRuleset,
        ruleLines: ruleLines as FreightRuleLine[],
        logistic_mode: product.logistic_type || product.shipping_mode || 'drop_off',
        ad_type: adType as 'classic' | 'premium',
        item_price: product.price || 0,
      };

      const result = calculateFreight(productDims, context);

      await supabase
        .from('meli_listings_cache')
        .update({
          expected_freight_cost: result.expected_shipping_cost,
          updated_at: new Date().toISOString(),
        })
        .eq('id', product.id);

      toast.success(`Frete calculado: R$ ${result.expected_shipping_cost.toFixed(2)} — ${result.reason}`);
      queryClient.invalidateQueries({ queryKey: ['freight-products'] });
    } catch (err: any) {
      toast.error('Erro ao calcular: ' + (err.message || 'Erro'));
    } finally {
      setCalculatingId(null);
    }
  };

  const handleMassRecalculate = async () => {
    if (!sellerId) return;
    setMassCalculating(true);
    try {
      toast.info('Passo 1/2: Sincronizando dimensões do ML...');
      await supabase.functions.invoke('freight-sync-dimensions', {
        body: { seller_id: sellerId },
      });

      // Step 2: Calculate freight for all products with dimensions
      toast.info('Passo 2/2: Calculando frete esperado...');

      const { data: rulesets } = await supabase
        .from('freight_rulesets')
        .select('*')
        .eq('status', 'active')
        .order('is_global', { ascending: false })
        .limit(1);

      if (!rulesets || rulesets.length === 0) {
        toast.warning('Dimensões sincronizadas, mas sem tabela de frete ativa para calcular.');
        queryClient.invalidateQueries({ queryKey: ['freight-products'] });
        return;
      }

      const ruleset = rulesets[0];
      const { data: ruleLines } = await supabase
        .from('freight_rule_lines')
        .select('*')
        .eq('ruleset_id', ruleset.id)
        .order('sort_order', { ascending: true });

      if (!ruleLines || ruleLines.length === 0) {
        toast.warning('Dimensões sincronizadas, mas tabela de frete sem regras.');
        queryClient.invalidateQueries({ queryKey: ['freight-products'] });
        return;
      }

      // Fetch all products with dimensions for this seller
      const { data: allProducts } = await supabase
        .from('meli_listings_cache')
        .select('id, weight_kg, height_cm, width_cm, length_cm, freight_profile, dimensions_source, price, logistic_type, shipping_mode, listing_type_id')
        .eq('seller_id', sellerId)
        .not('weight_kg', 'is', null);

      if (!allProducts || allProducts.length === 0) {
        toast.success('Dimensões sincronizadas. Nenhum produto com peso para calcular.');
        queryClient.invalidateQueries({ queryKey: ['freight-products'] });
        return;
      }

      let calculated = 0;
      // Process in batches of 50
      for (let i = 0; i < allProducts.length; i += 50) {
        const batch = allProducts.slice(i, i + 50);
        const updates: { id: string; expected_freight_cost: number }[] = [];

        for (const p of batch) {
          const dims: ProductDimensions = {
            weight_kg: p.weight_kg,
            height_cm: p.height_cm,
            width_cm: p.width_cm,
            length_cm: p.length_cm,
            freight_profile: (p.freight_profile as 'A' | 'B' | 'C') || 'B',
            dimensions_source: (p.dimensions_source as any) || 'none',
          };

          const adType = p.logistic_type === 'fulfillment' ? 'premium'
            : p.listing_type_id === 'gold_pro' ? 'premium' : 'classic';

          const ctx: FreightContext = {
            ruleset: ruleset as FreightRuleset,
            ruleLines: ruleLines as FreightRuleLine[],
            logistic_mode: p.logistic_type || p.shipping_mode || 'drop_off',
            ad_type: adType as 'classic' | 'premium',
            item_price: p.price || 0,
          };

          const result = calculateFreight(dims, ctx);
          updates.push({ id: p.id, expected_freight_cost: result.expected_shipping_cost });
        }

        // Update each product
        for (const u of updates) {
          await supabase
            .from('meli_listings_cache')
            .update({ expected_freight_cost: u.expected_freight_cost, updated_at: new Date().toISOString() })
            .eq('id', u.id);
          calculated++;
        }
      }

      toast.success(`Frete calculado para ${calculated} produtos!`);
      queryClient.invalidateQueries({ queryKey: ['freight-products'] });
    } catch (err: any) {
      toast.error('Erro: ' + (err.message || 'Erro'));
    } finally {
      setMassCalculating(false);
    }
  };

  const handleEdit = (product: FreightProduct) => {
    setEditProduct(product);
    setEditOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Produtos e Frete Esperado</h2>
          <p className="text-sm text-muted-foreground">
            Visualize e gerencie peso, dimensões e custo de frete esperado dos produtos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleSyncDimensions} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {syncing ? 'Sincronizando...' : 'Atualizar Dimensões'}
          </Button>
          <Button className="gap-2" onClick={handleMassRecalculate} disabled={massCalculating}>
            {massCalculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            {massCalculating ? 'Processando...' : 'Recalcular em Massa'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, SKU ou ID..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={dimensionStatus} onValueChange={(v) => { setDimensionStatus(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="no_data">Sem dados</SelectItem>
                <SelectItem value="estimated">Estimados</SelectItem>
                <SelectItem value="complete">Completos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={freightProfile} onValueChange={(v) => { setFreightProfile(v); setPage(1); }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Perfil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Perfis</SelectItem>
                <SelectItem value="A">Perfil A</SelectItem>
                <SelectItem value="B">Perfil B</SelectItem>
                <SelectItem value="C">Perfil C</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Produtos ({totalCount})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalCount === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum produto encontrado com os filtros selecionados.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <SortableHeader label="Produto" field="title" currentField={sortField} currentDir={sortDir} onClick={handleSort} />
                    </TableHead>
                    <TableHead className="text-center">
                      <SortableHeader label="Peso (kg)" field="weight_kg" currentField={sortField} currentDir={sortDir} onClick={handleSort} />
                    </TableHead>
                    <TableHead className="text-center">
                      <SortableHeader label="Dimensões" field="dimensions" currentField={sortField} currentDir={sortDir} onClick={handleSort} />
                    </TableHead>
                    <TableHead className="text-center">
                      <SortableHeader label="Perfil" field="freight_profile" currentField={sortField} currentDir={sortDir} onClick={handleSort} />
                    </TableHead>
                    <TableHead className="text-center">
                      <SortableHeader label="Status" field="dimensions_source" currentField={sortField} currentDir={sortDir} onClick={handleSort} />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortableHeader label="Frete Esperado" field="expected_freight_cost" currentField={sortField} currentDir={sortDir} onClick={handleSort} />
                    </TableHead>
                    <TableHead className="text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {product.thumbnail && (
                            <img
                              src={product.thumbnail}
                              alt=""
                              className="h-10 w-10 rounded object-cover bg-muted flex-shrink-0"
                              loading="lazy"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-sm line-clamp-1">{product.title || '-'}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <CopyMlbId itemId={product.item_id} />
                              {product.sku && <span>• {product.sku}</span>}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {product.weight_kg ? `${Number(product.weight_kg).toFixed(2)} kg` : '-'}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        <DimensionsDisplay p={product} />
                      </TableCell>
                      <TableCell className="text-center">
                        {product.freight_profile
                          ? <Badge variant="outline">{product.freight_profile}</Badge>
                          : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge source={product.dimensions_source} />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {product.expected_freight_cost
                          ? `R$ ${Number(product.expected_freight_cost).toFixed(2)}`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="sm" className="gap-1" onClick={() => handleEdit(product)}>
                            <Pencil className="h-3 w-3" />
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1"
                            disabled={calculatingId === product.id}
                            onClick={() => handleCalculate(product)}
                          >
                            {calculatingId === product.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Calculator className="h-3 w-3" />}
                            Calcular
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (page <= 3) {
                          pageNum = i + 1;
                        } else if (page >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = page - 2 + i;
                        }
                        return (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              isActive={pageNum === page}
                              onClick={() => setPage(pageNum)}
                              className="cursor-pointer"
                            >
                              {pageNum}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <FreightProductEditDialog
        product={editProduct}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
