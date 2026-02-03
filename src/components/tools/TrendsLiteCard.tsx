import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp } from "lucide-react";

interface TrendItem {
  term: string;
  category: string;
  popularity: number;
  relevance: number;
}

interface TrendsLiteCardProps {
  trend: TrendItem;
  rank: number;
}

export function TrendsLiteCard({ trend, rank }: TrendsLiteCardProps) {
  const { t } = useTranslation('tools');

  const getPopularityColor = (popularity: number) => {
    if (popularity >= 80) return 'bg-green-500';
    if (popularity >= 60) return 'bg-yellow-500';
    return 'bg-orange-500';
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">{rank}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-medium text-foreground truncate">
                {trend.term}
              </h3>
              <Badge variant="secondary" className="text-xs flex-shrink-0">
                {trend.category}
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <TrendingUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1">
                <Progress 
                  value={trend.popularity} 
                  className="h-2"
                />
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {trend.popularity}%
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
