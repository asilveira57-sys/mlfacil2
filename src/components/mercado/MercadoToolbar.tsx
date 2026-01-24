import { Search, ArrowUpDown, GitCompare, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useMercado } from '@/contexts/MercadoContext';

export function MercadoToolbar() {
  const {
    state,
    setSearch,
    setSort,
    toggleCompareMode,
    clearComparison,
  } = useMercado();

  const sortLabels: Record<string, string> = {
    share: 'Representatividade',
    name: 'Nome',
    total: 'Total de Itens',
    delta: 'Variação 24h',
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
      {/* Search */}
      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar categoria..."
          value={state.searchQuery}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-2">
        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowUpDown className="h-4 w-4" />
              {sortLabels[state.sortBy]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSort('share', 'desc')}>
              Representatividade
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSort('name', 'asc')}>
              Nome (A-Z)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSort('total', 'desc')}>
              Total de Itens
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSort('delta', 'desc')}>
              Variação 24h
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Compare Mode */}
        <Button
          variant={state.isCompareMode ? 'default' : 'outline'}
          size="sm"
          className="gap-2"
          onClick={toggleCompareMode}
        >
          <GitCompare className="h-4 w-4" />
          Comparar
          {state.comparisonIds.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {state.comparisonIds.length}
            </Badge>
          )}
        </Button>

        {state.isCompareMode && state.comparisonIds.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearComparison}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
