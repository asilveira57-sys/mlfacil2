import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/PageContainer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Info,
  Percent,
  RefreshCw,
  AlertCircle,
  TrendingUp,
} from "lucide-react";

const ML_CATEGORIES = [
  { id: "MLB5672", name: "Acessórios para Veículos" },
  { id: "MLB1071", name: "Animais" },
  { id: "MLB1367", name: "Antiguidades e Coleções" },
  { id: "MLB1368", name: "Arte, Papelaria e Armarinho" },
  { id: "MLB1384", name: "Bebês" },
  { id: "MLB1246", name: "Beleza e Cuidado Pessoal" },
  { id: "MLB1132", name: "Brinquedos e Hobbies" },
  { id: "MLB1430", name: "Calçados, Roupas e Bolsas" },
  { id: "MLB1039", name: "Câmeras e Acessórios" },
  { id: "MLB1743", name: "Carros, Motos e Outros" },
  { id: "MLB1574", name: "Casa, Móveis e Decoração" },
  { id: "MLB1051", name: "Celulares e Telefones" },
  { id: "MLB1500", name: "Construção" },
  { id: "MLB5726", name: "Eletrodomésticos" },
  { id: "MLB1000", name: "Eletrônicos, Áudio e Vídeo" },
  { id: "MLB1276", name: "Esportes e Fitness" },
  { id: "MLB263532", name: "Ferramentas" },
  { id: "MLB12404", name: "Festas e Lembrancinhas" },
  { id: "MLB1144", name: "Games" },
  { id: "MLB1459", name: "Imóveis" },
  { id: "MLB1499", name: "Indústria e Comércio" },
  { id: "MLB1648", name: "Informática" },
  { id: "MLB218519", name: "Ingressos" },
  { id: "MLB1182", name: "Instrumentos Musicais" },
  { id: "MLB3937", name: "Joias e Relógios" },
  { id: "MLB1196", name: "Livros, Revistas e Comics" },
  { id: "MLB1168", name: "Música, Filmes e Seriados" },
  { id: "MLB264586", name: "Saúde" },
  { id: "MLB1540", name: "Serviços" },
  { id: "MLB1953", name: "Mais Categorias" },
];

interface CommissionData {
  category_id: string;
  category_name: string;
  listing_type_id: string;
  listing_type_name: string;
  sale_fee_amount: number;
  percentage_of_fee_cap: number | null;
  currency_id: string;
}

const FALLBACK_COMMISSIONS: CommissionData[] = [
  { category_id: "MLB1051", category_name: "Celulares e Telefones", listing_type_id: "gold_pro", listing_type_name: "Premium", sale_fee_amount: 16, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB1051", category_name: "Celulares e Telefones", listing_type_id: "gold_special", listing_type_name: "Clássico", sale_fee_amount: 12, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB1000", category_name: "Eletrônicos, Áudio e Vídeo", listing_type_id: "gold_pro", listing_type_name: "Premium", sale_fee_amount: 14, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB1000", category_name: "Eletrônicos, Áudio e Vídeo", listing_type_id: "gold_special", listing_type_name: "Clássico", sale_fee_amount: 11, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB1430", category_name: "Calçados, Roupas e Bolsas", listing_type_id: "gold_pro", listing_type_name: "Premium", sale_fee_amount: 16, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB1430", category_name: "Calçados, Roupas e Bolsas", listing_type_id: "gold_special", listing_type_name: "Clássico", sale_fee_amount: 13, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB1246", category_name: "Beleza e Cuidado Pessoal", listing_type_id: "gold_pro", listing_type_name: "Premium", sale_fee_amount: 16, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB1246", category_name: "Beleza e Cuidado Pessoal", listing_type_id: "gold_special", listing_type_name: "Clássico", sale_fee_amount: 13, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB1574", category_name: "Casa, Móveis e Decoração", listing_type_id: "gold_pro", listing_type_name: "Premium", sale_fee_amount: 14, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB1574", category_name: "Casa, Móveis e Decoração", listing_type_id: "gold_special", listing_type_name: "Clássico", sale_fee_amount: 11, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB1384", category_name: "Bebês", listing_type_id: "gold_pro", listing_type_name: "Premium", sale_fee_amount: 15, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB1384", category_name: "Bebês", listing_type_id: "gold_special", listing_type_name: "Clássico", sale_fee_amount: 12, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB1648", category_name: "Informática", listing_type_id: "gold_pro", listing_type_name: "Premium", sale_fee_amount: 13, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB1648", category_name: "Informática", listing_type_id: "gold_special", listing_type_name: "Clássico", sale_fee_amount: 10, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB1276", category_name: "Esportes e Fitness", listing_type_id: "gold_pro", listing_type_name: "Premium", sale_fee_amount: 14, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB1276", category_name: "Esportes e Fitness", listing_type_id: "gold_special", listing_type_name: "Clássico", sale_fee_amount: 11, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB1144", category_name: "Games", listing_type_id: "gold_pro", listing_type_name: "Premium", sale_fee_amount: 13, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB1144", category_name: "Games", listing_type_id: "gold_special", listing_type_name: "Clássico", sale_fee_amount: 10, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB5726", category_name: "Eletrodomésticos", listing_type_id: "gold_pro", listing_type_name: "Premium", sale_fee_amount: 12, percentage_of_fee_cap: null, currency_id: "BRL" },
  { category_id: "MLB5726", category_name: "Eletrodomésticos", listing_type_id: "gold_special", listing_type_name: "Clássico", sale_fee_amount: 9, percentage_of_fee_cap: null, currency_id: "BRL" },
];

export default function Comissoes() {
  const { t } = useTranslation("tools");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [commissions, setCommissions] = useState<CommissionData[]>(FALLBACK_COMMISSIONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(new Date());

  const fetchCommissions = async (categoryId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url =
        categoryId && categoryId !== "all"
          ? `https://api.mercadolibre.com/sites/MLB/listing_prices?category_id=${categoryId}`
          : null;
      if (url) {
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data && Array.isArray(data)) {
            const transformed: CommissionData[] = data.map((item: any) => ({
              category_id: categoryId || "",
              category_name: ML_CATEGORIES.find((c) => c.id === categoryId)?.name || "",
              listing_type_id: item.listing_type_id || "",
              listing_type_name:
                item.listing_type_id === "gold_pro"
                  ? "Premium"
                  : item.listing_type_id === "gold_special"
                  ? "Clássico"
                  : item.listing_type_id,
              sale_fee_amount: item.sale_fee_amount || 0,
              percentage_of_fee_cap: item.percentage_of_fee_cap || null,
              currency_id: item.currency_id || "BRL",
            }));
            setCommissions(transformed);
            setLastUpdated(new Date());
            setLoading(false);
            return;
          }
        }
      }
      setCommissions(FALLBACK_COMMISSIONS);
      setLastUpdated(new Date());
    } catch {
      setCommissions(FALLBACK_COMMISSIONS);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommissions(selectedCategory);
  }, [selectedCategory]);

  const filteredCommissions = useMemo(() => {
    if (selectedCategory === "all") return commissions;
    return commissions.filter((c) => c.category_id === selectedCategory);
  }, [commissions, selectedCategory]);

  const groupedCommissions = useMemo(() => {
    const groups: Record<string, CommissionData[]> = {};
    filteredCommissions.forEach((c) => {
      const key = c.category_name || c.category_id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return groups;
  }, [filteredCommissions]);

  return (
    <PageContainer title={t("commissions.title")} subtitle={t("commissions.subtitle")}>
      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 space-y-2">
                <Label>{t("commissions.filter_category")}</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("commissions.filter_all")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("commissions.filter_all")}</SelectItem>
                    {ML_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchCommissions(selectedCategory)}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                {t("commissions.refresh")}
              </Button>
            </div>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground mt-2">
                {t("commissions.last_updated")}: {lastUpdated.toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6 space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-8 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && (
          <div className="space-y-6">
            {Object.entries(groupedCommissions).map(([categoryName, items]) => (
              <Card key={categoryName}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Percent className="w-5 h-5 text-primary" />
                    {categoryName}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {items.map((commission, idx) => (
                      <div
                        key={`${commission.listing_type_id}-${idx}`}
                        className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div>
                          <Badge
                            variant={
                              commission.listing_type_id === "gold_pro"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {commission.listing_type_name}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t("commissions.listing_type")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">
                            {commission.sale_fee_amount}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("commissions.fee_label")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}

            {Object.keys(groupedCommissions).length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <TrendingUp className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">{t("commissions.no_results")}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <Alert variant="default" className="bg-muted/50 border-muted">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm text-muted-foreground">
            {t("commissions.disclaimer")}
          </AlertDescription>
        </Alert>
      </div>
    </PageContainer>
  );
}
