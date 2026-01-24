import { Search, ArrowUpDown, GitCompare, Star } from 'lucide-react';
import { useTrendsExplorer } from '@/contexts/TrendsExplorerContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function TrendsExpToolbar() {
  const { state, setSearch, setSort, toggleCompareMode, clearComparison } = useTrendsExplorer();
  const { searchQuery, sortBy, sortOrder, isCompareMode, comparisonIds } = state;

  const sortOptions = [
    { value: 'share', label: 'Representatividade' },
    { value: 'name', label: 'Nome' },
    { value: 'total', label: 'Total de itens' },
    { value: 'delta', label: 'Variação 24h' },
  ] as const;

  const currentSortLabel = sortOptions.find(o => o.value === sortBy)?.label || 'Ordenar';

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar categorias..."
          value={searchQuery}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Sort */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <ArrowUpDown className="h-4 w-4" />
            <span className="hidden sm:inline">{currentSortLabel}</span>
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {sortOrder === 'asc' ? '↑' : '↓'}
            </Badge>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {sortOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => setSort(
                option.value,
                sortBy === option.value && sortOrder === 'desc' ? 'asc' : 'desc'
              )}
              className={cn(sortBy === option.value && 'bg-accent')}
            >
              {option.label}
              {sortBy === option.value && (
                <span className="ml-auto">{sortOrder === 'asc' ? '↑' : '↓'}</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Compare Mode Toggle */}
      <Button
        variant={isCompareMode ? 'default' : 'outline'}
        size="sm"
        className="h-9 gap-2"
        onClick={toggleCompareMode}
      >
        <GitCompare className="h-4 w-4" />
        <span className="hidden sm:inline">Comparar</span>
        {comparisonIds.length > 0 && (
          <Badge variant={isCompareMode ? 'secondary' : 'default'} className="ml-1 h-5 px-1.5">
            {comparisonIds.length}
          </Badge>
        )}
      </Button>

      {isCompareMode && comparisonIds.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-muted-foreground"
          onClick={clearComparison}
        >
          Limpar
        </Button>
      )}

      {/* Favorites Filter */}
      <Button variant="ghost" size="sm" className="h-9 gap-2">
        <Star className="h-4 w-4" />
        <span className="hidden sm:inline">Favoritos</span>
      </Button>
    </div>
  );
}
