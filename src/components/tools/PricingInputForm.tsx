import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calculator, RotateCcw } from "lucide-react";

interface PricingInputs {
  salePrice: number;
  productCost: number;
  marketplaceFee: number;
  shippingCost: number;
  packagingCost: number;
  otherCosts: number;
}

interface PricingInputFormProps {
  inputs: PricingInputs;
  onInputChange: (field: keyof PricingInputs, value: number) => void;
  onReset: () => void;
}

export function PricingInputForm({ inputs, onInputChange, onReset }: PricingInputFormProps) {
  const { t } = useTranslation('tools');

  const handleChange = (field: keyof PricingInputs) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    onInputChange(field, value);
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calculator className="w-5 h-5" />
            {t('pricing.title')}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onReset} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            {t('pricing.btn_reset')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="salePrice">{t('pricing.sale_price')}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
              <Input
                id="salePrice"
                type="number"
                value={inputs.salePrice || ''}
                onChange={handleChange('salePrice')}
                className="pl-10"
                placeholder="0,00"
                min={0}
                step={0.01}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="productCost">{t('pricing.product_cost')}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
              <Input
                id="productCost"
                type="number"
                value={inputs.productCost || ''}
                onChange={handleChange('productCost')}
                className="pl-10"
                placeholder="0,00"
                min={0}
                step={0.01}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="marketplaceFee">{t('pricing.marketplace_fee')}</Label>
            <div className="relative">
              <Input
                id="marketplaceFee"
                type="number"
                value={inputs.marketplaceFee || ''}
                onChange={handleChange('marketplaceFee')}
                className="pr-8"
                placeholder="0"
                min={0}
                max={100}
                step={0.1}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shippingCost">{t('pricing.shipping_cost')}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
              <Input
                id="shippingCost"
                type="number"
                value={inputs.shippingCost || ''}
                onChange={handleChange('shippingCost')}
                className="pl-10"
                placeholder="0,00"
                min={0}
                step={0.01}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="packagingCost">{t('pricing.packaging_cost')}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
              <Input
                id="packagingCost"
                type="number"
                value={inputs.packagingCost || ''}
                onChange={handleChange('packagingCost')}
                className="pl-10"
                placeholder="0,00"
                min={0}
                step={0.01}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="otherCosts">{t('pricing.other_costs')}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
              <Input
                id="otherCosts"
                type="number"
                value={inputs.otherCosts || ''}
                onChange={handleChange('otherCosts')}
                className="pl-10"
                placeholder="0,00"
                min={0}
                step={0.01}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
