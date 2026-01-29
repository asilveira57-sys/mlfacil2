import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ExternalLink, 
  RefreshCw, 
  Save,
  TrendingUp,
  TrendingDown,
  History,
  AlertTriangle,
  Clock,
  Activity,
  Link2
} from 'lucide-react';
import { useCompetitorTracking, CompetitorTracker, CompetitorSnapshot, CompetitorEvent } from '@/hooks/useCompetitorTracking';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SellerListingBindingSection } from './SellerListingBindingSection';

interface TrackedListingDetailDrawerProps {
  sellerId: string;
  tracker: CompetitorTracker | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SellerListingValue {
  refType: string;
  refId: string;
  listingId: string;
  title: string;
  sku: string | null;
  price: number;
}

export function TrackedListingDetailDrawer({ 
  sellerId, 
  tracker, 
  open, 
  onOpenChange 
}: TrackedListingDetailDrawerProps) {
  const { updateTracker, checkTracker, fetchSnapshots, fetchEvents, refreshing } = useCompetitorTracking(sellerId);
  
  const [snapshots, setSnapshots] = useState<CompetitorSnapshot[]>([]);
  const [events, setEvents] = useState<CompetitorEvent[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [formData, setFormData] = useState({
    competitor_label: '',
    min_price: '',
    max_price: '',
    reaction_mode: 'monitorar',
    undercut_amount: '0.10',
    check_interval_minutes: '120',
  });
  const [sellerListing, setSellerListing] = useState<SellerListingValue | null>(null);
  const [followPriceUp, setFollowPriceUp] = useState(false);

  useEffect(() => {
    if (tracker) {
      setFormData({
        competitor_label: tracker.competitor_label,
        min_price: tracker.min_price?.toString() || '',
        max_price: tracker.max_price?.toString() || '',
        reaction_mode: tracker.reaction_mode,
        undercut_amount: tracker.undercut_amount?.toString() || '0.10',
        check_interval_minutes: tracker.check_interval_minutes?.toString() || '120',
      });
      
      // Set seller listing from tracker data
      if (tracker.seller_listing_ref_id) {
        setSellerListing({
          refType: tracker.seller_listing_ref_type || 'meli_listings_cache',
          refId: tracker.seller_listing_ref_id,
          listingId: tracker.seller_listing_id || '',
          title: tracker.seller_listing_title || '',
          sku: tracker.seller_listing_sku || null,
          price: tracker.seller_listing_price || 0,
        });
      } else {
        setSellerListing(null);
      }
      setFollowPriceUp(tracker.follow_price_up || false);
      
      loadData();
    }
  }, [tracker?.id]);

  const loadData = async () => {
    if (!tracker) return;
    setLoadingData(true);
    try {
      const [snapshotsData, eventsData] = await Promise.all([
        fetchSnapshots(tracker.id),
        fetchEvents(tracker.id),
      ]);
      setSnapshots(snapshotsData);
      setEvents(eventsData);
    } finally {
      setLoadingData(false);
    }
  };

  const handleSave = async () => {
    if (!tracker) return;
    setSaving(true);
    try {
      await updateTracker(tracker.id, {
        competitor_label: formData.competitor_label,
        min_price: formData.min_price ? parseFloat(formData.min_price) : null,
        max_price: formData.max_price ? parseFloat(formData.max_price) : null,
        reaction_mode: formData.reaction_mode as any,
        undercut_amount: parseFloat(formData.undercut_amount) || 0.10,
        check_interval_minutes: parseInt(formData.check_interval_minutes) || 120,
        seller_listing_id: sellerListing?.listingId || null,
        seller_listing_ref_type: sellerListing?.refType || null,
        seller_listing_ref_id: sellerListing?.refId || null,
        seller_listing_title: sellerListing?.title || null,
        seller_listing_sku: sellerListing?.sku || null,
        seller_listing_price: sellerListing?.price || null,
        follow_price_up: followPriceUp,
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
  const chartData = snapshots
    .filter(s => s.price !== null)
    .map(s => ({
      date: formatChartDate(s.captured_at),
      price: s.price,
      fullDate: s.captured_at,
    }));

  // Calculate stats
  const prices = snapshots.filter(s => s.price !== null).map(s => s.price!);
  const stats = {
    minPrice: prices.length > 0 ? Math.min(...prices) : null,
    maxPrice: prices.length > 0 ? Math.max(...prices) : null,
    avgPrice: prices.length > 0 ? prices.reduce((sum, p) => sum + p, 0) / prices.length : null,
    totalSnapshots: snapshots.length,
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'price_down':
        return <TrendingDown className="h-4 w-4 text-green-500" />;
      case 'price_up':
        return <TrendingUp className="h-4 w-4 text-amber-500" />;
      case 'became_unavailable':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'became_available':
        return <Activity className="h-4 w-4 text-green-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (!tracker) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {tracker.competitor_thumbnail && (
              <img 
                src={tracker.competitor_thumbnail} 
                alt="" 
                className="w-10 h-10 object-cover rounded"
              />
            )}
            <div>
              <div>{tracker.competitor_label}</div>
              <div className="text-sm font-normal text-muted-foreground">
                {tracker.competitor_external_id || 'ID não disponível'}
              </div>
            </div>
          </SheetTitle>
          <SheetDescription>
            Configuração e histórico do concorrente
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="config">Configurar</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-4">
            {/* Current Price Card */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Preço Atual</p>
                    <p className="text-3xl font-bold">{formatCurrency(tracker.last_known_price)}</p>
                    <Badge variant={tracker.last_known_state === 'ativo' ? 'default' : 'destructive'} className="mt-1">
                      {tracker.last_known_state === 'ativo' ? 'Disponível' : 'Indisponível'}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => checkTracker(tracker.id)}
                      disabled={refreshing === tracker.id}
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${refreshing === tracker.id ? 'animate-spin' : ''}`} />
                      Verificar
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href={tracker.competitor_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground mt-4 space-y-1">
                  <p>Última verificação: {formatDate(tracker.last_checked_at || '')}</p>
                  <p>Próxima verificação: {formatDate(tracker.next_check_at || '')}</p>
                  <p>Intervalo: {tracker.check_interval_minutes} minutos</p>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            {snapshots.length > 0 && (
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <p className="text-muted-foreground">Mínimo</p>
                  <p className="font-medium">{formatCurrency(stats.minPrice)}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">Máximo</p>
                  <p className="font-medium">{formatCurrency(stats.maxPrice)}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">Média</p>
                  <p className="font-medium">{formatCurrency(stats.avgPrice)}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">Capturas</p>
                  <p className="font-medium">{stats.totalSnapshots}</p>
                </div>
              </div>
            )}

            {/* Recent Events */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Eventos Recentes</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingData ? (
                  <Skeleton className="h-24" />
                ) : events.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Nenhum evento registrado</p>
                ) : (
                  <div className="space-y-3">
                    {events.slice(0, 5).map((event) => (
                      <div key={event.id} className="flex items-start gap-3">
                        {getEventIcon(event.event_type)}
                        <div className="flex-1">
                          <p className="text-sm">{event.message}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(event.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-6 mt-4">
            {/* Price History Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Histórico de Preços</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingData ? (
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
              </CardContent>
            </Card>

            {/* All Events Timeline */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Linha do Tempo</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingData ? (
                  <Skeleton className="h-48" />
                ) : events.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Nenhum evento registrado</p>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {events.map((event) => (
                      <div key={event.id} className="flex items-start gap-3 border-l-2 pl-4 border-muted">
                        {getEventIcon(event.event_type)}
                        <div className="flex-1">
                          <p className="text-sm">{event.message}</p>
                          {event.prev_price && event.new_price && (
                            <p className="text-xs">
                              {formatCurrency(event.prev_price)} → {formatCurrency(event.new_price)}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">{formatDate(event.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Configurações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome do Concorrente</Label>
                  <Input
                    value={formData.competitor_label}
                    onChange={(e) => setFormData(prev => ({ ...prev, competitor_label: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Intervalo de Verificação</Label>
                  <Select
                    value={formData.check_interval_minutes}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, check_interval_minutes: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="60">A cada 1 hora</SelectItem>
                      <SelectItem value="120">A cada 2 horas</SelectItem>
                      <SelectItem value="240">A cada 4 horas</SelectItem>
                      <SelectItem value="360">A cada 6 horas</SelectItem>
                      <SelectItem value="720">A cada 12 horas</SelectItem>
                      <SelectItem value="1440">A cada 24 horas</SelectItem>
                    </SelectContent>
                  </Select>
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
                    value={formData.reaction_mode}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, reaction_mode: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monitorar">Apenas Monitorar</SelectItem>
                      <SelectItem value="sugerir">Sugerir Novo Preço</SelectItem>
                      <SelectItem value="auto_aplicar" disabled>Ajustar Automaticamente (em breve)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.reaction_mode !== 'monitorar' && (
                  <div className="space-y-2">
                    <Label>Valor de Ajuste</Label>
                    <Select
                      value={formData.undercut_amount}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, undercut_amount: value }))}
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

                {/* Seller Listing Binding */}
                <SellerListingBindingSection
                  sellerId={sellerId}
                  value={sellerListing}
                  followPriceUp={followPriceUp}
                  onChange={setSellerListing}
                  onFollowPriceUpChange={setFollowPriceUp}
                  disabled={saving}
                />

                <Button onClick={handleSave} disabled={saving} className="w-full">
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Salvando...' : 'Salvar Configurações'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
