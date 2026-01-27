import { useState, useEffect } from 'react';
import { FolderTree, ChevronRight, TrendingUp, BarChart3, Lock, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CriteriaModal } from './CriteriaModal';
import { DataState, CategoryEligibility, hasPermission } from '@/hooks/useCategoryEligibility';
import { supabase } from '@/integrations/supabase/client';

interface SubcategoryData {
  id: string;
  name: string;
  items_count?: number;
}

interface SubcategoriesSectionProps {
  eligibility: CategoryEligibility | undefined;
  isLoading: boolean;
  parentCategoryId: string | null;
  onSubcategoryClick?: (id: string, name: string) => void;
}

export function SubcategoriesSection({
  eligibility,
  isLoading,
  parentCategoryId,
  onSubcategoryClick,
}: SubcategoriesSectionProps) {
  const [subcategories, setSubcategories] = useState<SubcategoryData[]>([]);
  const [subcatLoading, setSubcatLoading] = useState(true);
  const [showCriteria, setShowCriteria] = useState(false);

  const dataState = eligibility?.dataState || 'DADOS_PUBLICOS_MERCADO';
  const canShowSellerData = hasPermission(eligibility, 'canFetchSellerComparison');

  useEffect(() => {
    async function fetchSubcategories() {
      if (!parentCategoryId) {
        setSubcategories([]);
        setSubcatLoading(false);
        return;
      }

      setSubcatLoading(true);
      try {
        const { data, error } = await supabase
          .from('category_tree_cache')
          .select('id, name, total_items_qty')
          .eq('parent_id', parentCategoryId)
          .order('total_items_qty', { ascending: false });

        if (error) throw error;
        
        setSubcategories(
          (data || []).map((item) => ({
            id: item.id,
            name: item.name,
            items_count: item.total_items_qty || undefined,
          }))
        );
      } catch (err) {
        console.error('Error fetching subcategories:', err);
        setSubcategories([]);
      } finally {
        setSubcatLoading(false);
      }
    }

    fetchSubcategories();
  }, [parentCategoryId]);

  // Seller Mode (when eligible)
  if (canShowSellerData) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5 text-primary" />
            Subcategorias - Desempenho do Seller
            <Badge variant="default" className="ml-2 bg-green-500/10 text-green-600 border-green-500/30">
              Disponível
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subcatLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-40 w-full" />
            </div>
          ) : subcategories.length > 0 ? (
            <div className="space-y-4">
              {/* TODO: Add actual seller evolution chart here */}
              <div className="p-4 bg-muted/30 rounded-lg text-center">
                <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Gráfico de evolução por subcategoria será exibido aqui.
                </p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {subcategories.slice(0, 8).map((sub) => (
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
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Não houve dados para montar comparação.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Market Mode (when blocked by policy)
  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-lg">
              <FolderTree className="h-5 w-5 text-primary" />
              Subcategorias em Alta no Mercado
            </div>
            <Badge variant="outline" className="text-xs">
              Dados Públicos
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Info block about blocked seller data */}
          {dataState === 'DADOS_BLOQUEADOS_POR_POLITICA' && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <Lock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Comparativo por subcategoria com seus dados será liberado após volume mínimo de vendas.
                  </p>
                  <Button 
                    variant="link" 
                    size="sm" 
                    className="h-auto p-0 text-xs text-amber-600 mt-1"
                    onClick={() => setShowCriteria(true)}
                  >
                    Entender critérios
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!parentCategoryId ? (
            <div className="text-center py-8">
              <FolderTree className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Selecione uma categoria para ver subcategorias
              </p>
            </div>
          ) : subcatLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : subcategories.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {subcategories.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => onSubcategoryClick?.(sub.id, sub.name)}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors text-left group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{sub.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <TrendingUp className="h-3 w-3 text-green-500" />
                      <span className="text-xs text-green-600">Em alta</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 ml-2" />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma subcategoria encontrada para esta categoria.
            </p>
          )}
        </CardContent>
      </Card>

      <CriteriaModal 
        open={showCriteria} 
        onOpenChange={setShowCriteria} 
      />
    </>
  );
}
