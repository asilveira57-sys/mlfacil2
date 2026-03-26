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
import { Package, Search, RefreshCw, Calculator, AlertCircle, CheckCircle2 } from 'lucide-react';
import { CopyMlbId } from '@/components/ui/CopyMlbId';
import { useFreightProducts, type FreightProduct } from '@/hooks/useFreightProducts';
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious,
} from '@/components/ui/pagination';

const PAGE_SIZE = 25;

function StatusBadge({ source }: { source: string | null }) {
  if (!source || source === 'none') {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        Sem dados
      </Badge>
    );
  }
  if (source === 'estimated') {
    return <Badge variant="secondary" className="gap-1">Estimado</Badge>;
  }
  return (
    <Badge variant="outline" className="gap-1 text-success border-success/30">
      <CheckCircle2 className="h-3 w-3" />
      OK
    </Badge>
  );
}

function DimensionsDisplay({ p }: { p: FreightProduct }) {
  if (p.height_cm && p.width_cm && p.length_cm) {
    return <>{p.height_cm}×{p.width_cm}×{p.length_cm} cm</>;
  }
  return <>-</>;
}

export function FreightProductsTab() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dimensionStatus, setDimensionStatus] = useState('all');
  const [freightProfile, setFreightProfile] = useState('all');
  const [page, setPage] = useState(1);

  // Debounce search
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

  const { data: products, isLoading, refetch } = useFreightProducts({
    search: debouncedSearch,
    dimensionStatus,
    freightProfile,
  });

  const totalCount = products?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paged = useMemo(() => {
    if (!products) return [];
    const start = (page - 1) * PAGE_SIZE;
    return products.slice(start, start + PAGE_SIZE);
  }, [products, page]);

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
          <Button variant="outline" className="gap-2" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
          <Button className="gap-2">
            <Calculator className="h-4 w-4" />
            Recalcular em Massa
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
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-center">Peso (kg)</TableHead>
                    <TableHead className="text-center">Dimensões</TableHead>
                    <TableHead className="text-center">Perfil</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Frete Esperado</TableHead>
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
                        {product.weight_kg ? `${product.weight_kg} kg` : '-'}
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
                          <Button variant="ghost" size="sm">Editar</Button>
                          <Button variant="ghost" size="sm">Calcular</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
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
    </div>
  );
}
