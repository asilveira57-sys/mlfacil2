import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  ArrowUpDown,
  ExternalLink,
  Zap,
  Package,
  TrendingUp,
  Eye,
  ShoppingCart
} from "lucide-react";
import { useRadiography, ListingSnapshot } from "@/hooks/useRadiography";

interface RadiographyItemListProps {
  sellerId: string | null;
  onSelectItem: (itemId: string) => void;
}

export function RadiographyItemList({ sellerId, onSelectItem }: RadiographyItemListProps) {
  const { loading, items, fetchItems } = useRadiography(sellerId);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("score_total");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (sellerId) {
      fetchItems(sortBy, sortOrder);
    }
  }, [sellerId, sortBy, sortOrder, fetchItems]);

  const filteredItems = items.filter(item =>
    item.title?.toLowerCase().includes(search.toLowerCase()) ||
    item.item_id.toLowerCase().includes(search.toLowerCase())
  );

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    if (score >= 40) return "text-orange-500";
    return "text-red-500";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-500/10 border-green-500/20";
    if (score >= 60) return "bg-yellow-500/10 border-yellow-500/20";
    if (score >= 40) return "bg-orange-500/10 border-orange-500/20";
    return "bg-red-500/10 border-red-500/20";
  };

  const getLogisticBadge = (type: string) => {
    switch (type) {
      case "fulfillment":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Full</Badge>;
      case "cross_docking":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Flex</Badge>;
      case "drop_off":
        return <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20">Coleta</Badge>;
      default:
        return <Badge variant="outline">{type || "N/A"}</Badge>;
    }
  };

  if (!sellerId) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Anúncios Monitorados</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título ou ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score_total">Score Total</SelectItem>
                <SelectItem value="score_performance">Performance</SelectItem>
                <SelectItem value="visits_7d">Visitas 7d</SelectItem>
                <SelectItem value="sales_7d">Vendas 7d</SelectItem>
                <SelectItem value="conversion_rate_7d">Conversão</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum anúncio encontrado</p>
            <p className="text-sm">Execute a coleta de snapshots para começar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div
                key={item.item_id}
                className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                onClick={() => onSelectItem(item.item_id)}
              >
                {/* Thumbnail */}
                <div className="flex-shrink-0">
                  {item.thumbnail ? (
                    <img 
                      src={item.thumbnail} 
                      alt={item.title}
                      className="h-16 w-16 object-cover rounded-md"
                    />
                  ) : (
                    <div className="h-16 w-16 bg-muted rounded-md flex items-center justify-center">
                      <Package className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium truncate">{item.title || item.item_id}</span>
                    {item.catalog_product_id && (
                      <Badge variant="outline" className="text-xs">Catálogo</Badge>
                    )}
                    {item.permalink && (
                      <a 
                        href={item.permalink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {item.visits_7d} visitas
                    </span>
                    <span className="flex items-center gap-1">
                      <ShoppingCart className="h-3 w-3" />
                      {item.sales_7d} vendas
                    </span>
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      {item.conversion_rate_7d.toFixed(1)}% conv.
                    </span>
                    {getLogisticBadge(item.logistic_type)}
                  </div>
                </div>

                {/* Score Blocks (mini) */}
                <div className="hidden lg:flex items-center gap-2">
                  <ScoreBlock label="SEM" score={item.score_semantica} />
                  <ScoreBlock label="VIS" score={item.score_visual} />
                  <ScoreBlock label="LOG" score={item.score_logistica} />
                  <ScoreBlock label="COM" score={item.score_competitividade} />
                  <ScoreBlock label="PER" score={item.score_performance} />
                </div>

                {/* Total Score */}
                <div className={`flex-shrink-0 px-4 py-2 rounded-lg border ${getScoreBg(item.score_total)}`}>
                  <div className={`text-2xl font-bold ${getScoreColor(item.score_total)}`}>
                    {item.score_total}
                  </div>
                  <div className="text-xs text-muted-foreground text-center">Score</div>
                </div>

                {/* Analyze Button */}
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectItem(item.item_id);
                  }}
                >
                  <Zap className="h-4 w-4 mr-1" />
                  Analisar
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreBlock({ label, score }: { label: string; score: number }) {
  const getColor = (s: number) => {
    if (s >= 80) return "text-green-500";
    if (s >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div className="text-center px-2">
      <div className={`text-sm font-semibold ${getColor(score)}`}>{score}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
