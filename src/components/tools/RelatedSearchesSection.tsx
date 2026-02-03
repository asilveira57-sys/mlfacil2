import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link2 } from "lucide-react";

interface RelatedSearch {
  term: string;
  baseTerm: string;
  category: string;
}

interface RelatedSearchesSectionProps {
  searches: RelatedSearch[];
  selectedCategory: string;
}

export function RelatedSearchesSection({ searches, selectedCategory }: RelatedSearchesSectionProps) {
  const { t } = useTranslation('tools');

  const filteredSearches = selectedCategory === "all" 
    ? searches.slice(0, 5)
    : searches.filter(s => s.category === selectedCategory).slice(0, 5);

  if (filteredSearches.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Link2 className="w-5 h-5 text-primary" />
          {t('trends.related_title')}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('trends.related_subtitle')}
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {filteredSearches.map((item, index) => (
            <div 
              key={`${item.term}-${index}`}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-medium text-muted-foreground w-5">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-foreground text-sm">
                    {item.term}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('trends.related_to')}: <span className="text-primary">{item.baseTerm}</span>
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs flex-shrink-0">
                {item.category}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
