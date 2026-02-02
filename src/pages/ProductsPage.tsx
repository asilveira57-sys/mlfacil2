import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImportListingForm, LearnedListingsList } from '@/components/products/ImportListing';
import { ProductRecordsList } from '@/components/products/ProductRecordsList';
import { Link2, Package } from 'lucide-react';

export default function ProductsPage() {
  const { t } = useTranslation('products');

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('import_listing_desc')}</p>
      </div>

      <Tabs defaultValue="import" className="space-y-6">
        <TabsList>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            {t('import_listing')}
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            {t('product_records')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-6">
          <ImportListingForm />
          <div>
            <h3 className="text-lg font-semibold mb-4">{t('learned_listings')}</h3>
            <LearnedListingsList />
          </div>
        </TabsContent>

        <TabsContent value="products">
          <ProductRecordsList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
