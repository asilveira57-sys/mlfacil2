import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ToolsLayout } from "./ToolsLayout";
import { 
  ToolsNavTabs, 
  ToolsPromoCard, 
  PricingInputForm, 
  PricingResultDisplay 
} from "@/components/tools";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

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
  marketplaceFee: 16, // Default ML fee
  shippingCost: 0,
  packagingCost: 0,
  otherCosts: 0,
};

export default function PricingSimulatorTool() {
  const { t } = useTranslation('tools');
  const [inputs, setInputs] = useState<PricingInputs>(INITIAL_INPUTS);

  const handleInputChange = (field: keyof PricingInputs, value: number) => {
    setInputs(prev => ({ ...prev, [field]: value }));
  };

  const handleReset = () => {
    setInputs(INITIAL_INPUTS);
  };

  const results = useMemo(() => {
    const { salePrice, productCost, marketplaceFee, shippingCost, packagingCost, otherCosts } = inputs;

    // Calculate marketplace fees
    const fees = salePrice * (marketplaceFee / 100);

    // Calculate total cost
    const totalCost = productCost + shippingCost + packagingCost + otherCosts + fees;

    // Calculate profit
    const profit = salePrice - totalCost;

    // Calculate margin percentage
    const margin = salePrice > 0 ? (profit / salePrice) * 100 : 0;

    // Calculate break-even price (minimum sale price for zero profit)
    // breakeven = (productCost + shippingCost + packagingCost + otherCosts) / (1 - marketplaceFee/100)
    const fixedCosts = productCost + shippingCost + packagingCost + otherCosts;
    const breakeven = marketplaceFee < 100 
      ? fixedCosts / (1 - marketplaceFee / 100)
      : fixedCosts;

    return {
      profit,
      margin,
      totalCost,
      fees,
      breakeven,
    };
  }, [inputs]);

  return (
    <ToolsLayout>
      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            {t('pricing.title')}
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t('pricing.subtitle')}
          </p>
        </div>

        {/* Navigation Tabs */}
        <ToolsNavTabs />

        {/* Main Content */}
        <div className="grid lg:grid-cols-2 gap-6">
          <PricingInputForm
            inputs={inputs}
            onInputChange={handleInputChange}
            onReset={handleReset}
          />
          <PricingResultDisplay
            results={results}
            salePrice={inputs.salePrice}
          />
        </div>

        {/* Disclaimer */}
        <Alert variant="default" className="bg-muted/50 border-muted">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm text-muted-foreground">
            {t('pricing.disclaimer')}
          </AlertDescription>
        </Alert>

        {/* Promo Card */}
        <ToolsPromoCard />
      </div>
    </ToolsLayout>
  );
}
