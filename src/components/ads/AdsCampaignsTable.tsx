import { useState } from 'react';
import { MoreHorizontal, Pause, Play, TrendingUp, TrendingDown, ChevronDown, ChevronRight } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AdsCampaign } from '@/types/ads';
import { AdsCampaignProducts } from './AdsCampaignProducts';

interface AdsCampaignsTableProps {
  campaigns: AdsCampaign[];
  onSelectCampaign?: (campaign: AdsCampaign) => void;
}

export function AdsCampaignsTable({ campaigns, onSelectCampaign }: AdsCampaignsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      <Badge variant={variants[status] || 'secondary'}>
        {labels[status] || status}
      </Badge>
    );
  };

  const getCampaignMetrics = (campaign: AdsCampaign) => {
    const metrics = campaign.raw_data?.metrics as Record<string, number> | undefined;
    const spent = metrics?.cost || campaign.spent_total || 0;
    const revenue = metrics?.total_amount || 0;
    const acos = metrics?.acos || (revenue > 0 ? (spent / revenue) * 100 : 0);
    const roas = metrics?.roas || (spent > 0 ? revenue / spent : 0);
    const budget = (campaign.raw_data?.budget as number) || campaign.daily_budget || null;
    return { acos, roas, revenue, budget };
  };

  const getMlCampaignId = (campaign: AdsCampaign): string => {
    const rawId = campaign.raw_data?.id;
    return rawId ? String(rawId) : campaign.ml_campaign_id;
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
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]"></TableHead>
            <TableHead>Campanha</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Orçamento</TableHead>
            <TableHead className="text-right">Gasto</TableHead>
            <TableHead className="text-right">Receita</TableHead>
            <TableHead className="text-right">ACOS</TableHead>
            <TableHead className="text-right">ROAS</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((campaign) => {
            const { acos, roas, revenue, budget } = getCampaignMetrics(campaign);
            const isHighAcos = acos > 30;
            const isGoodRoas = roas >= 3;
            const isExpanded = expandedId === campaign.id;

            return (
              <>
                <TableRow
                  key={campaign.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setExpandedId(isExpanded ? null : campaign.id)}
                >
                  <TableCell className="pr-0">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{campaign.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {campaign.campaign_type || 'product_ads'}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                  <TableCell className="text-right">
                    {budget
                      ? `${formatCurrency(budget)}/dia`
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(campaign.spent_total)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-success">
                    {formatCurrency(revenue)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`flex items-center justify-end gap-1 ${isHighAcos ? 'text-destructive' : 'text-success'}`}>
                      {isHighAcos ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                      {acos.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`font-medium ${isGoodRoas ? 'text-success' : 'text-warning'}`}>
                      {roas.toFixed(2)}x
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          {campaign.status === 'active' ? (
                            <>
                              <Pause className="h-4 w-4 mr-2" /> Pausar
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-2" /> Ativar
                            </>
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
                    <TableCell colSpan={9} className="p-0">
                      <AdsCampaignProducts
                        mlCampaignId={getMlCampaignId(campaign)}
                        sellerId={campaign.seller_id}
                        onClose={() => setExpandedId(null)}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
