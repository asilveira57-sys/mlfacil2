import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, AlertCircle, Check, RefreshCw, Download, Package } from 'lucide-react';
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
  cost_value: number;
  cost_source: string;
  has_cost: boolean;
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

export function CostCatalog({ sellerId }: CostCatalogProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [missingCount, setMissingCount] = useState(0);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [fetchingErpKey, setFetchingErpKey] = useState<string | null>(null);

  // Packaging V2
  const [packagingOptions, setPackagingOptions] = useState<PackagingOption[]>([]);
  const [packagingLinks, setPackagingLinks] = useState<PackagingLink[]>([]);
  const [linkingKey, setLinkingKey] = useState<string | null>(null);

  const loadCatalog = async () => {
    checkSellerChange(sellerId);
    const cacheKey = `catalog:${sellerId}:${search}:${onlyMissing}:${page}`;
    const cached = getCostCache(cacheKey);
    if (cached) {
      setProducts(cached.products || []);
      setTotalPages(cached.total_pages || 1);
      setMissingCount(cached.missing_count || 0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const params = new URLSearchParams({
        seller_id: sellerId, only_missing: String(onlyMissing), search, page: String(page), page_size: '50',
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
  }, [sellerId, onlyMissing, page]);

  useEffect(() => {
    const timer = setTimeout(() => { if (sellerId) { setPage(1); loadCatalog(); } }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSaveCost = async (product: Product) => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/catalog/update`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ seller_id: sellerId, product_key: product.product_key, cost_value: parseFloat(editingValue) || 0, display_name: product.display_name }),
        }
      );

      if (response.ok) {
        toast.success('Custo atualizado');
        setEditingKey(null);
        invalidateCostCache('catalog');
        loadCatalog();
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
        invalidateCostCache('catalog');
        loadCatalog();
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
      loadPackaging();
    } catch { toast.error('Erro ao vincular embalagem'); } finally { setLinkingKey(null); }
  };

  const getLinkedPackaging = (productKey: string): string => {
    const link = packagingLinks.find(l => l.product_key === productKey);
    return link?.packaging_id || '';
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

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
        <div className="flex gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por SKU, título ou ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="onlyMissing" checked={onlyMissing} onCheckedChange={(checked) => { setOnlyMissing(!!checked); setPage(1); }} />
            <label htmlFor="onlyMissing" className="text-sm">Somente sem custo</label>
          </div>
          <Button variant="outline" onClick={() => { invalidateCostCache('catalog'); loadCatalog(); loadPackaging(); }} disabled={loading}>
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
                    <TableHead className="w-[35%]">Produto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Custo Unitário</TableHead>
                    <TableHead>Embalagem</TableHead>
                    <TableHead>Status</TableHead>
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
                          <div className="font-medium truncate max-w-[280px]" title={product.display_name}>{product.display_name}</div>
                          <div className="text-xs text-muted-foreground">{product.product_key}</div>
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
