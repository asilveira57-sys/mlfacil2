import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ToolsLayout } from "./ToolsLayout";
import { 
  ToolsNavTabs, 
  ToolsPromoCard, 
  TrendsLiteFilters, 
  TrendsLiteCard 
} from "@/components/tools";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

// Static trends data - hardcoded as per plan requirements
const TRENDS_DATA = [
  { term: "Fone Bluetooth TWS", category: "Eletrônicos", popularity: 95, relevance: 90 },
  { term: "Capinha iPhone 15", category: "Acessórios", popularity: 92, relevance: 88 },
  { term: "Carregador Portátil 20000mAh", category: "Eletrônicos", popularity: 88, relevance: 85 },
  { term: "Tênis Nike Air Max", category: "Moda", popularity: 85, relevance: 92 },
  { term: "Smart Watch Xiaomi", category: "Eletrônicos", popularity: 83, relevance: 80 },
  { term: "Perfume Importado Masculino", category: "Beleza", popularity: 80, relevance: 75 },
  { term: "Bolsa Feminina Transversal", category: "Moda", popularity: 78, relevance: 82 },
  { term: "Câmera de Segurança WiFi", category: "Casa", popularity: 76, relevance: 78 },
  { term: "Suplemento Whey Protein", category: "Saúde", popularity: 74, relevance: 70 },
  { term: "Organizador de Maquiagem", category: "Beleza", popularity: 72, relevance: 68 },
  { term: "Mouse Gamer RGB", category: "Games", popularity: 70, relevance: 85 },
  { term: "Cadeira Gamer", category: "Games", popularity: 68, relevance: 75 },
  { term: "Luminária LED Mesa", category: "Casa", popularity: 65, relevance: 60 },
  { term: "Cinto Masculino Couro", category: "Moda", popularity: 63, relevance: 58 },
  { term: "Kit Skincare Facial", category: "Beleza", popularity: 60, relevance: 72 },
  { term: "Headset Gamer 7.1", category: "Games", popularity: 58, relevance: 80 },
  { term: "Relógio Masculino Digital", category: "Acessórios", popularity: 55, relevance: 52 },
  { term: "Vitamina C 1000mg", category: "Saúde", popularity: 52, relevance: 48 },
  { term: "Panela Air Fryer", category: "Casa", popularity: 50, relevance: 65 },
  { term: "Óculos de Sol Polarizado", category: "Acessórios", popularity: 48, relevance: 55 },
];

export default function TrendsLiteTool() {
  const { t } = useTranslation('tools');
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState<'popularity' | 'relevance' | 'name'>('popularity');

  const categories = useMemo(() => {
    const uniqueCategories = [...new Set(TRENDS_DATA.map(item => item.category))];
    return uniqueCategories.sort();
  }, []);

  const filteredAndSortedTrends = useMemo(() => {
    let filtered = selectedCategory === "all" 
      ? [...TRENDS_DATA]
      : TRENDS_DATA.filter(item => item.category === selectedCategory);

    switch (sortBy) {
      case 'popularity':
        filtered.sort((a, b) => b.popularity - a.popularity);
        break;
      case 'relevance':
        filtered.sort((a, b) => b.relevance - a.relevance);
        break;
      case 'name':
        filtered.sort((a, b) => a.term.localeCompare(b.term));
        break;
    }

    return filtered;
  }, [selectedCategory, sortBy]);

  return (
    <ToolsLayout>
      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            {t('trends.title')}
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t('trends.subtitle')}
          </p>
        </div>

        {/* Navigation Tabs */}
        <ToolsNavTabs />

        {/* Filters */}
        <TrendsLiteFilters
          categories={categories}
          selectedCategory={selectedCategory}
          sortBy={sortBy}
          onCategoryChange={setSelectedCategory}
          onSortChange={setSortBy}
        />

        {/* Trends List */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedTrends.length > 0 ? (
            filteredAndSortedTrends.map((trend, index) => (
              <TrendsLiteCard
                key={trend.term}
                trend={trend}
                rank={index + 1}
              />
            ))
          ) : (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              {t('trends.no_results')}
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <Alert variant="default" className="bg-muted/50 border-muted">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm text-muted-foreground">
            {t('trends.disclaimer')}
          </AlertDescription>
        </Alert>

        {/* Promo Card */}
        <ToolsPromoCard />
      </div>
    </ToolsLayout>
  );
}
