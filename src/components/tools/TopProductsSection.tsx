import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Package } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface ProductTrend {
  term: string;
  category: string;
  subcategory: string;
  popularity: number;
  growth: 'up' | 'down' | 'stable';
  rank: number;
}

interface TopProductsSectionProps {
  products: ProductTrend[];
  selectedCategory: string;
  selectedSubcategory: string;
}

export function TopProductsSection({ products, selectedCategory, selectedSubcategory }: TopProductsSectionProps) {
  const { t } = useTranslation('tools');

  let filteredProducts = [...products];
  
  if (selectedCategory !== "all") {
    filteredProducts = filteredProducts.filter(p => p.category === selectedCategory);
  }
  
  if (selectedSubcategory !== "all") {
    filteredProducts = filteredProducts.filter(p => p.subcategory === selectedSubcategory);
  }

  // Sort by popularity and take top 5
  filteredProducts = filteredProducts
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 5);

  const getTrendIcon = (growth: 'up' | 'down' | 'stable') => {
    switch (growth) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-primary" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-destructive" />;
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getTrendLabel = (growth: 'up' | 'down' | 'stable') => {
    switch (growth) {
      case 'up':
        return t('trends.trend_up');
      case 'down':
        return t('trends.trend_down');
      default:
        return t('trends.trend_stable');
    }
  };

  if (filteredProducts.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="w-5 h-5 text-primary" />
            {t('trends.products_title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            {t('trends.no_results')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Package className="w-5 h-5 text-primary" />
          {t('trends.products_title')}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('trends.products_subtitle')}
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {filteredProducts.map((product, index) => (
            <div 
              key={`${product.term}-${index}`}
              className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="text-lg font-bold text-primary w-6 text-center">
                    #{index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {product.term}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <Badge variant="secondary" className="text-xs">
                        {product.category}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {product.subcategory}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div 
                  className="flex items-center gap-1 flex-shrink-0" 
                  title={getTrendLabel(product.growth)}
                >
                  {getTrendIcon(product.growth)}
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {getTrendLabel(product.growth)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 pl-9">
                <Progress value={product.popularity} className="h-2 flex-1" />
                <span className="text-xs font-medium text-muted-foreground w-10 text-right">
                  {product.popularity}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
