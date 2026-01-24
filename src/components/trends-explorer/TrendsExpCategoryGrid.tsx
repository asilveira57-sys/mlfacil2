import { useEffect, useMemo } from 'react';
import { useTrendsExplorer } from '@/contexts/TrendsExplorerContext';
import { TrendsExpCategoryCard } from './TrendsExpCategoryCard';
import { Skeleton } from '@/components/ui/skeleton';

export function TrendsExpCategoryGrid() {
  const { state, loadCategories } = useTrendsExplorer();
  const { categories, isLoadingCategories, searchQuery, sortBy, sortOrder, currentParentId } = state;

  // Load categories when parent changes
  useEffect(() => {
    loadCategories();
  }, [currentParentId, loadCategories]);

  // Filter and sort categories
  const filteredCategories = useMemo(() => {
    let result = [...categories];

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(cat => cat.name.toLowerCase().includes(query));
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'share':
          comparison = a.share_percent - b.share_percent;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'total':
          comparison = a.total_count - b.total_count;
          break;
        case 'delta':
          comparison = (a.delta_24h || 0) - (b.delta_24h || 0);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [categories, searchQuery, sortBy, sortOrder]);

  if (isLoadingCategories) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-7 w-7 rounded" />
            </div>
            <Skeleton className="h-2 w-full mb-4" />
            <Skeleton className="h-6 w-20 mb-4" />
            <div className="flex gap-2 pt-2 border-t border-border/50">
              <Skeleton className="h-7 flex-1" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-7 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (filteredCategories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">
          {searchQuery ? 'Nenhuma categoria encontrada para a busca.' : 'Nenhuma categoria disponível.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {filteredCategories.map((category, index) => (
        <TrendsExpCategoryCard key={category.id} category={category} index={index} />
      ))}
    </div>
  );
}
