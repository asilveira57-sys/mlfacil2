import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Calculator,
  RotateCcw,
  DollarSign,
  Percent,
  Target,
  Receipt,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
} from "lucide-react";

interface PricingInputs {
  salePrice: number;
  productCost: number;
  marketplaceFee: number;
  shippingCost: number;
  packagingCost: number;
  otherCosts: number;
}

const INITIAL_INPUTS: PricingInputs = {
  salePrice: 0,
  productCost: 0,
  marketplaceFee: 16,
  shippingCost: 0,
  packagingCost: 0,
  otherCosts: 0,
};

export default function Precificacao() {
  const { t } = useTranslation("tools");
  const [inputs, setInputs] = useState<PricingInputs>(INITIAL_INPUTS);

  const handleInputChange = (field: keyof PricingInputs, value: number) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
  };

  const handleChange =
    (field: keyof PricingInputs) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleInputChange(field, parseFloat(e.target.value) || 0);
    };

  const handleReset = () => setInputs(INITIAL_INPUTS);

  const results = useMemo(() => {
    const {
      salePrice,
      productCost,
      marketplaceFee,
      shippingCost,
      packagingCost,
      otherCosts,
    } = inputs;
    const fees = salePrice * (marketplaceFee / 100);
    const totalCost = productCost + shippingCost + packagingCost + otherCosts + fees;
    const profit = salePrice - totalCost;
    const margin = salePrice > 0 ? (profit / salePrice) * 100 : 0;
    const fixedCosts = productCost + shippingCost + packagingCost + otherCosts;
    const breakeven =
      marketplaceFee < 100 ? fixedCosts / (1 - marketplaceFee / 100) : fixedCosts;
    return { profit, margin, totalCost, fees, breakeven };
  }, [inputs]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const formatPercent = (v: number) => `${v.toFixed(1)}%`;

  const getMarginStatus = () => {
    if (results.margin >= 20)
      return { variant: "default" as const, label: t("pricing.positive_margin"), icon: TrendingUp };
    if (results.margin >= 10)
      return { variant: "secondary" as const, label: t("pricing.warning_margin"), icon: Minus };
    return { variant: "destructive" as const, label: t("pricing.negative_margin"), icon: TrendingDown };
  };

  const marginStatus = getMarginStatus();
  const MarginIcon = marginStatus.icon;
  const hasValidPrice = inputs.salePrice > 0;

  return (
    <PageContainer title={t("pricing.title")} subtitle={t("pricing.subtitle")}>
      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Input Form */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calculator className="w-5 h-5" />
                  {t("pricing.title")}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={handleReset} className="gap-2">
                  <RotateCcw className="w-4 h-4" />
                  {t("pricing.btn_reset")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="salePrice">{t("pricing.sale_price")}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                    <Input id="salePrice" type="number" value={inputs.salePrice || ""} onChange={handleChange("salePrice")} className="pl-10" placeholder="0,00" min={0} step={0.01} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productCost">{t("pricing.product_cost")}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                    <Input id="productCost" type="number" value={inputs.productCost || ""} onChange={handleChange("productCost")} className="pl-10" placeholder="0,00" min={0} step={0.01} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="marketplaceFee">{t("pricing.marketplace_fee")}</Label>
                  <div className="relative">
                    <Input id="marketplaceFee" type="number" value={inputs.marketplaceFee || ""} onChange={handleChange("marketplaceFee")} className="pr-8" placeholder="0" min={0} max={100} step={0.1} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shippingCost">{t("pricing.shipping_cost")}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                    <Input id="shippingCost" type="number" value={inputs.shippingCost || ""} onChange={handleChange("shippingCost")} className="pl-10" placeholder="0,00" min={0} step={0.01} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="packagingCost">{t("pricing.packaging_cost")}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                    <Input id="packagingCost" type="number" value={inputs.packagingCost || ""} onChange={handleChange("packagingCost")} className="pl-10" placeholder="0,00" min={0} step={0.01} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="otherCosts">{t("pricing.other_costs")}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                    <Input id="otherCosts" type="number" value={inputs.otherCosts || ""} onChange={handleChange("otherCosts")} className="pl-10" placeholder="0,00" min={0} step={0.01} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DollarSign className="w-5 h-5" />
                  Resultados
                </CardTitle>
                {hasValidPrice && (
                  <Badge variant={marginStatus.variant} className="gap-1">
                    <MarginIcon className="w-3 h-3" />
                    {marginStatus.label}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-sm">{t("pricing.result_profit")}</span>
                  </div>
                  <p className={`text-2xl font-bold ${results.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {hasValidPrice ? formatCurrency(results.profit) : "—"}
                  </p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Percent className="w-4 h-4" />
                    <span className="text-sm">{t("pricing.result_margin")}</span>
                  </div>
                  <p className={`text-2xl font-bold ${results.margin >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {hasValidPrice ? formatPercent(results.margin) : "—"}
                  </p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Receipt className="w-4 h-4" />
                    <span className="text-sm">{t("pricing.result_total_cost")}</span>
                  </div>
                  <p className="text-xl font-semibold text-foreground">
                    {hasValidPrice ? formatCurrency(results.totalCost) : "—"}
                  </p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Target className="w-4 h-4" />
                    <span className="text-sm">{t("pricing.result_fees")}</span>
                  </div>
                  <p className="text-xl font-semibold text-foreground">
                    {hasValidPrice ? formatCurrency(results.fees) : "—"}
                  </p>
                </div>
              </div>

              {hasValidPrice && results.margin < 0 && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-400">
                    ⚠️ Para ter lucro zero, o preço mínimo de venda seria{" "}
                    {formatCurrency(results.breakeven)}.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Alert variant="default" className="bg-muted/50 border-muted">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm text-muted-foreground">
            {t("pricing.disclaimer")}
          </AlertDescription>
        </Alert>
      </div>
    </PageContainer>
  );
}
