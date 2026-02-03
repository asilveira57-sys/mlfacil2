import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ToolsLayout } from "./ToolsLayout";
import { 
  ToolsNavTabs, 
  ToolsPromoCard, 
  TrendsLiteFilters, 
  TrendsLiteCard,
  KeywordsSection
} from "@/components/tools";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

// Expanded trends data with subcategories and growth indicators
const TRENDS_DATA = [
  // Eletrônicos
  { term: "Fone Bluetooth TWS", category: "Eletrônicos", subcategory: "Áudio", popularity: 95, relevance: 90, growth: 'up' as const, rank: 1 },
  { term: "Carregador Portátil 20000mAh", category: "Eletrônicos", subcategory: "Acessórios", popularity: 88, relevance: 85, growth: 'up' as const, rank: 2 },
  { term: "Smart Watch Xiaomi", category: "Eletrônicos", subcategory: "Wearables", popularity: 83, relevance: 80, growth: 'stable' as const, rank: 3 },
  { term: "Câmera de Segurança WiFi", category: "Eletrônicos", subcategory: "Segurança", popularity: 76, relevance: 78, growth: 'up' as const, rank: 4 },
  { term: "Echo Dot 5ª Geração", category: "Eletrônicos", subcategory: "Smart Home", popularity: 72, relevance: 75, growth: 'stable' as const, rank: 5 },
  
  // Acessórios
  { term: "Capinha iPhone 15", category: "Acessórios", subcategory: "Cases", popularity: 92, relevance: 88, growth: 'up' as const, rank: 1 },
  { term: "Relógio Masculino Digital", category: "Acessórios", subcategory: "Relógios", popularity: 55, relevance: 52, growth: 'down' as const, rank: 2 },
  { term: "Óculos de Sol Polarizado", category: "Acessórios", subcategory: "Óculos", popularity: 48, relevance: 55, growth: 'stable' as const, rank: 3 },
  { term: "Pulseira Apple Watch", category: "Acessórios", subcategory: "Wearables", popularity: 65, relevance: 68, growth: 'up' as const, rank: 4 },
  
  // Moda
  { term: "Tênis Nike Air Max", category: "Moda", subcategory: "Calçados", popularity: 85, relevance: 92, growth: 'stable' as const, rank: 1 },
  { term: "Bolsa Feminina Transversal", category: "Moda", subcategory: "Bolsas", popularity: 78, relevance: 82, growth: 'up' as const, rank: 2 },
  { term: "Cinto Masculino Couro", category: "Moda", subcategory: "Acessórios", popularity: 63, relevance: 58, growth: 'down' as const, rank: 3 },
  { term: "Jaqueta Corta Vento", category: "Moda", subcategory: "Roupas", popularity: 70, relevance: 72, growth: 'up' as const, rank: 4 },
  
  // Beleza
  { term: "Perfume Importado Masculino", category: "Beleza", subcategory: "Perfumaria", popularity: 80, relevance: 75, growth: 'stable' as const, rank: 1 },
  { term: "Organizador de Maquiagem", category: "Beleza", subcategory: "Organizadores", popularity: 72, relevance: 68, growth: 'up' as const, rank: 2 },
  { term: "Kit Skincare Facial", category: "Beleza", subcategory: "Skincare", popularity: 60, relevance: 72, growth: 'up' as const, rank: 3 },
  { term: "Secador de Cabelo Profissional", category: "Beleza", subcategory: "Cabelos", popularity: 58, relevance: 62, growth: 'stable' as const, rank: 4 },
  
  // Casa
  { term: "Panela Air Fryer", category: "Casa", subcategory: "Eletrodomésticos", popularity: 50, relevance: 65, growth: 'stable' as const, rank: 1 },
  { term: "Luminária LED Mesa", category: "Casa", subcategory: "Iluminação", popularity: 65, relevance: 60, growth: 'up' as const, rank: 2 },
  { term: "Organizador de Gavetas", category: "Casa", subcategory: "Organização", popularity: 55, relevance: 58, growth: 'up' as const, rank: 3 },
  { term: "Jogo de Cama Queen", category: "Casa", subcategory: "Cama e Banho", popularity: 62, relevance: 65, growth: 'stable' as const, rank: 4 },
  
  // Games
  { term: "Mouse Gamer RGB", category: "Games", subcategory: "Periféricos", popularity: 70, relevance: 85, growth: 'up' as const, rank: 1 },
  { term: "Cadeira Gamer", category: "Games", subcategory: "Móveis", popularity: 68, relevance: 75, growth: 'stable' as const, rank: 2 },
  { term: "Headset Gamer 7.1", category: "Games", subcategory: "Áudio", popularity: 58, relevance: 80, growth: 'up' as const, rank: 3 },
  { term: "Teclado Mecânico RGB", category: "Games", subcategory: "Periféricos", popularity: 64, relevance: 78, growth: 'up' as const, rank: 4 },
  
  // Saúde
  { term: "Suplemento Whey Protein", category: "Saúde", subcategory: "Suplementos", popularity: 74, relevance: 70, growth: 'stable' as const, rank: 1 },
  { term: "Vitamina C 1000mg", category: "Saúde", subcategory: "Vitaminas", popularity: 52, relevance: 48, growth: 'down' as const, rank: 2 },
  { term: "Balança Digital", category: "Saúde", subcategory: "Equipamentos", popularity: 45, relevance: 50, growth: 'stable' as const, rank: 3 },
  
  // Esporte e Lazer
  { term: "Garrafa Térmica 1L", category: "Esporte e Lazer", subcategory: "Acessórios", popularity: 68, relevance: 72, growth: 'up' as const, rank: 1 },
  { term: "Corda de Pular Profissional", category: "Esporte e Lazer", subcategory: "Fitness", popularity: 55, relevance: 60, growth: 'up' as const, rank: 2 },
  { term: "Mochila Impermeável", category: "Esporte e Lazer", subcategory: "Mochilas", popularity: 62, relevance: 65, growth: 'stable' as const, rank: 3 },
  
  // Automotivo
  { term: "Suporte Celular Veicular", category: "Automotivo", subcategory: "Acessórios", popularity: 72, relevance: 75, growth: 'up' as const, rank: 1 },
  { term: "Câmera de Ré Universal", category: "Automotivo", subcategory: "Eletrônicos", popularity: 58, relevance: 62, growth: 'stable' as const, rank: 2 },
  { term: "Aspirador Portátil Carro", category: "Automotivo", subcategory: "Limpeza", popularity: 48, relevance: 52, growth: 'up' as const, rank: 3 },
  
  // Pet
  { term: "Ração Premium Cães", category: "Pet", subcategory: "Alimentação", popularity: 78, relevance: 80, growth: 'stable' as const, rank: 1 },
  { term: "Caixa de Transporte Pet", category: "Pet", subcategory: "Transporte", popularity: 55, relevance: 58, growth: 'up' as const, rank: 2 },
  { term: "Arranhador para Gatos", category: "Pet", subcategory: "Acessórios", popularity: 52, relevance: 55, growth: 'up' as const, rank: 3 },
  
  // Bebês
  { term: "Fralda Pampers Premium", category: "Bebês", subcategory: "Higiene", popularity: 85, relevance: 82, growth: 'stable' as const, rank: 1 },
  { term: "Carrinho de Bebê Compacto", category: "Bebês", subcategory: "Passeio", popularity: 65, relevance: 70, growth: 'up' as const, rank: 2 },
  { term: "Mamadeira Anticólica", category: "Bebês", subcategory: "Alimentação", popularity: 58, relevance: 62, growth: 'stable' as const, rank: 3 },
  
  // Informática
  { term: "SSD 1TB NVMe", category: "Informática", subcategory: "Armazenamento", popularity: 75, relevance: 80, growth: 'up' as const, rank: 1 },
  { term: "Memória RAM DDR4 16GB", category: "Informática", subcategory: "Componentes", popularity: 68, relevance: 72, growth: 'stable' as const, rank: 2 },
  { term: "Webcam Full HD", category: "Informática", subcategory: "Periféricos", popularity: 55, relevance: 58, growth: 'down' as const, rank: 3 },
  
  // Telefonia
  { term: "Película iPhone 15", category: "Telefonia", subcategory: "Proteção", popularity: 88, relevance: 85, growth: 'up' as const, rank: 1 },
  { term: "Cabo USB-C 2m", category: "Telefonia", subcategory: "Cabos", popularity: 72, relevance: 70, growth: 'stable' as const, rank: 2 },
  { term: "Carregador Turbo 65W", category: "Telefonia", subcategory: "Carregadores", popularity: 78, relevance: 82, growth: 'up' as const, rank: 3 },
];

// Keywords data - top searched terms
const KEYWORDS_DATA = [
  { keyword: "fone bluetooth", category: "Eletrônicos", trend: 'up' as const, rank: 1 },
  { keyword: "capinha iphone 15", category: "Acessórios", trend: 'up' as const, rank: 2 },
  { keyword: "tênis nike", category: "Moda", trend: 'stable' as const, rank: 3 },
  { keyword: "air fryer", category: "Casa", trend: 'up' as const, rank: 4 },
  { keyword: "whey protein", category: "Saúde", trend: 'stable' as const, rank: 5 },
  { keyword: "mouse gamer", category: "Games", trend: 'up' as const, rank: 6 },
  { keyword: "perfume masculino", category: "Beleza", trend: 'stable' as const, rank: 7 },
  { keyword: "smart watch", category: "Eletrônicos", trend: 'up' as const, rank: 8 },
  { keyword: "cadeira gamer", category: "Games", trend: 'stable' as const, rank: 9 },
  { keyword: "bolsa feminina", category: "Moda", trend: 'up' as const, rank: 10 },
  { keyword: "carregador portátil", category: "Eletrônicos", trend: 'up' as const, rank: 11 },
  { keyword: "fralda pampers", category: "Bebês", trend: 'stable' as const, rank: 12 },
  { keyword: "ração cachorro", category: "Pet", trend: 'stable' as const, rank: 13 },
  { keyword: "película celular", category: "Telefonia", trend: 'up' as const, rank: 14 },
  { keyword: "ssd 1tb", category: "Informática", trend: 'up' as const, rank: 15 },
  { keyword: "garrafa térmica", category: "Esporte e Lazer", trend: 'up' as const, rank: 16 },
  { keyword: "suporte celular carro", category: "Automotivo", trend: 'up' as const, rank: 17 },
  { keyword: "kit skincare", category: "Beleza", trend: 'up' as const, rank: 18 },
];

// All main categories
const MAIN_CATEGORIES = [
  "Acessórios",
  "Automotivo",
  "Bebês",
  "Beleza",
  "Casa",
  "Eletrônicos",
  "Esporte e Lazer",
  "Games",
  "Informática",
  "Moda",
  "Pet",
  "Saúde",
  "Telefonia",
];

export default function TrendsLiteTool() {
  const { t } = useTranslation('tools');
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSubcategory, setSelectedSubcategory] = useState("all");
  const [sortBy, setSortBy] = useState<'popularity' | 'relevance' | 'growth' | 'name'>('popularity');

  // Get subcategories based on selected category
  const subcategories = useMemo(() => {
    if (selectedCategory === "all") return [];
    const subs = TRENDS_DATA
      .filter(item => item.category === selectedCategory)
      .map(item => item.subcategory);
    return [...new Set(subs)].sort();
  }, [selectedCategory]);

  // Reset subcategory when category changes
  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setSelectedSubcategory("all");
  };

  const filteredAndSortedTrends = useMemo(() => {
    let filtered = [...TRENDS_DATA];
    
    if (selectedCategory !== "all") {
      filtered = filtered.filter(item => item.category === selectedCategory);
    }
    
    if (selectedSubcategory !== "all") {
      filtered = filtered.filter(item => item.subcategory === selectedSubcategory);
    }

    switch (sortBy) {
      case 'popularity':
        filtered.sort((a, b) => b.popularity - a.popularity);
        break;
      case 'relevance':
        filtered.sort((a, b) => b.relevance - a.relevance);
        break;
      case 'growth':
        const growthOrder = { 'up': 0, 'stable': 1, 'down': 2 };
        filtered.sort((a, b) => growthOrder[a.growth] - growthOrder[b.growth]);
        break;
      case 'name':
        filtered.sort((a, b) => a.term.localeCompare(b.term));
        break;
    }

    return filtered;
  }, [selectedCategory, selectedSubcategory, sortBy]);

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
          categories={MAIN_CATEGORIES}
          subcategories={subcategories}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
          sortBy={sortBy}
          onCategoryChange={handleCategoryChange}
          onSubcategoryChange={setSelectedSubcategory}
          onSortChange={setSortBy}
        />

        {/* Keywords Section */}
        <KeywordsSection 
          keywords={KEYWORDS_DATA}
          selectedCategory={selectedCategory}
        />

        {/* Trends List */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">
            {t('trends.products_title')}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAndSortedTrends.length > 0 ? (
              filteredAndSortedTrends.map((trend) => (
                <TrendsLiteCard
                  key={trend.term}
                  trend={trend}
                />
              ))
            ) : (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                {t('trends.no_results')}
              </div>
            )}
          </div>
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
