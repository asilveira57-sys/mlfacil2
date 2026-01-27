import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, FolderTree, ChevronRight, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';

interface SubcategoryData {
  id: string;
  name: string;
  parent_id: string | null;
  items_count?: number;
}

interface SubcategoriesHighlightCardProps {
  parentCategoryId: string | null;
  onSubcategoryClick?: (id: string, name: string) => void;
}

export function SubcategoriesHighlightCard({
  parentCategoryId,
  onSubcategoryClick,
}: SubcategoriesHighlightCardProps) {
  const [subcategories, setSubcategories] = useState<SubcategoryData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSubcategories() {
      if (!parentCategoryId) {
        setSubcategories([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('category_tree_cache')
          .select('id, name, parent_id, total_items_qty')
          .eq('parent_id', parentCategoryId)
          .order('total_items_qty', { ascending: false });

        if (error) throw error;
        
        setSubcategories(
          (data || []).map((item) => ({
            id: item.id,
            name: item.name,
            parent_id: item.parent_id,
            items_count: item.total_items_qty || undefined,
          }))
        );
      } catch (err) {
        console.error('Error fetching subcategories:', err);
        setSubcategories([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSubcategories();
  }, [parentCategoryId]);

  if (!parentCategoryId) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FolderTree className="h-5 w-5 text-muted-foreground" />
            Subcategorias em Destaque
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Selecione uma categoria para ver subcategorias
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <FolderTree className="h-5 w-5 text-primary" />
            Subcategorias em Destaque
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-xs">
                  Variação baseada em dados públicos do Mercado Livre
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : subcategories.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {subcategories.map((sub) => (
              <button
                key={sub.id}
                onClick={() => onSubcategoryClick?.(sub.id, sub.name)}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors text-left group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{sub.name}</p>
                  {sub.items_count && (
                    <p className="text-xs text-muted-foreground">
                      {sub.items_count.toLocaleString('pt-BR')} itens
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 ml-2" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma subcategoria encontrada
          </p>
        )}
      </CardContent>
    </Card>
  );
}
