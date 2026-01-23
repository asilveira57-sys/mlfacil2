/**
 * Component: StrategyRecommendationsSection
 * 
 * Props:
 * - categoriaStatus
 * - categoryId
 * 
 * Elegível:
 * - Ajustes de preço
 * - Oportunidades de subcategoria
 * - Sugestões baseadas no desempenho real
 * 
 * Pouca base / Sem vendas:
 * - Recomendações baseadas apenas em mercado:
 *   - Subcategorias para entrada
 *   - Produtos com menor concorrência
 *   - Palavras-chave com crescimento recente
 */

import { useState } from 'react';
import { Lightbulb, TrendingUp, AlertTriangle, Target, Lock, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EligibilityCriteriaModal } from './EligibilityCriteriaModal';
import { CategoryEligibility, EligibilityState, hasPermission } from '@/hooks/useCategoryEligibility';

interface StrategyRecommendationsSectionProps {
  categoriaStatus: EligibilityState;
  categoryId: string | null;
  categoryName: string;
  eligibility: CategoryEligibility | undefined;
  isLoading: boolean;
}

interface Recommendation {
  icon: typeof TrendingUp;
  title: string;
  description: string;
  type: 'opportunity' | 'warning' | 'info';
}

// Recommendations based on market data (always available)
const MARKET_RECOMMENDATIONS: Recommendation[] = [
  {
    icon: TrendingUp,
    title: 'Subcategorias para entrada',
    description: 'Explore subcategorias em alta com menor concorrência para diversificar seu portfólio.',
    type: 'opportunity',
  },
  {
    icon: Target,
    title: 'Palavras-chave em crescimento',
    description: 'Monitore termos de busca em alta para otimizar títulos e descrições de anúncios.',
    type: 'info',
  },
  {
    icon: Lightbulb,
    title: 'Produtos com potencial',
    description: 'Analise os mais vendidos para identificar gaps de mercado e oportunidades.',
    type: 'opportunity',
  },
];

// Recommendations based on seller performance (conditional)
const SELLER_RECOMMENDATIONS: Recommendation[] = [
  {
    icon: TrendingUp,
    title: 'Ajustar preços competitivos',
    description: 'Seus produtos estão posicionados acima da média do mercado. Considere revisar a estratégia de pricing.',
    type: 'warning',
  },
  {
    icon: Target,
    title: 'Oportunidade de expansão',
    description: 'Você tem boa performance nesta categoria. Considere expandir para subcategorias relacionadas.',
    type: 'opportunity',
  },
  {
    icon: Lightbulb,
    title: 'Meta sugerida',
    description: 'Com base no seu desempenho, uma meta de crescimento de 15% é alcançável no próximo período.',
    type: 'info',
  },
];

export function StrategyRecommendationsSection({
  categoriaStatus,
  categoryId,
  categoryName,
  eligibility,
  isLoading,
}: StrategyRecommendationsSectionProps) {
  const [showCriteria, setShowCriteria] = useState(false);

  const canFetchSeller = hasPermission(eligibility, 'canFetchSellerPerformance');

  // Don't render if no category selected
  if (!categoryId) {
    return null;
  }

  // Loading state
  if (isLoading) {
    return null;
  }

  // Determine which recommendations to show
  const recommendations = canFetchSeller 
    ? [...SELLER_RECOMMENDATIONS, ...MARKET_RECOMMENDATIONS.slice(0, 1)]
    : MARKET_RECOMMENDATIONS;

  const getTypeStyles = (type: Recommendation['type']) => {
    switch (type) {
      case 'opportunity':
        return 'bg-green-500/10 border-green-500/30 text-green-600';
      case 'warning':
        return 'bg-amber-500/10 border-amber-500/30 text-amber-600';
      case 'info':
      default:
        return 'bg-blue-500/10 border-blue-500/30 text-blue-600';
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-lg">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              Recomendações Estratégicas
            </div>
            <Badge variant="outline" className="text-xs font-normal">
              {canFetchSeller ? 'Personalizado' : 'Baseado em Mercado'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recommendations.map((rec, idx) => {
              const Icon = rec.icon;
              return (
                <div 
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${getTypeStyles(rec.type)}`}
                >
                  <Icon className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{rec.title}</p>
                    <p className="text-xs opacity-80 mt-0.5">{rec.description}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Show locked seller recommendations section when not eligible */}
          {!canFetchSeller && (
            <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-dashed">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  Recomendações personalizadas bloqueadas
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Sugestões baseadas no seu desempenho real serão liberadas após volume mínimo de vendas.
              </p>
              <Button 
                variant="link" 
                size="sm" 
                className="h-auto p-0 text-xs text-primary"
                onClick={() => setShowCriteria(true)}
              >
                <HelpCircle className="h-3 w-3 mr-1" />
                Entender critérios
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <EligibilityCriteriaModal 
        open={showCriteria} 
        onOpenChange={setShowCriteria} 
      />
    </>
  );
}
