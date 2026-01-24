import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  FolderTree, 
  Pin, 
  TrendingUp, 
  RefreshCw, 
  ChevronRight,
  Package,
  DollarSign,
  Star
} from 'lucide-react';
import { 
  useSellerCategories, 
  useCategorySyncState, 
  useSyncCategories,
  formatGmv,
  type SellerCategory 
} from '@/hooks/useSellerCategories';
import { useTrends } from '@/contexts/TrendsContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface SellerCategorySelectorProps {
  onSelect: (categoryId: string, categoryName: string) => void;
  fallbackCategories?: { id: string; name: string }[];
}

export function SellerCategorySelector({ 
  onSelect,
  fallbackCategories = [] 
}: SellerCategorySelectorProps) {
  const { state, effectiveCategoryId } = useTrends();
  const accountId = state.selectedAccountId;
  
  const { data: sellerCategories, isLoading: categoriesLoading } = useSellerCategories(accountId);
  const { data: syncState } = useCategorySyncState(accountId);
  const syncMutation = useSyncCategories();
  
  const [showAllCategories, setShowAllCategories] = useState(false);
  
  const handleSync = async () => {
    if (!accountId) return;
    
    toast.info('Sincronizando categorias...');
    try {
      await syncMutation.mutateAsync(accountId);
      toast.success('Categorias sincronizadas!');
    } catch (error) {
      console.error('[SellerCategorySelector] Sync error:', error);
      toast.error('Erro ao sincronizar categorias');
    }
  };
  
  const handleCategoryClick = (cat: SellerCategory) => {
    onSelect(cat.category_id, cat.category_name);
  };
  
  const handleFallbackClick = (cat: { id: string; name: string }) => {
    onSelect(cat.id, cat.name);
  };
  
  // Render loading state
  if (categoriesLoading) {
    return (
      <Card className="border shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-40" />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }
  
  // Check if we have seller categories
  const hasSellerCategories = sellerCategories && sellerCategories.length > 0;
  const pinnedCategories = sellerCategories?.filter(c => c.is_pinned_auto) || [];
  const activeCategories = sellerCategories?.filter(c => !c.is_pinned_auto) || [];
  
  return (
    <Card className="border shadow-lg max-w-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Suas Categorias</CardTitle>
          </div>
          
          {accountId && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleSync}
              disabled={syncMutation.isPending || syncState?.status === 'running'}
              className="h-8"
            >
              <RefreshCw className={cn(
                "h-4 w-4 mr-1",
                (syncMutation.isPending || syncState?.status === 'running') && "animate-spin"
              )} />
              {syncState?.status === 'running' ? 'Sincronizando...' : 'Atualizar'}
            </Button>
          )}
        </div>
        
        {/* Sync Status */}
        {syncState?.last_sync_at && (
          <p className="text-xs text-muted-foreground mt-1">
            Última atualização: {new Date(syncState.last_sync_at).toLocaleDateString('pt-BR')}
            {syncState.categories_found > 0 && ` • ${syncState.categories_found} categorias`}
          </p>
        )}
      </CardHeader>
      
      <CardContent className="p-0">
        <ScrollArea className="max-h-[400px]">
          <div className="p-4 pt-0 space-y-4">
            
            {/* Seller Categories Section */}
            {hasSellerCategories ? (
              <>
                {/* Pinned Categories */}
                {pinnedCategories.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Pin className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Sempre Disponíveis
                      </span>
                    </div>
                    <div className="space-y-1">
                      {pinnedCategories.map(cat => (
                        <CategoryButton
                          key={cat.category_id}
                          category={cat}
                          isSelected={effectiveCategoryId === cat.category_id}
                          onClick={() => handleCategoryClick(cat)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Active Categories */}
                {activeCategories.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Ativas
                      </span>
                    </div>
                    <div className="space-y-1">
                      {activeCategories.map(cat => (
                        <CategoryButton
                          key={cat.category_id}
                          category={cat}
                          isSelected={effectiveCategoryId === cat.category_id}
                          onClick={() => handleCategoryClick(cat)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhuma categoria detectada</p>
                <p className="text-xs mt-1">Suas categorias aparecerão aqui com base em suas vendas</p>
                {accountId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSync}
                    disabled={syncMutation.isPending}
                    className="mt-3"
                  >
                    <RefreshCw className={cn("h-4 w-4 mr-2", syncMutation.isPending && "animate-spin")} />
                    Detectar Categorias
                  </Button>
                )}
              </div>
            )}
            
            {/* Separator and Fallback */}
            {fallbackCategories.length > 0 && (
              <>
                <Separator />
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllCategories(!showAllCategories)}
                    className="w-full justify-between text-muted-foreground"
                  >
                    <span className="text-xs">Ver todas as categorias</span>
                    <ChevronRight className={cn(
                      "h-4 w-4 transition-transform",
                      showAllCategories && "rotate-90"
                    )} />
                  </Button>
                  
                  {showAllCategories && (
                    <div className="mt-2 space-y-1">
                      {fallbackCategories.map(cat => (
                        <Button
                          key={cat.id}
                          variant={effectiveCategoryId === cat.id ? 'secondary' : 'ghost'}
                          size="sm"
                          className="w-full justify-start text-left h-auto py-2"
                          onClick={() => handleFallbackClick(cat)}
                        >
                          <span className="truncate">{cat.name}</span>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ============================================================
// CATEGORY BUTTON COMPONENT
// ============================================================

interface CategoryButtonProps {
  category: SellerCategory;
  isSelected: boolean;
  onClick: () => void;
}

function CategoryButton({ category, isSelected, onClick }: CategoryButtonProps) {
  return (
    <Button
      variant={isSelected ? 'secondary' : 'ghost'}
      size="sm"
      className={cn(
        "w-full justify-start text-left h-auto py-2.5 px-3",
        isSelected && "ring-1 ring-primary/30"
      )}
      onClick={onClick}
    >
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{category.category_name}</span>
          {category.is_pinned_auto && (
            <Star className="h-3 w-3 text-amber-500 flex-shrink-0" />
          )}
        </div>
        
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Package className="h-3 w-3" />
            {category.orders_count_90d} pedidos
          </span>
          <span className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            {formatGmv(category.gmv_90d)}
          </span>
        </div>
        
        {category.category_path.length > 1 && (
          <span className="text-[10px] text-muted-foreground/70 truncate">
            {category.category_path.join(' > ')}
          </span>
        )}
      </div>
      
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </Button>
  );
}
