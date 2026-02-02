import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Loader2, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  Image as ImageIcon, 
  Tag, 
  Layers, 
  Send,
  ExternalLink,
  RefreshCw,
  Save,
} from 'lucide-react';
import { 
  useProductRecord, 
  useUpdateProductRecord,
  useValidateProductRecord, 
  usePublishToMl,
  usePublicationJobs,
} from '@/hooks/useProducts';
import { useMlAccounts } from '@/hooks/useMlAccounts';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import type { Locale } from 'date-fns';

const localeMap: Record<string, Locale> = { 'pt-BR': ptBR, en: enUS, es: es };

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  ready: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  published: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export function ProductRecordDetail() {
  const { t, i18n } = useTranslation('products');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const locale = localeMap[i18n.language] || ptBR;

  const { data: product, isLoading } = useProductRecord(id);
  const { data: mlAccounts } = useMlAccounts();
  const { data: jobs } = usePublicationJobs(id);
  
  const updateMutation = useUpdateProductRecord();
  const validateMutation = useValidateProductRecord();
  const publishMutation = usePublishToMl();

  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [listingType, setListingType] = useState<string>('gold_special');
  const [editName, setEditName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Produto não encontrado
      </div>
    );
  }

  const images = product.assets?.filter(a => a.asset_type === 'image').sort((a, b) => a.sort_order - b.sort_order) || [];
  const itemAttributes = product.attributes?.filter(a => a.scope === 'item') || [];
  const requiredAttributes = itemAttributes.filter(a => a.required_level === 'required');
  const missingRequired = requiredAttributes.filter(a => a.validation_status !== 'ok');
  const mainVariant = product.variants?.find(v => v.sort_order === 0) || product.variants?.[0];

  const handleValidate = async () => {
    await validateMutation.mutateAsync(product.id);
  };

  const handlePublish = async () => {
    if (!selectedAccount) return;
    await publishMutation.mutateAsync({
      productRecordId: product.id,
      mlAccountId: selectedAccount,
      listingType,
    });
  };

  const handleSaveName = async () => {
    if (!editName.trim()) return;
    await updateMutation.mutateAsync({
      id: product.id,
      updates: { name_internal: editName },
    });
    setIsEditingName(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/produtos')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="max-w-md"
              />
              <Button size="sm" onClick={handleSaveName} disabled={updateMutation.isPending}>
                <Save className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsEditingName(false)}>
                {t('cancel')}
              </Button>
            </div>
          ) : (
            <h1
              className="text-2xl font-bold cursor-pointer hover:text-primary"
              onClick={() => {
                setEditName(product.name_internal);
                setIsEditingName(true);
              }}
            >
              {product.name_internal}
            </h1>
          )}
          <div className="flex items-center gap-2 mt-1">
            <Badge className={statusColors[product.status]}>
              {t(`status_${product.status}`)}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {product.target_category_name}
            </span>
            {product.published_item_id && (
              <a
                href={`https://www.mercadolivre.com.br/p/${product.published_item_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                {product.published_item_id}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleValidate}
            disabled={validateMutation.isPending}
          >
            {validateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {t('validate')}
          </Button>
        </div>
      </div>

      {/* Completeness */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t('completeness')}:</span>
                <Progress value={product.completeness_score} className="w-32 h-2" />
                <span className="text-sm font-bold">{product.completeness_score}%</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <span>{images.length} {t('pictures')}</span>
              </div>
              <div className="flex items-center gap-1">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span>{itemAttributes.length} {t('attributes')}</span>
              </div>
              <div className="flex items-center gap-1">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span>{product.variants?.length || 0} {t('variations')}</span>
              </div>
              {missingRequired.length > 0 && (
                <Badge variant="destructive">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {missingRequired.length} {t('required_missing')}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">{t('overview')}</TabsTrigger>
          <TabsTrigger value="pictures">{t('pictures')}</TabsTrigger>
          <TabsTrigger value="attributes">{t('tech_sheet')}</TabsTrigger>
          <TabsTrigger value="variations">{t('variations')}</TabsTrigger>
          <TabsTrigger value="publish">{t('publish')}</TabsTrigger>
          <TabsTrigger value="history">{t('history')}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('overview')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>{t('product_name')}</Label>
                  <p className="text-sm">{product.name_internal}</p>
                </div>
                <div>
                  <Label>{t('category')}</Label>
                  <p className="text-sm">{product.target_category_name || product.target_category_id}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('brand')}</Label>
                    <p className="text-sm">{product.brand || '-'}</p>
                  </div>
                  <div>
                    <Label>{t('model')}</Label>
                    <p className="text-sm">{product.model || '-'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('condition')}</Label>
                    <p className="text-sm">{t(`condition_${product.default_condition}`)}</p>
                  </div>
                  <div>
                    <Label>{t('listing_type')}</Label>
                    <p className="text-sm">{product.default_listing_type}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {mainVariant && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('price')} & {t('stock')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>{t('price')}</Label>
                    <p className="text-2xl font-bold">
                      {product.default_currency} {mainVariant.price?.toLocaleString(i18n.language)}
                    </p>
                  </div>
                  <div>
                    <Label>{t('stock')}</Label>
                    <p className="text-lg">{mainVariant.available_quantity} unidades</p>
                  </div>
                  {mainVariant.gtin && (
                    <div>
                      <Label>{t('gtin')}</Label>
                      <p className="text-sm font-mono">{mainVariant.gtin}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Pictures Tab */}
        <TabsContent value="pictures">
          <Card>
            <CardHeader>
              <CardTitle>{t('pictures')}</CardTitle>
              <CardDescription>{t('pictures_count', { count: images.length })}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {images.map((img, index) => (
                  <div key={img.id} className="relative aspect-square bg-muted rounded-lg overflow-hidden">
                    <img
                      src={img.source_url || img.storage_url || ''}
                      alt={`Foto ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {img.is_cover && (
                      <Badge className="absolute top-2 left-2 text-xs">Capa</Badge>
                    )}
                    <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded">
                      {index + 1}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attributes Tab */}
        <TabsContent value="attributes">
          <Card>
            <CardHeader>
              <CardTitle>{t('tech_sheet')}</CardTitle>
              <CardDescription>{t('attributes_count', { count: itemAttributes.length })}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {itemAttributes.map((attr) => (
                  <div
                    key={attr.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      attr.validation_status === 'missing' || attr.validation_status === 'invalid'
                        ? 'border-destructive/50 bg-destructive/5'
                        : 'border-border'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {attr.validation_status === 'ok' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : attr.validation_status === 'missing' ? (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{attr.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {attr.value_name || attr.value_id || t('no_value')}
                          {attr.unit && ` ${attr.unit}`}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={attr.required_level === 'required' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {t(attr.required_level)}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Variations Tab */}
        <TabsContent value="variations">
          <Card>
            <CardHeader>
              <CardTitle>{t('variations')}</CardTitle>
              <CardDescription>{t('variations_count', { count: product.variants?.length || 0 })}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {product.variants?.map((variant, index) => (
                  <div key={variant.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium text-sm">{variant.sku_internal || `Variação ${index + 1}`}</p>
                      {variant.variant_attributes && (
                        <p className="text-xs text-muted-foreground">
                          {Array.isArray(variant.variant_attributes)
                            ? variant.variant_attributes.map((a: any) => `${a.name}: ${a.value_name}`).join(' | ')
                            : JSON.stringify(variant.variant_attributes)}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {product.default_currency} {variant.price?.toLocaleString(i18n.language)}
                      </p>
                      <p className="text-xs text-muted-foreground">{variant.available_quantity} em estoque</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Publish Tab */}
        <TabsContent value="publish">
          <Card>
            <CardHeader>
              <CardTitle>{t('publish_wizard')}</CardTitle>
              <CardDescription>
                {product.status === 'published'
                  ? 'Produto já publicado'
                  : 'Configure e publique seu anúncio no Mercado Livre'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {product.status === 'published' && product.published_item_id ? (
                <div className="text-center py-6">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-lg font-medium">{t('publish_success')}</p>
                  <a
                    href={`https://www.mercadolivre.com.br/p/${product.published_item_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center justify-center gap-1 mt-2"
                  >
                    {t('view_on_ml')}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              ) : (
                <>
                  {/* Validation Status */}
                  {missingRequired.length > 0 && (
                    <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        <span className="font-medium text-destructive">
                          {t('validation_errors', { count: missingRequired.length })}
                        </span>
                      </div>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {missingRequired.slice(0, 5).map((attr) => (
                          <li key={attr.id}>• {attr.name}</li>
                        ))}
                        {missingRequired.length > 5 && (
                          <li>• ... e mais {missingRequired.length - 5}</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {/* Account Selection */}
                  <div className="space-y-2">
                    <Label>{t('select_account')}</Label>
                    <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('select_account')} />
                      </SelectTrigger>
                      <SelectContent>
                        {mlAccounts?.map((account: any) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.nickname || account.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Listing Type */}
                  <div className="space-y-2">
                    <Label>{t('listing_type')}</Label>
                    <Select value={listingType} onValueChange={setListingType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gold_special">{t('listing_type_gold_special')}</SelectItem>
                        <SelectItem value="gold_pro">{t('listing_type_gold_pro')}</SelectItem>
                        <SelectItem value="gold">{t('listing_type_gold')}</SelectItem>
                        <SelectItem value="free">{t('listing_type_free')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  {/* Publish Button */}
                  <Button
                    className="w-full"
                    size="lg"
                    disabled={
                      !selectedAccount ||
                      missingRequired.length > 0 ||
                      publishMutation.isPending
                    }
                    onClick={handlePublish}
                  >
                    {publishMutation.isPending ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        {t('publishing')}
                      </>
                    ) : (
                      <>
                        <Send className="h-5 w-5 mr-2" />
                        {t('publish_now')}
                      </>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>{t('jobs_history')}</CardTitle>
            </CardHeader>
            <CardContent>
              {jobs?.length ? (
                <div className="space-y-3">
                  {jobs.map((job: any) => (
                    <div
                      key={job.id}
                      className={`p-4 rounded-lg border ${
                        job.status === 'failed' ? 'border-destructive/50 bg-destructive/5' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {job.status === 'success' ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : job.status === 'failed' ? (
                            <AlertCircle className="h-5 w-5 text-destructive" />
                          ) : (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          )}
                          <span className="font-medium">{job.action}</span>
                          <Badge variant={job.status === 'success' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                            {t(`job_status_${job.status}`)}
                          </Badge>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(job.created_at), { addSuffix: true, locale })}
                        </span>
                      </div>
                      {job.error_message && (
                        <p className="text-sm text-destructive mt-2">{job.error_message}</p>
                      )}
                      {job.published_item_id && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Item ID: <span className="font-mono">{job.published_item_id}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">Nenhum histórico ainda</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
