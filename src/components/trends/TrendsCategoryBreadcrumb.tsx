import { ChevronRight, ChevronDown, FolderTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTrends } from '@/contexts/TrendsContext';
import { useCategoryBreadcrumb, useSubcategories } from '@/hooks/useSubcategories';
import { useState } from 'react';

// ============================================================
// BREADCRUMB DE NAVEGAÇÃO NA CATEGORIA
// Permite navegar para cima (pai) ou para baixo (filhos)
// ============================================================

export function TrendsCategoryBreadcrumb() {
  const { state, setCategory, effectiveCategoryId, hasCategory } = useTrends();
  const { data: breadcrumb, isLoading: breadcrumbLoading } = useCategoryBreadcrumb(effectiveCategoryId);
  const [subcatsOpen, setSubcatsOpen] = useState(false);
  
  // Fetch subcategories of the current category
  const { data: subcategories, isLoading: subcatsLoading } = useSubcategories(
    effectiveCategoryId,
    subcatsOpen // Only fetch when popover is open
  );
  
  if (!hasCategory) return null;
  
  if (breadcrumbLoading) {
    return (
      <div className="flex items-center gap-2">
        <FolderTree className="h-4 w-4 text-muted-foreground" />
        <Skeleton className="h-4 w-48" />
      </div>
    );
  }
  
  if (!breadcrumb || breadcrumb.length === 0) return null;
  
  const handleBreadcrumbClick = (id: string, name: string) => {
    setCategory(id, name);
  };
  
  const handleSubcategoryClick = (id: string, name: string) => {
    setCategory(id, name);
    setSubcatsOpen(false);
  };
  
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-sm">
      <FolderTree className="h-4 w-4 text-muted-foreground shrink-0" />
      
      {breadcrumb.map((item, index) => {
        const isLast = index === breadcrumb.length - 1;
        
        return (
          <span key={item.id} className="flex items-center gap-1.5">
            {index > 0 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
            {isLast ? (
              <span className="font-medium text-foreground">{item.name}</span>
            ) : (
              <button
                onClick={() => handleBreadcrumbClick(item.id, item.name)}
                className="text-muted-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
              >
                {item.name}
              </button>
            )}
          </span>
        );
      })}
      
      {/* Subcategories dropdown */}
      <Popover open={subcatsOpen} onOpenChange={setSubcatsOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-muted-foreground">
            <ChevronDown className="h-3 w-3" />
            Subcategorias
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <ScrollArea className="max-h-64">
            {subcatsLoading ? (
              <div className="p-3 space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : subcategories && subcategories.length > 0 ? (
              <div className="py-1">
                {subcategories.map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => handleSubcategoryClick(sub.id, sub.name)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between"
                  >
                    <span className="truncate">{sub.name}</span>
                    {sub.total_items_qty != null && (
                      <span className="text-xs text-muted-foreground ml-2 shrink-0">
                        {sub.total_items_qty.toLocaleString('pt-BR')} itens
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Nenhuma subcategoria encontrada
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
