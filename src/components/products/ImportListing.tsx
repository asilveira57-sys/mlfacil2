import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Link2, Package, Image, Tag, Layers, ExternalLink, Trash2, Plus } from 'lucide-react';
import { useImportListing, useLearnedListings, useDeleteLearnedListing, useCreateProductRecord } from '@/hooks/useProducts';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import type { Locale } from 'date-fns';
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

const localeMap: Record<string, Locale> = { 'pt-BR': ptBR, en: enUS, es: es };

export function ImportListingForm() {
  const { t, i18n } = useTranslation('products');
  const [url, setUrl] = useState('');
  const importMutation = useImportListing();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    
    await importMutation.mutateAsync(url);
    setUrl('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          {t('import_listing')}
        </CardTitle>
        <CardDescription>{t('import_listing_desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <Input
            placeholder={t('paste_url_placeholder')}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={importMutation.isPending || !url.trim()}>
            {importMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('importing')}
              </>
            ) : (
              t('import_button')
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function LearnedListingsList() {
  const { t, i18n } = useTranslation('products');
  const navigate = useNavigate();
  const { data: listings, isLoading } = useLearnedListings();
  const deleteMutation = useDeleteLearnedListing();
  const createProductMutation = useCreateProductRecord();
  const locale = localeMap[i18n.language] || ptBR;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!listings?.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Package className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>{t('empty_learned')}</p>
          <p className="text-sm">{t('import_first')}</p>
        </CardContent>
      </Card>
    );
  }

  const handleCreateProduct = async (listingId: string, title: string) => {
    const result = await createProductMutation.mutateAsync({
      learnedListingId: listingId,
      nameInternal: title,
    });
    if (result?.productRecordId) {
      navigate(`/produtos/${result.productRecordId}`);
    }
  };

  return (
    <div className="space-y-4">
      {listings.map((listing) => (
        <Card key={listing.id} className="overflow-hidden">
          <div className="flex">
            {/* Thumbnail */}
            <div className="w-24 h-24 shrink-0 bg-muted">
              {listing.pictures?.[0]?.source_url ? (
                <img
                  src={listing.pictures[0].source_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
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
                  <h4 className="font-medium text-sm truncate">{listing.title}</h4>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{listing.source_item_id}</span>
                    <span>•</span>
                    <span>{listing.category_name || listing.category_id}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant={listing.is_catalog_listing ? 'default' : 'secondary'} className="text-xs">
                      {listing.is_catalog_listing ? t('is_catalog') : t('not_catalog')}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <Image className="h-3 w-3 mr-1" />
                      {listing.pictures?.length || 0}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <Tag className="h-3 w-3 mr-1" />
                      {listing.attributes?.filter(a => a.scope === 'item').length || 0}
                    </Badge>
                    {(listing.variations?.length || 0) > 0 && (
                      <Badge variant="outline" className="text-xs">
                        <Layers className="h-3 w-3 mr-1" />
                        {listing.variations?.length}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Price & Actions */}
                <div className="text-right shrink-0">
                  <p className="font-semibold">
                    {listing.currency_id} {listing.price?.toLocaleString(i18n.language)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(listing.imported_at), { addSuffix: true, locale })}
                  </p>
                  <div className="flex gap-1 mt-2 justify-end">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleCreateProduct(listing.id, listing.title || '')}
                      disabled={createProductMutation.isPending}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {t('create_product')}
                    </Button>
                    {listing.permalink && (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={listing.permalink} target="_blank" rel="noopener noreferrer">
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
                          <AlertDialogDescription>{listing.title}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(listing.id)}
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
      ))}
    </div>
  );
}
