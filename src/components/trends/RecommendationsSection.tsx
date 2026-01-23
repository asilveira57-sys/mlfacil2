import { useState } from 'react';
import { Lightbulb, TrendingUp, TrendingDown, DollarSign, Package, Target, Lock, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CriteriaModal } from './CriteriaModal';
import { 
  CategoryEligibility, 
  hasPermission 
} from '@/hooks/useCategoryEligibility';

interface RecommendationsSectionProps {
  eligibility: CategoryEligibility | undefined;
  isLoading: boolean;
  categoryName: string;
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
    icon: Package,
    title: 'Explore Subcategorias',
    description: 'Analise subcategorias com menos concorrência para encontrar nichos promissores.',
    type: 'info',
  },
  {
    icon: TrendingUp,
    title: 'Palavras-chave em Alta',
    description: 'Use os termos mais buscados para otimizar títulos e descrições.',
    type: 'opportunity',
  },
  {
    icon: DollarSign,
    title: 'Análise de Preços',
    description: 'Compare seus preços com os mais vendidos do mercado para ajustar posicionamento.',
    type: 'info',
  },
];

// Seller-specific recommendations (only when eligible)
const SELLER_RECOMMENDATIONS: Recommendation[] = [
  {
    icon: Target,
    title: 'Oportunidade de Crescimento',
    description: 'Você está abaixo da média de vendas da categoria. Considere ações promocionais.',
    type: 'opportunity',
  },
  {
    icon: DollarSign,
    title: 'Ajuste de Preço',
    description: 'Seus produtos estão acima da média. Avalie se a margem justifica o posicionamento.',
    type: 'warning',
  },
];

export function RecommendationsSection({
  eligibility,
  isLoading,
  categoryName,
}: RecommendationsSectionProps) {
  const [showCriteria, setShowCriteria] = useState(false);
  const canFetchSeller = hasPermission(eligibility, 'canFetchSellerPerformance');

  // Loading is quick, just show market recommendations
  const recommendations = canFetchSeller 
    ? [...SELLER_RECOMMENDATIONS, ...MARKET_RECOMMENDATIONS]
    : MARKET_RECOMMENDATIONS;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-lg">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              Recomendações Estratégicas
            </div>
            {!canFetchSeller && (
              <Badge variant="outline" className="text-xs">
                Baseado em Mercado
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recommendations.map((rec, idx) => {
              const Icon = rec.icon;
              const bgColor = rec.type === 'opportunity' 
                ? 'bg-green-500/5 border-green-500/20' 
                : rec.type === 'warning'
                  ? 'bg-amber-500/5 border-amber-500/20'
                  : 'bg-muted/50 border-muted';
              const iconColor = rec.type === 'opportunity' 
                ? 'text-green-500' 
                : rec.type === 'warning'
                  ? 'text-amber-500'
                  : 'text-muted-foreground';
              
              return (
                <div 
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${bgColor}`}
                >
                  <Icon className={`h-5 w-5 ${iconColor} shrink-0 mt-0.5`} />
                  <div>
                    <p className="font-medium text-sm">{rec.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {rec.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          
          {!canFetchSeller && (
            <div className="mt-4 p-3 bg-muted/30 rounded-lg border border-dashed">
              <div className="flex items-start gap-2">
                <Lock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    Recomendações personalizadas baseadas no seu desempenho ficam disponíveis 
                    após atingir volume mínimo de vendas na categoria.
                  </p>
                  <Button 
                    variant="link" 
                    size="sm" 
                    className="h-auto p-0 text-xs text-primary mt-1"
                    onClick={() => setShowCriteria(true)}
                  >
                    <HelpCircle className="h-3 w-3 mr-1" />
                    Entender critérios
                  </Button>
                </div>
              </div>
            </div>
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
