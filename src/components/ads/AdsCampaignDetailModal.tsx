import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { format, subDays } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { AdsCampaign } from '@/types/ads';
import { AdsCampaignProducts } from './AdsCampaignProducts';
import { useAdsCampaignActions } from '@/hooks/useAdsCampaignActions';
import { useAdsPeriodMetrics } from '@/hooks/useAdsPeriodMetrics';
import type { CampaignMetric } from '@/hooks/useAdsPeriodMetrics';
import { getAdsCache, adsCacheKey } from '@/hooks/useAdsDataCache';
import { cn } from '@/lib/utils';
import {
  Pause, Play, TrendingUp, TrendingDown, DollarSign,
  MousePointerClick, Target, BarChart3, Search, Plus,
  Loader2, CalendarIcon, Check,
} from 'lucide-react';

type ModalPeriod = '7d' | '14d' | '30d' | '60d' | 'custom';

const modalPeriodOptions: { value: ModalPeriod; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '14d', label: '14d' },
  { value: '30d', label: '30d' },
  { value: '60d', label: '60d' },
  { value: 'custom', label: 'Custom' },
];

const modalPeriodDays: Record<string, number> = {
  '7d': 7, '14d': 14, '30d': 30, '60d': 60,
};

interface AdsCampaignDetailModalProps {
  campaign: AdsCampaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId: string;
  precomputedMetrics?: CampaignMetric[];
  onStatusChange?: () => void;
  parentDateFrom?: string;
  parentDateTo?: string;
  parentPeriod?: string;
}

interface SearchResult {
  item_id: string;
  title: string;
  thumbnail: string | null;
  price: number;
}

export function AdsCampaignDetailModal({
  campaign, open, onOpenChange, sellerId, precomputedMetrics, onStatusChange,
  parentDateFrom, parentDateTo, parentPeriod,
}: AdsCampaignDetailModalProps) {
  const actions = useAdsCampaignActions(sellerId);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingItem, setAddingItem] = useState<string | null>(null);
  const [productsKey, setProductsKey] = useState(0);
  // Initialize modal period from parent period if it's a valid modal period
  const initialPeriod = useMemo<ModalPeriod>(() => {
    if (parentPeriod && ['7d', '14d', '30d', '60d'].includes(parentPeriod)) {
      return parentPeriod as ModalPeriod;
    }
    if (parentPeriod === 'custom') return 'custom';
    return '30d';
  }, [parentPeriod]);
  const [modalPeriod, setModalPeriod] = useState<ModalPeriod>(initialPeriod);

  // Sync modal period when parent period changes (e.g. modal reopened)
  useEffect(() => {
    setModalPeriod(initialPeriod);
  }, [initialPeriod]);
  const [customFrom, setCustomFrom] = useState<Date>();
  const [customTo, setCustomTo] = useState<Date>();
  const addSectionRef = useRef<HTMLDivElement>(null);

  const { dateFrom, dateTo } = useMemo(() => {
    const today = new Date();
    if (modalPeriod === 'custom' && customFrom && customTo) {
      return { dateFrom: format(customFrom, 'yyyy-MM-dd'), dateTo: format(customTo, 'yyyy-MM-dd') };
    }
    const days = modalPeriodDays[modalPeriod] || 30;
    return { dateFrom: format(subDays(today, days), 'yyyy-MM-dd'), dateTo: format(today, 'yyyy-MM-dd') };
  }, [modalPeriod, customFrom, customTo]);

  // Check if modal dates match parent dates — if so, reuse precomputedMetrics (already cached)
  const matchesParent = parentDateFrom === dateFrom && parentDateTo === dateTo;

  // Only fetch new metrics when dates differ from parent
  const { campaignsMetrics: fetchedModalMetrics, loading: metricsLoading } = useAdsPeriodMetrics(
    open && !matchesParent ? sellerId : undefined,
    open && !matchesParent ? dateFrom : undefined,
    open && !matchesParent ? dateTo : undefined,
  );

  // Use parent data when dates match, otherwise use freshly fetched
  const modalCampaignsMetrics = matchesParent ? (precomputedMetrics || []) : fetchedModalMetrics;

  if (!campaign) return null;

  const mlCampaignId = campaign.raw_data?.id ? String(campaign.raw_data.id) : campaign.ml_campaign_id;

  // Use modal-specific metrics if available, fallback to parent precomputed
  const activeMetrics = modalCampaignsMetrics.length > 0 ? modalCampaignsMetrics : precomputedMetrics;
  const pm = activeMetrics?.find(
    m => String(m.ml_campaign_id) === String(mlCampaignId) || String(m.ml_campaign_id) === campaign.ml_campaign_id,
  );

  const spent = pm?.spent || 0;
  const revenue = pm?.revenue || 0;
  const clicks = pm?.clicks || 0;
  const acos = revenue > 0 ? (spent / revenue) * 100 : 0;
  const roas = spent > 0 ? revenue / spent : 0;
  const cpc = clicks > 0 ? spent / clicks : 0;
  const tacos = revenue > 0 ? (spent / revenue) * 100 : 0;

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const handleToggleCampaign = async () => {
    if (campaign.status === 'active') {
      await actions.pauseCampaign(mlCampaignId);
    } else {
      await actions.activateCampaign(mlCampaignId);
    }
    onStatusChange?.();
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const query = searchQuery.trim();
      const { data } = await supabase
        .from('meli_listings_cache')
        .select('item_id, title, thumbnail, price')
        .eq('seller_id', sellerId)
        .or(`item_id.ilike.%${query}%,title.ilike.%${query}%,sku.ilike.%${query}%`)
        .limit(10);
      setSearchResults(
        (data || []).map(d => ({
          item_id: d.item_id, title: d.title || d.item_id,
          thumbnail: d.thumbnail, price: d.price || 0,
        })),
      );
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleAddProduct = async (itemId: string) => {
    setAddingItem(itemId);
    await actions.addAd(mlCampaignId, itemId);
    setAddingItem(null);
    setProductsKey(k => k + 1);
  };

  const scrollToAdd = () => {
    addSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const kpiCards = [
    { label: 'Gasto', value: formatCurrency(spent), icon: DollarSign, color: 'text-destructive' },
    { label: 'Receita', value: formatCurrency(revenue), icon: TrendingUp, color: 'text-success' },
    { label: 'CPC', value: formatCurrency(cpc), icon: MousePointerClick, color: 'text-foreground' },
    { label: 'ACOS', value: `${acos.toFixed(1)}%`, icon: Target, color: acos > 30 ? 'text-destructive' : 'text-success' },
    { label: 'TACOS', value: `${tacos.toFixed(1)}%`, icon: BarChart3, color: tacos > 30 ? 'text-destructive' : 'text-success' },
    { label: 'ROAS', value: `${roas.toFixed(2)}x`, icon: TrendingUp, color: roas >= 3 ? 'text-success' : 'text-warning' },
  ];

  const isToggling = actions.loading?.includes('campaign');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] xl:max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <DialogTitle className="text-lg truncate">{campaign.name}</DialogTitle>
              <Badge
                variant={campaign.status === 'active' ? 'default' : 'secondary'}
                className="text-[10px] shrink-0"
              >
                {campaign.status === 'active' ? 'Ativa' : campaign.status === 'paused' ? 'Pausada' : campaign.status}
              </Badge>
            </div>
            <Button
              variant={campaign.status === 'active' ? 'destructive' : 'default'}
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={handleToggleCampaign}
              disabled={isToggling}
            >
              {isToggling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : campaign.status === 'active' ? (
                <><Pause className="h-4 w-4" /> Pausar</>
              ) : (
                <><Play className="h-4 w-4" /> Ativar</>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {campaign.campaign_type || 'product_ads'} • ID: {mlCampaignId}
          </p>
        </DialogHeader>

        {/* Period Filter */}
        <div className="flex items-center gap-2 flex-wrap mt-1">
          {modalPeriodOptions.map(opt => {
            const hasCached = opt.value !== 'custom' && opt.value !== modalPeriod && (() => {
              const days = modalPeriodDays[opt.value];
              if (!days) return false;
              const from = format(subDays(new Date(), days), 'yyyy-MM-dd');
              const to = format(new Date(), 'yyyy-MM-dd');
              return !!getAdsCache(adsCacheKey(sellerId, 'period', from, to));
            })();
            return (
              <Button
                key={opt.value}
                variant={modalPeriod === opt.value ? 'default' : 'outline'}
                size="sm"
                className="h-6 text-[11px] px-2 gap-1"
                onClick={() => setModalPeriod(opt.value)}
              >
                {opt.label}
                {hasCached && <span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />}
              </Button>
            );
          })}
          {modalPeriod === 'custom' && (
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-6 text-[11px] px-2 gap-1", !customFrom && "text-muted-foreground")}>
                    <CalendarIcon className="h-3 w-3" />
                    {customFrom ? format(customFrom, 'dd/MM/yy') : 'De'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <span className="text-[10px] text-muted-foreground">→</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-6 text-[11px] px-2 gap-1", !customTo && "text-muted-foreground")}>
                    <CalendarIcon className="h-3 w-3" />
                    {customTo ? format(customTo, 'dd/MM/yy') : 'Até'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customTo} onSelect={setCustomTo} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          )}
          {metricsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-2">
          {kpiCards.map(kpi => (
            <Card key={kpi.label} className="border-border/50">
              <CardContent className="p-3 text-center">
                <kpi.icon className={`h-4 w-4 mx-auto mb-1 ${kpi.color}`} />
                <p className={`text-sm font-bold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Products Table */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Produtos da Campanha</h3>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={scrollToAdd}>
              <Plus className="h-3 w-3" /> Adicionar Anúncio
            </Button>
          </div>
          <AdsCampaignProducts
            key={productsKey}
            mlCampaignId={mlCampaignId}
            sellerId={sellerId}
            onClose={() => {}}
            showActions
          />
        </div>

        {/* Search to add product */}
        <div className="mt-4 border-t pt-4" ref={addSectionRef}>
          <h3 className="text-sm font-semibold mb-2">Adicionar Produto</h3>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, MLB ou SKU..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Button size="sm" className="h-9" onClick={handleSearch} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-2 border rounded-md divide-y max-h-[200px] overflow-y-auto">
              {searchResults.map(item => (
                <div key={item.item_id} className="flex items-center gap-3 p-2 hover:bg-muted/50">
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt="" className="h-8 w-8 rounded object-cover border" />
                  ) : (
                    <div className="h-8 w-8 rounded border bg-muted" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.title}</p>
                    <p className="text-[10px] text-muted-foreground">{item.item_id} • {formatCurrency(item.price)}</p>
                  </div>
                  <Button
                    size="sm" variant="outline" className="h-7 text-xs gap-1"
                    onClick={() => handleAddProduct(item.item_id)}
                    disabled={addingItem === item.item_id}
                  >
                    {addingItem === item.item_id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <><Plus className="h-3 w-3" /> Adicionar</>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
