import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TrendItem {
  term: string;
  category: string;
  subcategory: string;
  popularity: number;
  relevance: number;
  growth: 'up' | 'down' | 'stable';
  rank: number;
}

interface TrendsLiteCardProps {
  trend: TrendItem;
}

export function TrendsLiteCard({ trend }: TrendsLiteCardProps) {
  const { t } = useTranslation('tools');

  const getGrowthIcon = (growth: 'up' | 'down' | 'stable') => {
    switch (growth) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-emerald-500" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-destructive" />;
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getGrowthLabel = (growth: 'up' | 'down' | 'stable') => {
    switch (growth) {
      case 'up':
        return t('trends.trend_up');
      case 'down':
        return t('trends.trend_down');
      default:
        return t('trends.trend_stable');
    }
  };

  const getGrowthBadgeVariant = (growth: 'up' | 'down' | 'stable') => {
    switch (growth) {
      case 'up':
        return 'default';
      case 'down':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Rank badge */}
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">#{trend.rank}</span>
          </div>
          
          <div className="flex-1 min-w-0 space-y-3">
            {/* Title and growth */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium text-foreground leading-tight">
                {trend.term}
              </h3>
              <div className="flex items-center gap-1 flex-shrink-0" title={getGrowthLabel(trend.growth)}>
                {getGrowthIcon(trend.growth)}
              </div>
            </div>
            
            {/* Category badges */}
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-xs">
                {trend.category}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {trend.subcategory}
              </Badge>
            </div>
            
            {/* Popularity bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t('trends.popularity_label')}</span>
                <span className="font-medium text-foreground">{trend.popularity}%</span>
              </div>
              <Progress value={trend.popularity} className="h-2" />
            </div>
            
            {/* Growth indicator */}
            <div className="flex items-center gap-2">
              <Badge variant={getGrowthBadgeVariant(trend.growth) as any} className="text-xs">
                {getGrowthIcon(trend.growth)}
                <span className="ml-1">{getGrowthLabel(trend.growth)}</span>
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
