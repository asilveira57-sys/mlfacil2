import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package } from "lucide-react";
import { ML_CATEGORIES, type SimulationInput } from "@/lib/pricing-engine";

interface Props {
  input: SimulationInput;
  onChange: (field: keyof SimulationInput, value: string | number) => void;
}

export function PricingProductBlock({ input, onChange }: Props) {
  const { t } = useTranslation('tools');

  const handleCategoryChange = (categoryId: string) => {
    const cat = ML_CATEGORIES.find(c => c.id === categoryId);
    onChange('categoryId', categoryId);
    if (cat) onChange('categoryName', cat.name);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="w-4 h-4 text-primary" />
          {t('pricing.block_product', 'Produto')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="productName">{t('pricing.product_name', 'Nome do produto')}</Label>
            <Input
              id="productName"
              value={input.productName}
              onChange={e => onChange('productName', e.target.value)}
              placeholder={t('pricing.product_name_ph', 'Ex: Fone Bluetooth XYZ')}
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="description">{t('pricing.sim_description', 'Descrição da simulação')}</Label>
            <Textarea
              id="description"
              value={input.description}
              onChange={e => onChange('description', e.target.value)}
              placeholder={t('pricing.sim_description_ph', 'Notas sobre esta simulação...')}
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('pricing.category', 'Categoria')}</Label>
            <Select value={input.categoryId || undefined} onValueChange={handleCategoryChange}>
              <SelectTrigger>
                <SelectValue placeholder={t('pricing.select_category', 'Selecione')} />
              </SelectTrigger>
              <SelectContent>
                {ML_CATEGORIES.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('pricing.listing_type', 'Tipo de anúncio')}</Label>
            <Select 
              value={input.listingType} 
              onValueChange={(v) => onChange('listingType', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gold_pro">Premium (gold_pro)</SelectItem>
                <SelectItem value="gold_special">Clássico (gold_special)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="salePrice">{t('pricing.sale_price')}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
              <Input
                id="salePrice"
                type="number"
                value={input.salePrice || ''}
                onChange={e => onChange('salePrice', parseFloat(e.target.value) || 0)}
                className="pl-10"
                placeholder="0,00"
                min={0}
                step={0.01}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="productCost">{t('pricing.product_cost')}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
              <Input
                id="productCost"
                type="number"
                value={input.productCost || ''}
                onChange={e => onChange('productCost', parseFloat(e.target.value) || 0)}
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
