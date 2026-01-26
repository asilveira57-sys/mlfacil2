import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { AdsFilterState } from '@/types/ads';
import { AdsCampaign } from '@/types/ads';

interface AdsFiltersProps {
  filters: AdsFilterState;
  onChange: (filters: AdsFilterState) => void;
  campaigns: AdsCampaign[];
}

export function AdsFilters({ filters, onChange, campaigns }: AdsFiltersProps) {
  const activeFiltersCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== ''
  ).length;

  const clearFilters = () => onChange({});

  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" />
            Filtros
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Filtros</h4>
              {activeFiltersCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" /> Limpar
                </Button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Campanha</Label>
                <Select
                  value={filters.campaign_id || ''}
                  onValueChange={(v) => onChange({ ...filters, campaign_id: v || undefined })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas</SelectItem>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Status</Label>
                <Select
                  value={filters.status || ''}
                  onValueChange={(v) => onChange({ ...filters, status: v || undefined })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="paused">Pausado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">ACOS mín (%)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    className="mt-1"
                    value={filters.acos_min !== undefined ? filters.acos_min * 100 : ''}
                    onChange={(e) =>
                      onChange({
                        ...filters,
                        acos_min: e.target.value ? Number(e.target.value) / 100 : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">ACOS máx (%)</Label>
                  <Input
                    type="number"
                    placeholder="100"
                    className="mt-1"
                    value={filters.acos_max !== undefined ? filters.acos_max * 100 : ''}
                    onChange={(e) =>
                      onChange({
                        ...filters,
                        acos_max: e.target.value ? Number(e.target.value) / 100 : undefined,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">ROAS mín</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    className="mt-1"
                    value={filters.roas_min || ''}
                    onChange={(e) =>
                      onChange({
                        ...filters,
                        roas_min: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">ROAS máx</Label>
                  <Input
                    type="number"
                    placeholder="10"
                    className="mt-1"
                    value={filters.roas_max || ''}
                    onChange={(e) =>
                      onChange({
                        ...filters,
                        roas_max: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
