import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Minus, Search } from "lucide-react";

interface KeywordItem {
  keyword: string;
  category: string;
  trend: 'up' | 'down' | 'stable';
}

interface KeywordsSectionProps {
  keywords: KeywordItem[];
  selectedCategory: string;
}

export function KeywordsSection({ keywords, selectedCategory }: KeywordsSectionProps) {
  const { t } = useTranslation('tools');

  const filteredKeywords = selectedCategory === "all" 
    ? keywords.slice(0, 5)
    : keywords.filter(k => k.category === selectedCategory).slice(0, 5);

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-primary" />;
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getTrendLabel = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return t('trends.trend_up');
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
        <div className="space-y-2">
          {filteredKeywords.map((item, index) => (
            <div 
              key={`${item.keyword}-${index}`}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-medium text-muted-foreground w-5">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-foreground text-sm">
                    {item.keyword}
                  </p>
                  {selectedCategory === "all" && (
                    <Badge variant="outline" className="text-xs mt-1">
                      {item.category}
                    </Badge>
                  )}
                </div>
              </div>
              <div 
                className="flex items-center gap-1 flex-shrink-0" 
                title={getTrendLabel(item.trend)}
              >
                {getTrendIcon(item.trend)}
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {getTrendLabel(item.trend)}
                </span>
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
