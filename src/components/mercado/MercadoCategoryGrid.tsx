import { useEffect, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useMercado } from '@/contexts/MercadoContext';
import { useMercadoPrefetch } from '@/hooks/useMercadoPrefetch';
import { MercadoCategoryCard } from './MercadoCategoryCard';

export function MercadoCategoryGrid() {
  const {
    state,
    loadCategories,
    navigateTo,
    openDetails,
    openMetrics,
    toggleFavorite,
    toggleComparison,
    prefetchDetails,
    prefetchMetrics,
  } = useMercado();

  const prefetch = useMercadoPrefetch({
    prefetchDetails,
    prefetchMetrics,
  });

  // Load categories when parent changes
  useEffect(() => {
    loadCategories();
  }, [state.currentParentId, loadCategories]);

  // Filter and sort categories
  const filteredCategories = useMemo(() => {
    let result = [...state.categories];

    // Filter by search
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      result = result.filter(cat =>
        cat.name.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (state.sortBy) {
        case 'share':
          comparison = b.share_percent - a.share_percent;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'total':
          comparison = b.total_count - a.total_count;
          break;
        case 'delta':
          comparison = (b.delta_24h ?? 0) - (a.delta_24h ?? 0);
          break;
      }
      return state.sortOrder === 'asc' ? -comparison : comparison;
    });

    return result;
  }, [state.categories, state.searchQuery, state.sortBy, state.sortOrder]);

  // Loading state
  if (state.isLoadingCategories) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    );
  }

  // Empty state
  if (filteredCategories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">
          {state.searchQuery
            ? 'Nenhuma categoria encontrada para essa busca.'
            : 'Nenhuma categoria disponível.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {filteredCategories.map((category, index) => (
        <MercadoCategoryCard
          key={category.id}
          category={category}
          isCompareMode={state.isCompareMode}
          isSelected={state.comparisonIds.includes(category.id)}
          onNavigate={() => navigateTo(category.id, category.name)}
          onDetails={() => openDetails(category.id)}
          onMetrics={() => openMetrics(category.id)}
          onFavorite={() => toggleFavorite(category.id)}
          onCompareToggle={() => toggleComparison(category.id)}
          onMouseEnter={() => prefetch.startPrefetch(category.id, index === 0)}
          onMouseLeave={() => prefetch.cancelPrefetch()}
        />
      ))}
    </div>
  );
}
