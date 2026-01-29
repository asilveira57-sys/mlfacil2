import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ExternalLink, 
  RefreshCw, 
  Save,
  TrendingUp,
  TrendingDown,
  Minus,
  History,
  AlertTriangle
} from 'lucide-react';
import { useCompetitorTracking, TrackedListing, PriceHistory } from '@/hooks/useCompetitorTracking';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface TrackedListingDetailDrawerProps {
  sellerId: string;
  listing: TrackedListing | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TrackedListingDetailDrawer({ 
  sellerId, 
  listing, 
  open, 
  onOpenChange 
}: TrackedListingDetailDrawerProps) {
  const { updateListing, checkListing, fetchPriceHistory, refreshing } = useCompetitorTracking(sellerId);
  
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    competitor_name: '',
    min_price: '',
    max_price: '',
    reaction_type: 'monitor',
    adjustment_value: '0.10',
  });

  useEffect(() => {
    if (listing) {
      setFormData({
        competitor_name: listing.competitor_name,
        min_price: listing.min_price?.toString() || '',
        max_price: listing.max_price?.toString() || '',
        reaction_type: listing.reaction_type,
        adjustment_value: listing.adjustment_value?.toString() || '0.10',
      });
      loadHistory();
    }
  }, [listing?.id]);

  const loadHistory = async () => {
    if (!listing) return;
    setLoadingHistory(true);
    try {
      const data = await fetchPriceHistory(listing.id);
      setHistory(data);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSave = async () => {
    if (!listing) return;
    setSaving(true);
    try {
      await updateListing(listing.id, {
        competitor_name: formData.competitor_name,
        min_price: formData.min_price ? parseFloat(formData.min_price) : null,
        max_price: formData.max_price ? parseFloat(formData.max_price) : null,
        reaction_type: formData.reaction_type as any,
        adjustment_value: parseFloat(formData.adjustment_value) || 0.10,
      });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatChartDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    });
  };

  // Prepare chart data
  const chartData = history.map(h => ({
    date: formatChartDate(h.recorded_at),
    price: h.price,
    fullDate: h.recorded_at,
  }));

  // Calculate stats
  const stats = {
    minPrice: history.length > 0 ? Math.min(...history.map(h => h.price)) : null,
    maxPrice: history.length > 0 ? Math.max(...history.map(h => h.price)) : null,
    avgPrice: history.length > 0 ? history.reduce((sum, h) => sum + h.price, 0) / history.length : null,
    priceChanges: history.filter(h => h.price_delta !== null && h.price_delta !== 0).length,
  };

  if (!listing) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {listing.thumbnail && (
              <img 
                src={listing.thumbnail} 
                alt="" 
                className="w-10 h-10 object-cover rounded"
              />
            )}
            <div>
              <div>{listing.competitor_name}</div>
              <div className="text-sm font-normal text-muted-foreground">
                {listing.competitor_item_id}
              </div>
            </div>
          </SheetTitle>
          <SheetDescription>
            Configuração e histórico de preços do concorrente
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Current Price Card */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Preço Atual</p>
                  <p className="text-3xl font-bold">{formatCurrency(listing.current_price)}</p>
                  {listing.original_price && listing.original_price > (listing.current_price || 0) && (
                    <p className="text-sm text-muted-foreground line-through">
                      {formatCurrency(listing.original_price)}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => checkListing(listing.id)}
                    disabled={refreshing === listing.id}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${refreshing === listing.id ? 'animate-spin' : ''}`} />
                    Verificar
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={listing.competitor_link} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                {listing.shipping_full && <Badge className="bg-green-600">Full</Badge>}
                {listing.shipping_free && !listing.shipping_full && <Badge variant="secondary">Frete Grátis</Badge>}
                {listing.listing_type && <Badge variant="outline">{listing.listing_type}</Badge>}
                {!listing.is_available && <Badge variant="destructive">Indisponível</Badge>}
              </div>

              <div className="text-xs text-muted-foreground mt-4">
                Última verificação: {formatDate(listing.last_check_at || '')}
                {listing.price_change_count > 0 && (
                  <span className="ml-4">
                    <History className="h-3 w-3 inline mr-1" />
                    {listing.price_change_count} alterações detectadas
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Price History Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Histórico de Preços</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <Skeleton className="h-48 w-full" />
              ) : chartData.length > 1 ? (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="date" 
                        fontSize={12}
                        tickLine={false}
                      />
                      <YAxis 
                        fontSize={12}
                        tickLine={false}
                        tickFormatter={(value) => `R$ ${value}`}
                      />
                      <Tooltip 
                        formatter={(value: number) => [formatCurrency(value), 'Preço']}
                        labelFormatter={(label, payload) => {
                          if (payload?.[0]?.payload?.fullDate) {
                            return formatDate(payload[0].payload.fullDate);
                          }
                          return label;
                        }}
                      />
                      <Line 
                        type="stepAfter" 
                        dataKey="price" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  Histórico insuficiente para exibir gráfico
                </p>
              )}

              {/* Stats */}
              {history.length > 0 && (
                <div className="grid grid-cols-4 gap-4 mt-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Mínimo</p>
                    <p className="font-medium">{formatCurrency(stats.minPrice)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Máximo</p>
                    <p className="font-medium">{formatCurrency(stats.maxPrice)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Média</p>
                    <p className="font-medium">{formatCurrency(stats.avgPrice)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Alterações</p>
                    <p className="font-medium">{stats.priceChanges}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Configuration */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Configurações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do Concorrente</Label>
                <Input
                  value={formData.competitor_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, competitor_name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Preço Mínimo</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="R$ 0,00"
                    value={formData.min_price}
                    onChange={(e) => setFormData(prev => ({ ...prev, min_price: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Preço Máximo</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="R$ 0,00"
                    value={formData.max_price}
                    onChange={(e) => setFormData(prev => ({ ...prev, max_price: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tipo de Reação</Label>
                <Select
                  value={formData.reaction_type}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, reaction_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monitor">Apenas Monitorar</SelectItem>
                    <SelectItem value="suggest">Sugerir Novo Preço</SelectItem>
                    <SelectItem value="auto">Ajustar Automaticamente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.reaction_type !== 'monitor' && (
                <div className="space-y-2">
                  <Label>Valor de Ajuste</Label>
                  <Select
                    value={formData.adjustment_value}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, adjustment_value: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.01">R$ 0,01</SelectItem>
                      <SelectItem value="0.10">R$ 0,10</SelectItem>
                      <SelectItem value="0.50">R$ 0,50</SelectItem>
                      <SelectItem value="1.00">R$ 1,00</SelectItem>
                      <SelectItem value="2.00">R$ 2,00</SelectItem>
                      <SelectItem value="5.00">R$ 5,00</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button onClick={handleSave} disabled={saving} className="w-full">
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Salvando...' : 'Salvar Configurações'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}
