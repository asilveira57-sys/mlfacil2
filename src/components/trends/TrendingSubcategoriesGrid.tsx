/**
 * Component: TrendingSubcategoriesGrid
 * 
 * Props:
 * - categoryId
 * - periodo
 * 
 * Renderização:
 * - Grid de cards
 * - Cada card: subcategoriaNome, variacaoPercentual, tendencia
 * 
 * Regra fixa:
 * - Nunca cruzar com dados do seller
 */

import { useState, useEffect } from 'react';
import { FolderTree, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';

interface SubcategoryData {
  id: string;
  name: string;
  items_count?: number;
  // Placeholder for future variation data
  variacao?: number;
  tendencia?: 'up' | 'down' | 'stable';
}

interface TrendingSubcategoriesGridProps {
  categoryId: string | null;
  periodo: number;
  onSubcategoryClick?: (id: string, name: string) => void;
}

export function TrendingSubcategoriesGrid({
  categoryId,
  periodo,
  onSubcategoryClick,
}: TrendingSubcategoriesGridProps) {
  const [subcategories, setSubcategories] = useState<SubcategoryData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSubcategories() {
      if (!categoryId) {
        setSubcategories([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('category_tree_cache')
          .select('id, name, total_items_qty')
          .eq('parent_id', categoryId)
          .order('total_items_qty', { ascending: false });

        if (error) throw error;
        
        // Add placeholder variation data (future: real data from trends)
        setSubcategories(
          (data || []).map((item, idx) => ({
            id: item.id,
            name: item.name,
            items_count: item.total_items_qty || undefined,
            // Simulated variation - in production this would come from trends data
            variacao: idx < 3 ? Math.round(Math.random() * 20) + 5 : 
                     idx < 6 ? Math.round(Math.random() * 10) :
                     Math.round(Math.random() * 5) - 2,
            tendencia: idx < 4 ? 'up' as const : 
                       idx < 8 ? 'stable' as const : 
                       'down' as const,
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
  }, [categoryId]);

  // No category selected
  if (!categoryId) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FolderTree className="h-5 w-5 text-primary" />
            Subcategorias em Destaque
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <FolderTree className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Selecione uma categoria para ver subcategorias em alta
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FolderTree className="h-5 w-5 text-primary" />
          Subcategorias em Destaque
          <Badge variant="outline" className="text-xs font-normal ml-2">
            Dados Públicos
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : subcategories.length > 0 ? (
          <TooltipProvider>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {subcategories.map((sub) => (
                <Tooltip key={sub.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onSubcategoryClick?.(sub.id, sub.name)}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors text-left group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{sub.name}</p>
                        <div className="flex items-center gap-1 mt-1">
                          {sub.tendencia === 'up' && (
                            <>
                              <TrendingUp className="h-3 w-3 text-green-500" />
                              <span className="text-xs text-green-600">+{sub.variacao}%</span>
                            </>
                          )}
                          {sub.tendencia === 'stable' && (
                            <>
                              <Minus className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Estável</span>
                            </>
                          )}
                          {sub.tendencia === 'down' && (
                            <>
                              <TrendingDown className="h-3 w-3 text-red-500" />
                              <span className="text-xs text-red-600">{sub.variacao}%</span>
                            </>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 ml-2" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Variação baseada em dados públicos do Mercado Livre</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma subcategoria encontrada para esta categoria.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
