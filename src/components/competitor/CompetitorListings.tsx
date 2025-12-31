import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, RefreshCw, ExternalLink, Tag, Package } from 'lucide-react';
import { toast } from 'sonner';
import { CompetitorProductDetail } from './CompetitorProductDetail';

interface CompetitorListingsProps {
  sellerId: string;
}

interface Listing {
  id: string;
  item_id: string;
  variation_id: string;
  sku: string | null;
  title: string;
  title_short: string | null;
  price: number;
  original_price: number | null;
  catalog_product_id: string | null;
  category_id: string | null;
  condition: string | null;
  logistic_type: string | null;
  available_quantity: number;
  sold_quantity: number;
  status: string | null;
  permalink: string | null;
  thumbnail: string | null;
}

export function CompetitorListings({ sellerId }: CompetitorListingsProps) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catalogFilter, setCatalogFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadListings = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const params = new URLSearchParams({
        seller_id: sellerId,
        search,
        page: String(page),
        page_size: '50',
      });

      if (catalogFilter !== 'all') {
        params.set('has_catalog', catalogFilter === 'catalog' ? 'true' : 'false');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-engine/listings?${params}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setListings(data.listings || []);
        setTotalPages(data.total_pages || 1);
      }
    } catch (error) {
      console.error('Error loading listings:', error);
      toast.error('Erro ao carregar anúncios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sellerId) {
      loadListings();
    }
  }, [sellerId, catalogFilter, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (sellerId) {
        setPage(1);
        loadListings();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/competitor-engine/listings/sync`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ seller_id: sellerId }),
        }
      );

      if (response.ok) {
        toast.success('Sincronização iniciada');
        setTimeout(() => {
          loadListings();
          setSyncing(false);
        }, 15000);
      } else {
        toast.error('Erro ao sincronizar');
        setSyncing(false);
      }
    } catch (error) {
      console.error('Error syncing:', error);
      toast.error('Erro ao sincronizar');
      setSyncing(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const openProductDetail = (listing: Listing) => {
    setSelectedListing(listing);
    setDetailOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Meus Anúncios</span>
            <Button onClick={handleSync} disabled={syncing} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando...' : 'Sincronizar'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, SKU ou ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={catalogFilter} onValueChange={(v) => { setCatalogFilter(v); setPage(1); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filtrar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="catalog">Com Catálogo</SelectItem>
                <SelectItem value="nocatalog">Sem Catálogo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum anúncio encontrado. Clique em "Sincronizar" para importar.</p>
            </div>
          ) : (
            <>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead className="text-center">Vendidos</TableHead>
                      <TableHead className="text-center">Estoque</TableHead>
                      <TableHead>Tipo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listings.map((listing) => (
                      <TableRow 
                        key={listing.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openProductDetail(listing)}
                      >
                        <TableCell>
                          {listing.thumbnail && (
                            <img 
                              src={listing.thumbnail} 
                              alt="" 
                              className="w-10 h-10 object-cover rounded"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[300px]">
                            <p className="font-medium truncate" title={listing.title}>
                              {listing.title_short || listing.title}
                            </p>
                            <p className="text-xs text-muted-foreground">{listing.item_id}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {listing.sku ? (
                            <Badge variant="outline" className="font-mono text-xs">
                              {listing.sku}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(listing.price)}
                        </TableCell>
                        <TableCell className="text-center">{listing.sold_quantity}</TableCell>
                        <TableCell className="text-center">{listing.available_quantity}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {listing.catalog_product_id && (
                              <Badge variant="secondary" className="text-xs">Catálogo</Badge>
                            )}
                            {listing.logistic_type === 'fulfillment' && (
                              <Badge className="text-xs bg-green-600">Full</Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    Anterior
                  </Button>
                  <span className="py-2 px-4 text-sm">Página {page} de {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    Próxima
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Análise de Concorrência</DialogTitle>
          </DialogHeader>
          {selectedListing && (
            <CompetitorProductDetail 
              sellerId={sellerId} 
              listing={selectedListing} 
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
