import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Search } from "lucide-react";

interface KeywordItem {
  keyword: string;
  category: string;
  trend: 'up' | 'down' | 'stable';
  rank: number;
}

interface KeywordsSectionProps {
  keywords: KeywordItem[];
  selectedCategory: string;
}

export function KeywordsSection({ keywords, selectedCategory }: KeywordsSectionProps) {
  const { t } = useTranslation('tools');

  const filteredKeywords = selectedCategory === "all" 
    ? keywords 
    : keywords.filter(k => k.category === selectedCategory);

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-emerald-500" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-destructive" />;
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getTrendLabel = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return t('trends.trend_up');
      case 'down':
        return t('trends.trend_down');
      default:
        return t('trends.trend_stable');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Search className="w-5 h-5 text-primary" />
          {t('trends.keywords_title')}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('trends.keywords_subtitle')}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredKeywords.slice(0, 12).map((item, index) => (
            <div 
              key={item.keyword}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-medium text-muted-foreground w-5">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate text-sm">
                    {item.keyword}
                  </p>
                  <Badge variant="outline" className="text-xs mt-1">
                    {item.category}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0" title={getTrendLabel(item.trend)}>
                {getTrendIcon(item.trend)}
              </div>
            </div>
          ))}
        </div>
        {filteredKeywords.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            {t('trends.no_keywords')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
