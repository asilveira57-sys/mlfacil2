import React, { useState, useMemo } from 'react';
import { MoreHorizontal, Pause, Play, TrendingUp, TrendingDown, ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Search, ChevronLeft, RefreshCw } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AdsCampaign, AdsSyncState } from '@/types/ads';
import { AdsCampaignProducts } from './AdsCampaignProducts';
import type { CampaignMetric } from '@/hooks/useAdsPeriodMetrics';

interface CampaignPeriodMetrics {
  spent: number;
  revenue: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

interface AdsCampaignsTableProps {
  campaigns: AdsCampaign[];
  onSelectCampaign?: (campaign: AdsCampaign) => void;
  syncState?: AdsSyncState | null;
  onTriggerSync?: () => void;
  dateFrom?: string;
  dateTo?: string;
  precomputedMetrics?: CampaignMetric[];
}

type SortColumn = 'name' | 'status' | 'budget' | 'spent' | 'revenue' | 'cpc' | 'acos' | 'tacos' | 'roas';
type SortDirection = 'asc' | 'desc';

export function AdsCampaignsTable({ campaigns, onSelectCampaign, syncState, onTriggerSync, dateFrom, dateTo, precomputedMetrics }: AdsCampaignsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('spent');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 10;

  // Build a lookup map from precomputedMetrics (keyed by ml_campaign_id)
  const periodMetrics = useMemo(() => {
    if (!precomputedMetrics || precomputedMetrics.length === 0) return {};
    const map: Record<string, CampaignPeriodMetrics> = {};
    for (const cm of precomputedMetrics) {
      map[cm.ml_campaign_id] = {
        spent: cm.spent,
        revenue: cm.revenue,
        clicks: cm.clicks,
        impressions: cm.impressions,
        conversions: cm.conversions,
      };
    }
    return map;
  }, [precomputedMetrics]);

  const hasPeriodFilter = !!(dateFrom && dateTo);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      active: 'default',
      paused: 'secondary',
      ended: 'destructive',
    };
    const labels: Record<string, string> = {
      active: 'Ativa',
      paused: 'Pausada',
      ended: 'Encerrada',
    };
    return (
      <Badge variant={variants[status] || 'secondary'} className="text-[10px] px-1.5 py-0">
        {labels[status] || status}
      </Badge>
    );
  };

  const getCampaignMetrics = (campaign: AdsCampaign) => {
    // Use precomputed metrics matched by ml_campaign_id
    const pm = hasPeriodFilter ? periodMetrics[campaign.ml_campaign_id] : null;
    if (pm) {
      const acos = pm.revenue > 0 ? (pm.spent / pm.revenue) * 100 : 0;
      const roas = pm.spent > 0 ? pm.revenue / pm.spent : 0;
      const cpc = pm.clicks > 0 ? pm.spent / pm.clicks : 0;
      const tacos = pm.revenue > 0 ? (pm.spent / pm.revenue) * 100 : 0;
      const budget = (campaign.raw_data?.budget as number) || campaign.daily_budget || null;
      return { acos, roas, revenue: pm.revenue, budget, cpc, tacos, clicks: pm.clicks, spent: pm.spent };
    }
    // Fallback to lifetime metrics from raw_data
    const metrics = campaign.raw_data?.metrics as Record<string, number> | undefined;
    const spent = metrics?.cost || campaign.spent_total || 0;
    const revenue = metrics?.total_amount || 0;
    const clicks = metrics?.clicks || 0;
    const acos = metrics?.acos || (revenue > 0 ? (spent / revenue) * 100 : 0);
    const roas = metrics?.roas || (spent > 0 ? revenue / spent : 0);
    const cpc = clicks > 0 ? spent / clicks : 0;
    const tacos = revenue > 0 ? (spent / revenue) * 100 : 0;
    const budget = (campaign.raw_data?.budget as number) || campaign.daily_budget || null;
    return { acos, roas, revenue, budget, cpc, tacos, clicks, spent };
  };

  const getMlCampaignId = (campaign: AdsCampaign): string => {
    const rawId = campaign.raw_data?.id;
    return rawId ? String(rawId) : campaign.ml_campaign_id;
  };

  // Filter, sort, paginate
  const processedData = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    // Filter
    const filtered = query
      ? campaigns.filter(c => {
          const name = (c.name || '').toLowerCase();
          const type = (c.campaign_type || '').toLowerCase();
          const mlId = (c.ml_campaign_id || '').toLowerCase();
          return name.includes(query) || type.includes(query) || mlId.includes(query);
        })
      : campaigns;

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      const mA = getCampaignMetrics(a);
      const mB = getCampaignMetrics(b);
      let valA: number | string = 0;
      let valB: number | string = 0;

      switch (sortColumn) {
        case 'name': valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); break;
        case 'status': valA = a.status; valB = b.status; break;
        case 'budget': valA = mA.budget || 0; valB = mB.budget || 0; break;
        case 'spent': valA = mA.spent; valB = mB.spent; break;
        case 'revenue': valA = mA.revenue; valB = mB.revenue; break;
        case 'cpc': valA = mA.cpc; valB = mB.cpc; break;
        case 'acos': valA = mA.acos; valB = mB.acos; break;
        case 'tacos': valA = mA.tacos; valB = mB.tacos; break;
        case 'roas': valA = mA.roas; valB = mB.roas; break;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDirection === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });

    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const page = Math.min(currentPage, totalPages - 1);
    const paginated = sorted.slice(page * pageSize, (page + 1) * pageSize);

    return { filtered: sorted, paginated, totalPages, safePage: page, totalFiltered: sorted.length };
  }, [campaigns, searchQuery, sortColumn, sortDirection, currentPage]);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('desc');
    }
    setCurrentPage(0);
  };

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortColumn !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Nenhuma campanha encontrada</p>
        <p className="text-sm">Clique em Sincronizar para buscar suas campanhas</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search + Sync */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar campanha, tipo ou MLB..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(0); }}
            className="pl-9 h-9 text-sm"
          />
        </div>
        {onTriggerSync && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            onClick={onTriggerSync}
            disabled={syncState?.status === 'syncing'}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncState?.status === 'syncing' ? 'animate-spin' : ''}`} />
            Sinc
          </Button>
        )}
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[28px] px-1"></TableHead>
              <TableHead className="px-2 py-1.5 cursor-pointer select-none" onClick={() => handleSort('name')}>
                <span className="flex items-center gap-1 text-xs">Campanha <SortIcon col="name" /></span>
              </TableHead>
              <TableHead className="px-2 py-1.5 cursor-pointer select-none" onClick={() => handleSort('status')}>
                <span className="flex items-center gap-1 text-xs">Status <SortIcon col="status" /></span>
              </TableHead>
              <TableHead className="px-2 py-1.5 text-right cursor-pointer select-none" onClick={() => handleSort('budget')}>
                <span className="flex items-center justify-end gap-1 text-xs">Orçam. <SortIcon col="budget" /></span>
              </TableHead>
              <TableHead className="px-2 py-1.5 text-right cursor-pointer select-none" onClick={() => handleSort('spent')}>
                <span className="flex items-center justify-end gap-1 text-xs">Gasto <SortIcon col="spent" /></span>
              </TableHead>
              <TableHead className="px-2 py-1.5 text-right cursor-pointer select-none" onClick={() => handleSort('revenue')}>
                <span className="flex items-center justify-end gap-1 text-xs">Receita <SortIcon col="revenue" /></span>
              </TableHead>
              <TableHead className="px-2 py-1.5 text-right cursor-pointer select-none" onClick={() => handleSort('cpc')}>
                <span className="flex items-center justify-end gap-1 text-xs">CPC <SortIcon col="cpc" /></span>
              </TableHead>
              <TableHead className="px-2 py-1.5 text-right cursor-pointer select-none" onClick={() => handleSort('acos')}>
                <span className="flex items-center justify-end gap-1 text-xs">ACOS <SortIcon col="acos" /></span>
              </TableHead>
              <TableHead className="px-2 py-1.5 text-right cursor-pointer select-none" onClick={() => handleSort('tacos')}>
                <span className="flex items-center justify-end gap-1 text-xs">TACOS <SortIcon col="tacos" /></span>
              </TableHead>
              <TableHead className="px-2 py-1.5 text-right cursor-pointer select-none" onClick={() => handleSort('roas')}>
                <span className="flex items-center justify-end gap-1 text-xs">ROAS <SortIcon col="roas" /></span>
              </TableHead>
              <TableHead className="w-[36px] px-1"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processedData.paginated.map((campaign) => {
              const { acos, roas, revenue, budget, cpc, tacos, spent } = getCampaignMetrics(campaign);
              const isHighAcos = acos > 30;
              const isGoodRoas = roas >= 3;
              const isExpanded = expandedId === campaign.id;

              return (
                <React.Fragment key={campaign.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedId(isExpanded ? null : campaign.id)}
                  >
                    <TableCell className="px-1 py-1.5">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-1.5">
                      <div>
                        <p className="font-medium text-xs truncate max-w-[200px]">{campaign.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {campaign.campaign_type || 'product_ads'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="px-2 py-1.5">{getStatusBadge(campaign.status)}</TableCell>
                    <TableCell className="px-2 py-1.5 text-right text-xs">
                      {budget ? `${formatCurrency(budget)}/dia` : '-'}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-right text-xs font-medium">
                      {formatCurrency(spent)}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-right text-xs font-medium text-success">
                      {formatCurrency(revenue)}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-right text-xs">
                      {formatCurrency(cpc)}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-right text-xs">
                      <span className={`flex items-center justify-end gap-0.5 ${isHighAcos ? 'text-destructive' : 'text-success'}`}>
                        {isHighAcos ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                        {acos.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-right text-xs">
                      <span className={tacos > 30 ? 'text-destructive' : 'text-success'}>
                        {tacos.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-right text-xs">
                      <span className={`font-medium ${isGoodRoas ? 'text-success' : 'text-warning'}`}>
                        {roas.toFixed(2)}x
                      </span>
                    </TableCell>
                    <TableCell className="px-1 py-1.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            {campaign.status === 'active' ? (
                              <><Pause className="h-4 w-4 mr-2" /> Pausar</>
                            ) : (
                              <><Play className="h-4 w-4 mr-2" /> Ativar</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setExpandedId(isExpanded ? null : campaign.id)}>
                            <TrendingUp className="h-4 w-4 mr-2" /> Ver produtos
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${campaign.id}-products`}>
                      <TableCell colSpan={11} className="p-0">
                        <AdsCampaignProducts
                          mlCampaignId={getMlCampaignId(campaign)}
                          sellerId={campaign.seller_id}
                          onClose={() => setExpandedId(null)}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {processedData.totalFiltered} campanha{processedData.totalFiltered !== 1 ? 's' : ''}
          {searchQuery && ` (filtrado de ${campaigns.length})`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={processedData.safePage === 0}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            <ChevronLeft className="h-3 w-3 mr-1" /> Anterior
          </Button>
          <span>
            {processedData.safePage + 1} / {processedData.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={processedData.safePage >= processedData.totalPages - 1}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            Próximo <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
