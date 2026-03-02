import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, AlertCircle, Check, RefreshCw, Download, Package, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { getCostCache, setCostCache, checkSellerChange, invalidateCostCache } from '@/hooks/useCostModuleCache';

interface CostCatalogProps {
  sellerId: string;
}

interface Product {
  product_key: string;
  item_id: string;
  variation_id: string | null;
  sku: string | null;
  display_name: string;
  thumbnail: string | null;
  cost_value: number;
  cost_source: string;
  has_cost: boolean;
  has_packaging: boolean;
  updated_at: string | null;
}

interface PackagingOption {
  id: string;
  name: string;
  cost_value: number;
  is_active: boolean;
}

interface PackagingLink {
  product_key: string;
  packaging_id: string;
}

type SortField = 'display_name' | 'sku' | 'cost_value' | 'has_cost';
type SortDir = 'asc' | 'desc';
type CostFilter = 'all' | 'with' | 'without';
type PackagingFilterType = 'all' | 'with' | 'without';

export function CostCatalog({ sellerId }: CostCatalogProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [missingCount, setMissingCount] = useState(0);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [fetchingErpKey, setFetchingErpKey] = useState<string | null>(null);

  // Sort & Filter states
  const [sortBy, setSortBy] = useState<SortField>('display_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [costFilter, setCostFilter] = useState<CostFilter>('all');
  const [packagingFilter, setPackagingFilter] = useState<PackagingFilterType>('all');

  // Packaging V2
  const [packagingOptions, setPackagingOptions] = useState<PackagingOption[]>([]);
  const [packagingLinks, setPackagingLinks] = useState<PackagingLink[]>([]);
  const [linkingKey, setLinkingKey] = useState<string | null>(null);

  const cacheKey = `catalog:${sellerId}:${search}:${costFilter}:${packagingFilter}:${sortBy}:${sortDir}:${page}`;

  const loadCatalog = async (skipCache = false) => {
    checkSellerChange(sellerId);
    if (!skipCache) {
      const cached = getCostCache(cacheKey);
      if (cached) {
        setProducts(cached.products || []);
        setTotalPages(cached.total_pages || 1);
        setMissingCount(cached.missing_count || 0);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const params = new URLSearchParams({
        seller_id: sellerId, search, page: String(page), page_size: '50',
        sort_by: sortBy, sort_dir: sortDir, cost_filter: costFilter, packaging_filter: packagingFilter,
      });

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/catalog?${params}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setProducts(data.products || []);
        setTotalPages(data.total_pages || 1);
        setMissingCount(data.missing_count || 0);
        setCostCache(cacheKey, data);
      }
    } catch (error) {
      console.error('Error loading catalog:', error);
      toast.error('Erro ao carregar catálogo');
    } finally {
      setLoading(false);
    }
  };

  const loadPackaging = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/packaging/list?seller_id=${sellerId}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setPackagingOptions((data.packaging || []).filter((p: PackagingOption) => p.is_active));
        setPackagingLinks(data.links || []);
      }
    } catch {}
  };

  useEffect(() => {
    if (sellerId) { loadCatalog(); loadPackaging(); }
  }, [sellerId, costFilter, packagingFilter, sortBy, sortDir, page]);

  useEffect(() => {
    const timer = setTimeout(() => { if (sellerId) { setPage(1); loadCatalog(); } }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSaveCost = async (product: Product) => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const newCostValue = parseFloat(editingValue) || 0;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/catalog/update`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ seller_id: sellerId, product_key: product.product_key, cost_value: newCostValue, display_name: product.display_name }),
        }
      );

      if (response.ok) {
        toast.success('Custo atualizado');
        setEditingKey(null);
        // Inline update — no refresh needed
        setProducts(prev => prev.map(p =>
          p.product_key === product.product_key
            ? { ...p, cost_value: newCostValue, has_cost: newCostValue > 0, updated_at: new Date().toISOString() }
            : p
        ));
        if (newCostValue > 0 && !product.has_cost) setMissingCount(c => Math.max(0, c - 1));
        else if (newCostValue <= 0 && product.has_cost) setMissingCount(c => c + 1);
        invalidateCostCache('catalog');
      } else { toast.error('Erro ao salvar custo'); }
    } catch { toast.error('Erro ao salvar custo'); } finally { setSaving(false); }
  };

  const handleFetchErpCost = async (product: Product) => {
    setFetchingErpKey(product.product_key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/catalog/fetch-erp-cost`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ seller_id: sellerId, product_key: product.product_key, sku: product.sku, item_id: product.item_id }),
        }
      );

      const data = await response.json();
      if (data.success) {
        toast.success(`Custo importado do ERP: R$ ${Number(data.cost_value).toFixed(2)}`);
        // Inline update
        const newVal = Number(data.cost_value);
        setProducts(prev => prev.map(p =>
          p.product_key === product.product_key
            ? { ...p, cost_value: newVal, has_cost: newVal > 0, cost_source: 'erp', updated_at: new Date().toISOString() }
            : p
        ));
        invalidateCostCache('catalog');
      } else if (data.error === 'no_erp' || data.error === 'no_api_key') {
        toast.error(data.message, { duration: 6000 });
      } else { toast.error(data.message || 'Produto não encontrado no ERP'); }
    } catch { toast.error('Erro ao buscar custo no ERP'); } finally { setFetchingErpKey(null); }
  };

  const handleLinkPackaging = async (productKey: string, packagingId: string | null) => {
    setLinkingKey(productKey);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/packaging/link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ seller_id: sellerId, product_key: productKey, packaging_id: packagingId || null }),
      });

      toast.success(packagingId ? 'Embalagem vinculada' : 'Embalagem removida');
      // Inline update packaging links
      setPackagingLinks(prev => {
        const filtered = prev.filter(l => l.product_key !== productKey);
        if (packagingId) filtered.push({ product_key: productKey, packaging_id: packagingId });
        return filtered;
      });
      // Update has_packaging on product
      setProducts(prev => prev.map(p =>
        p.product_key === productKey ? { ...p, has_packaging: !!packagingId } : p
      ));
      invalidateCostCache('catalog');
    } catch { toast.error('Erro ao vincular embalagem'); } finally { setLinkingKey(null); }
  };

  const getLinkedPackaging = (productKey: string): string => {
    const link = packagingLinks.find(l => l.product_key === productKey);
    return link?.packaging_id || '';
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
    setPage(1);
    invalidateCostCache('catalog');
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Catálogo de Custos</span>
          {missingCount > 0 && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {missingCount} sem custo
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filters bar */}
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por SKU, título ou ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={costFilter} onValueChange={(v) => { setCostFilter(v as CostFilter); setPage(1); }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Custo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Custo: Todos</SelectItem>
              <SelectItem value="with">Com custo</SelectItem>
              <SelectItem value="without">Sem custo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={packagingFilter} onValueChange={(v) => { setPackagingFilter(v as PackagingFilterType); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Embalagem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Embalagem: Todos</SelectItem>
              <SelectItem value="with">Com embalagem</SelectItem>
              <SelectItem value="without">Sem embalagem</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => { invalidateCostCache('catalog'); loadCatalog(true); loadPackaging(); }} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[35%] cursor-pointer select-none" onClick={() => handleSort('display_name')}>
                      <span className="flex items-center">Produto <SortIcon field="display_name" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('sku')}>
                      <span className="flex items-center">SKU <SortIcon field="sku" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('cost_value')}>
                      <span className="flex items-center">Custo Unitário <SortIcon field="cost_value" /></span>
                    </TableHead>
                    <TableHead>Embalagem</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('has_cost')}>
                      <span className="flex items-center">Status <SortIcon field="has_cost" /></span>
                    </TableHead>
                    <TableHead className="w-[80px]">ERP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum produto encontrado</TableCell>
                    </TableRow>
                  ) : (
                    products.map((product) => (
                      <TableRow key={product.product_key}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {product.thumbnail ? (
                              <img src={product.thumbnail} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0 bg-muted" />
                            ) : (
                              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                <Package className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-medium truncate max-w-[340px]" title={product.display_name}>
                                {product.display_name.length > 60 ? product.display_name.slice(0, 60) + '…' : product.display_name}
                              </div>
                              <div className="text-xs text-muted-foreground">{product.product_key}</div>
                              {product.variation_id && (
                                <div className="text-xs text-muted-foreground">Var: {product.variation_id}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><span className="text-sm">{product.sku || '-'}</span></TableCell>
                        <TableCell>
                          {editingKey === product.product_key ? (
                            <div className="flex gap-1 items-center">
                              <Input type="number" step="0.01" min="0" value={editingValue} onChange={(e) => setEditingValue(e.target.value)} className="w-24" autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCost(product); if (e.key === 'Escape') setEditingKey(null); }} />
                              <Button size="sm" onClick={() => handleSaveCost(product)} disabled={saving}>
                                {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingKey(null)}>X</Button>
                            </div>
                          ) : (
                            <span className={`cursor-pointer hover:underline ${!product.has_cost ? 'text-muted-foreground' : ''}`}
                              onClick={() => { setEditingKey(product.product_key); setEditingValue(String(product.cost_value || '')); }}>
                              {product.has_cost ? formatCurrency(product.cost_value) : 'Definir custo'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {packagingOptions.length > 0 ? (
                            <Select
                              value={getLinkedPackaging(product.product_key)}
                              onValueChange={(val) => handleLinkPackaging(product.product_key, val === 'none' ? null : val)}
                              disabled={linkingKey === product.product_key}
                            >
                              <SelectTrigger className="w-[140px] h-8 text-xs">
                                <SelectValue placeholder="Selecionar" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Nenhuma</SelectItem>
                                {packagingOptions.map(pkg => (
                                  <SelectItem key={pkg.id} value={pkg.id}>
                                    <span className="flex items-center gap-1">
                                      <Package className="h-3 w-3" />{pkg.name} ({formatCurrency(pkg.cost_value)})
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground">Cadastre embalagens</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {product.has_cost ? (
                            <Badge variant="outline" className="text-green-600 border-green-600"><Check className="h-3 w-3 mr-1" />OK</Badge>
                          ) : (
                            <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Sem custo</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" disabled={fetchingErpKey === product.product_key} onClick={() => handleFetchErpCost(product)} title="Buscar custo no ERP">
                            {fetchingErpKey === product.product_key ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                <span className="py-2 px-4 text-sm">Página {page} de {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
