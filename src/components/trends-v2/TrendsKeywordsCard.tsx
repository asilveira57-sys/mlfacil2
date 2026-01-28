import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, ExternalLink, Sparkles, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================
// TRENDS KEYWORDS CARD
// Shows market trend terms with click-to-filter
// Loading: local skeleton, never fullscreen
// ============================================================

interface TrendItem {
  keyword: string;
  url?: string;
}

interface TrendsKeywordsCardProps {
  trends: TrendItem[];
  isLoading: boolean;
  snapshotDate: string | null;
  selectedKeyword: string | null;
  onKeywordSelect: (keyword: string | null) => void;
}

export function TrendsKeywordsCard({
  trends,
  isLoading,
  snapshotDate,
  selectedKeyword,
  onKeywordSelect,
}: TrendsKeywordsCardProps) {
  const [showAll, setShowAll] = useState(false);
  
  const displayedTrends = showAll ? trends : trends.slice(0, 12);
  const hasMore = trends.length > 12;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Tendências de Mercado
          </CardTitle>
          <CardDescription>Termos em alta na categoria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (trends.length === 0) {
    return (
      <Card className="opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Tendências de Mercado
          </CardTitle>
          <CardDescription>Selecione uma categoria para ver tendências</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aguardando dados de tendência</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Tendências de Mercado
            </CardTitle>
            <CardDescription>
              {trends.length} termos em alta
              {snapshotDate && (
                <span className="ml-2 text-[10px]">
                  • {new Date(snapshotDate).toLocaleDateString('pt-BR')}
                </span>
              )}
            </CardDescription>
          </div>
          {selectedKeyword && (
            <Badge 
              variant="secondary" 
              className="cursor-pointer"
              onClick={() => onKeywordSelect(null)}
            >
              Limpar filtro
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {displayedTrends.map((trend, index) => (
            <button
              key={trend.keyword}
              onClick={() => onKeywordSelect(
                selectedKeyword === trend.keyword ? null : trend.keyword
              )}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                "border hover:shadow-sm",
                selectedKeyword === trend.keyword
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 hover:bg-muted border-transparent"
              )}
            >
              {index < 3 && (
                <ArrowUpRight className="h-3 w-3" />
              )}
              <span>{trend.keyword}</span>
              {trend.url && (
                <a
                  href={trend.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="opacity-50 hover:opacity-100"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </button>
          ))}
        </div>
        
        {hasMore && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="mt-4 text-sm text-muted-foreground hover:text-foreground"
          >
            {showAll ? 'Ver menos' : `Ver mais ${trends.length - 12} termos`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
