import { useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useMercado } from '@/contexts/MercadoContext';
import { useMercadoPrefetch } from '@/hooks/useMercadoPrefetch';
import { MercadoCategoryCard } from './MercadoCategoryCard';
import { MercadoCategoryItem } from '@/types/mercado';

// Memoized grid component
export const MercadoCategoryGrid = memo(function MercadoCategoryGrid() {
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

  // Store order snapshot - only set once when data first arrives
  const orderSnapshotRef = useRef<string[]>([]);
  const hasInitialDataRef = useRef(false);

  // Load categories when parent changes
  useEffect(() => {
    // Reset order snapshot on parent change
    hasInitialDataRef.current = false;
    orderSnapshotRef.current = [];
    loadCategories();
  }, [state.currentParentId, loadCategories]);

  // Capture order snapshot on first data load
  useEffect(() => {
    if (state.categories.length > 0 && !hasInitialDataRef.current) {
      orderSnapshotRef.current = state.categories.map(c => c.id);
      hasInitialDataRef.current = true;
    }
  }, [state.categories]);

  // Stable filtered and sorted categories
  const displayCategories = useMemo(() => {
    // Build map of current data
    const dataMap = new Map(state.categories.map(c => [c.id, c]));

    // If we have a frozen order and loading is complete, use it
    let result: MercadoCategoryItem[];
    
    if (orderSnapshotRef.current.length > 0 && !state.isLoadingCategories) {
      // Maintain frozen order, update values
      result = orderSnapshotRef.current
        .map(id => dataMap.get(id))
        .filter((c): c is MercadoCategoryItem => c !== undefined);
      
      // Add any new items not in original order
      const existingIds = new Set(orderSnapshotRef.current);
      const newItems = state.categories.filter(c => !existingIds.has(c.id));
      result.push(...newItems);
    } else {
      result = [...state.categories];
    }

    // Apply search filter (doesn't affect order)
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      result = result.filter(cat => cat.name.toLowerCase().includes(query));
    }

    // Only apply sorting when NOT loading (prevents mid-load reordering)
    if (!state.isLoadingCategories && state.categories.length > 0) {
      const sortedResult = [...result];
      sortedResult.sort((a, b) => {
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
      
      // Update order snapshot with new sorted order
      orderSnapshotRef.current = sortedResult.map(c => c.id);
      return sortedResult;
    }

    return result;
  }, [state.categories, state.searchQuery, state.sortBy, state.sortOrder, state.isLoadingCategories]);

  // Memoized callbacks for each card - use a callback factory
  const createCardHandlers = useCallback((category: MercadoCategoryItem, index: number) => ({
    onNavigate: () => navigateTo(category.id, category.name),
    onDetails: () => openDetails(category.id),
    onMetrics: () => openMetrics(category.id),
    onFavorite: () => toggleFavorite(category.id),
    onCompareToggle: () => toggleComparison(category.id),
    onMouseEnter: () => prefetch.startPrefetch(category.id, index === 0),
    onMouseLeave: () => prefetch.cancelPrefetch(),
  }), [navigateTo, openDetails, openMetrics, toggleFavorite, toggleComparison, prefetch]);

  // Loading state with fixed-size skeletons
  if (state.isLoadingCategories && state.categories.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={`skeleton-${i}`} className="h-[176px] rounded-xl" />
        ))}
      </div>
    );
  }

  // Empty state
  if (displayCategories.length === 0) {
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
      {displayCategories.map((category, index) => {
        const handlers = createCardHandlers(category, index);
        return (
          <MercadoCategoryCard
            key={category.id}
            category={category}
            isCompareMode={state.isCompareMode}
            isSelected={state.comparisonIds.includes(category.id)}
            onNavigate={handlers.onNavigate}
            onDetails={handlers.onDetails}
            onMetrics={handlers.onMetrics}
            onFavorite={handlers.onFavorite}
            onCompareToggle={handlers.onCompareToggle}
            onMouseEnter={handlers.onMouseEnter}
            onMouseLeave={handlers.onMouseLeave}
          />
        );
      })}
    </div>
  );
});
