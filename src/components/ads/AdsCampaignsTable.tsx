import { useState } from 'react';
import { MoreHorizontal, Pause, Play, TrendingUp, TrendingDown } from 'lucide-react';
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

interface AdsCampaignsTableProps {
  campaigns: AdsCampaign[];
  onSelectCampaign?: (campaign: AdsCampaign) => void;
}

export function AdsCampaignsTable({ campaigns, onSelectCampaign }: AdsCampaignsTableProps) {
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

  // Calculate ACOS and ROAS from raw_data metrics if available
  const getCampaignMetrics = (campaign: AdsCampaign) => {
    const metrics = campaign.raw_data?.metrics as Record<string, number> | undefined;
    const spent = campaign.spent_total || 0;
    const revenue = metrics?.revenue || 0;
    const acos = revenue > 0 ? (spent / revenue) * 100 : 0;
    const roas = spent > 0 ? revenue / spent : 0;
    return { acos, roas, revenue };
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
            const { acos, roas, revenue } = getCampaignMetrics(campaign);
            const isHighAcos = acos > 30;
            const isGoodRoas = roas >= 3;

            return (
              <TableRow
                key={campaign.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onSelectCampaign?.(campaign)}
              >
                <TableCell>
                  <div>
                    <p className="font-medium">{campaign.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {campaign.campaign_type || 'Product Ads'}
                    </p>
                  </div>
                </TableCell>
                <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                <TableCell className="text-right">
                  {campaign.daily_budget
                    ? `${formatCurrency(campaign.daily_budget)}/dia`
                    : '-'}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(campaign.spent_total)}
                </TableCell>
                <TableCell className="text-right font-medium text-green-600">
                  {formatCurrency(revenue)}
                </TableCell>
                <TableCell className="text-right">
                  <span className={`flex items-center justify-end gap-1 ${isHighAcos ? 'text-red-500' : 'text-green-500'}`}>
                    {isHighAcos ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                    {acos.toFixed(1)}%
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className={isGoodRoas ? 'text-green-500 font-medium' : 'text-yellow-500'}>
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
                      <DropdownMenuItem>
                        <TrendingUp className="h-4 w-4 mr-2" /> Ver detalhes
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
