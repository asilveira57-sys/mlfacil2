import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link2, TrendingUp } from 'lucide-react';
import { SellerListingSelector } from './SellerListingSelector';

interface SellerListingBindingSectionProps {
  sellerId: string;
  value: {
    refType: string | null;
    refId: string | null;
    listingId: string | null;
    title: string | null;
    sku: string | null;
    price: number | null;
  } | null;
  followPriceUp: boolean;
  onChange: (value: {
    refType: string;
    refId: string;
    listingId: string;
    title: string;
    sku: string | null;
    price: number;
  } | null) => void;
  onFollowPriceUpChange: (value: boolean) => void;
  disabled?: boolean;
}

export function SellerListingBindingSection({
  sellerId,
  value,
  followPriceUp,
  onChange,
  onFollowPriceUpChange,
  disabled,
}: SellerListingBindingSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Vínculo com seu anúncio
        </CardTitle>
        <CardDescription>
          Vincule este concorrente a um anúncio seu para receber sugestões de preço
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SellerListingSelector
          sellerId={sellerId}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />

        {value?.refId && (
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="follow-price-up" className="text-sm font-normal">
                Acompanhar também quando subir
              </Label>
            </div>
            <Switch
              id="follow-price-up"
              checked={followPriceUp}
              onCheckedChange={onFollowPriceUpChange}
              disabled={disabled}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
