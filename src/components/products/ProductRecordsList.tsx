import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, Package, Image, Tag, Layers, CheckCircle2, AlertCircle, ExternalLink, Edit, Trash2 } from 'lucide-react';
import { useProductRecords, useDeleteProductRecord } from '@/hooks/useProducts';
import { useNavigate } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  ready: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  published: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export function ProductRecordsList() {
  const { t, i18n } = useTranslation('products');
  const navigate = useNavigate();
  const { data: products, isLoading } = useProductRecords();
  const deleteMutation = useDeleteProductRecord();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!products?.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Package className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>{t('empty_products')}</p>
          <p className="text-sm">{t('import_first')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {products.map((product) => {
        const coverImage = product.assets?.find(a => a.is_cover && a.asset_type === 'image');
        const firstImage = product.assets?.find(a => a.asset_type === 'image');
        const imageUrl = coverImage?.source_url || coverImage?.storage_url || firstImage?.source_url || firstImage?.storage_url;
        const mainVariant = product.variants?.find(v => v.sort_order === 0) || product.variants?.[0];
        
        const requiredMissing = product.attributes?.filter(
          a => a.required_level === 'required' && a.validation_status !== 'ok'
        ).length || 0;

        return (
          <Card
            key={product.id}
            className="overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => navigate(`/produtos/${product.id}`)}
          >
            <div className="flex">
              {/* Thumbnail */}
              <div className="w-24 h-24 shrink-0 bg-muted">
                {imageUrl ? (
                  <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Image className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-sm truncate">{product.name_internal}</h4>
                      <Badge className={statusColors[product.status]}>
                        {t(`status_${product.status}`)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{product.target_category_name || product.target_category_id}</span>
                      {product.brand && (
                        <>
                          <span>•</span>
                          <span>{product.brand}</span>
                        </>
                      )}
                    </div>

                    {/* Completeness */}
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                        <Progress value={product.completeness_score} className="h-2" />
                        <span className="text-xs font-medium">{product.completeness_score}%</span>
                      </div>
                      
                      {requiredMissing > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          {requiredMissing} {t('required_missing')}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        <Image className="h-3 w-3 mr-1" />
                        {product.assets?.filter(a => a.asset_type === 'image').length || 0}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        <Tag className="h-3 w-3 mr-1" />
                        {product.attributes?.filter(a => a.scope === 'item').length || 0}
                      </Badge>
                      {(product.variants?.length || 0) > 1 && (
                        <Badge variant="outline" className="text-xs">
                          <Layers className="h-3 w-3 mr-1" />
                          {product.variants?.length}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Price & Actions */}
                  <div className="text-right shrink-0" onClick={(e) => e.stopPropagation()}>
                    {mainVariant && (
                      <p className="font-semibold">
                        {product.default_currency} {mainVariant.price?.toLocaleString(i18n.language)}
                      </p>
                    )}
                    {product.published_item_id && (
                      <p className="text-xs text-muted-foreground">{product.published_item_id}</p>
                    )}
                    <div className="flex gap-1 mt-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/produtos/${product.id}`)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      {product.published_item_id && (
                        <Button size="sm" variant="ghost" asChild>
                          <a
                            href={`https://www.mercadolivre.com.br/p/${product.published_item_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('delete_confirm')}</AlertDialogTitle>
                            <AlertDialogDescription>{product.name_internal}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(product.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              {t('delete')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
