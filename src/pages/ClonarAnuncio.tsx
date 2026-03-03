import { useState, useCallback, useRef } from 'react';
import { Copy, Search, Loader2, History, ExternalLink, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMlAccounts } from '@/hooks/useMlAccounts';
import { extractMeliId } from '@/lib/meli/extractMeliId';
import { PageContainer } from '@/components/layout/PageContainer';
import { CloneHistory } from '@/components/clone-module/CloneHistory';
import { CloneDraftForm } from '@/components/clone-turbo/CloneDraftForm';
import { mapErrorToFields, buildMergedPayload } from '@/components/clone-turbo/types';
import type { OriginPayload, UserPayload, FieldError, OriginStatus, DraftStatus } from '@/components/clone-turbo/types';

// Attributes to strip for anti-catalog
const FORBIDDEN_ATTRIBUTES = new Set([
  'GTIN', 'EAN', 'UPC', 'ISBN', 'MPN', 'PART_NUMBER',
  'ALPHANUMERIC_MODEL', 'MANUFACTURER_CODE', 'SKU', 'SELLER_SKU',
  'ITEM_CONDITION', 'PACKAGE_HEIGHT', 'PACKAGE_WIDTH', 'PACKAGE_LENGTH', 'PACKAGE_WEIGHT',
]);

function extractDimensions(attributes: { id: string; name?: string; value_name?: string }[]) {
  const dims = { height: 0, width: 0, length: 0, weight: 0 };
  for (const attr of attributes) {
    const id = (attr.id || '').toUpperCase();
    const val = attr.value_name ? parseFloat(attr.value_name) : 0;
    if (!val || isNaN(val)) continue;
    if (id.includes('HEIGHT')) dims.height = val;
    else if (id.includes('WIDTH')) dims.width = val;
    else if (id.includes('LENGTH')) dims.length = val;
    else if (id.includes('WEIGHT')) dims.weight = val;
  }
  return dims;
}

function extractIdentifier(attributes: { id: string; value_name?: string }[], ...ids: string[]) {
  for (const attr of attributes) {
    if (ids.includes(attr.id?.toUpperCase()) && attr.value_name) return attr.value_name;
  }
  return undefined;
}

export default function ClonarAnuncio() {
  const { data: accounts = [], isLoading: accountsLoading } = useMlAccounts({ onlyConnected: true });

  // State
  const [sourceUrl, setSourceUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'clone' | 'history'>('clone');

  // Draft state
  const [draftId, setDraftId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [originPayload, setOriginPayload] = useState<OriginPayload>({ origin_status: 'loading' });
  const [originStatus, setOriginStatus] = useState<OriginStatus>('loading');
  const [userPayload, setUserPayload] = useState<UserPayload>({});
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [createdItemId, setCreatedItemId] = useState<string | undefined>();
  const [sourceItemId, setSourceItemId] = useState<string>('');

  const safeLog = useCallback(async (action: string, meta: Record<string, unknown>) => {
    try {
      await supabase.rpc('register_system_log', {
        p_level: 'info',
        p_system_area: 'clone_anuncio',
        p_action: action,
        p_user_id: null,
        p_success: true,
        p_message: `${action}`,
        p_meta_json: JSON.parse(JSON.stringify(meta)),
      });
    } catch (_) { /* fail-safe */ }
  }, []);

  // ============================================
  // STEP 1: Click Carregar → Open form + fetch origin in background
  // ============================================
  const handleLoadItem = useCallback(async () => {
    setError(null);
    setFieldErrors([]);
    setPublished(false);
    setCreatedItemId(undefined);

    const itemId = extractMeliId(sourceUrl);
    if (!itemId) {
      setError('Não foi possível detectar um item_id válido. Cole o link completo do anúncio.');
      return;
    }

    const corrId = crypto.randomUUID().substring(0, 8);
    setCorrelationId(corrId);
    setSourceItemId(itemId);
    setUserPayload({});

    // Open form IMMEDIATELY with empty fields
    setOriginPayload({ origin_status: 'loading' });
    setOriginStatus('loading');
    setFormOpen(true);

    await safeLog('clone_draft_created', { correlation_id: corrId, item_id: itemId, source_url: sourceUrl });

    // Create draft in DB
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (userId) {
        // Find workspace
        const { data: prefs } = await supabase
          .from('user_preferences')
          .select('active_workspace_id')
          .eq('user_id', userId)
          .maybeSingle();
        const workspaceId = (prefs as any)?.active_workspace_id;

        if (workspaceId) {
          const { data: draft } = await supabase
            .from('clone_drafts')
            .insert({
              user_id: userId,
              workspace_id: workspaceId,
              source_item_id: itemId,
              source_url: sourceUrl,
              correlation_id: corrId,
              raw_snapshot: JSON.parse(JSON.stringify({ origin_status: 'loading' })) as any,
              draft_payload: JSON.parse(JSON.stringify({})) as any,
              status: 'DRAFT',
            })
            .select('id')
            .single();
          if (draft) setDraftId(draft.id);
        }
      }
    } catch (_) { /* fail-safe, form still works */ }

    // Fetch origin in BACKGROUND
    await safeLog('origin_fetch_attempt', { correlation_id: corrId, item_id: itemId });

    // Helper: Edge Function fallback for origin load
    const tryEdgeFallback = async (reason: string, httpStatus?: number): Promise<boolean> => {
      try {
        const { data } = await supabase.functions.invoke('mktpfacil-clone', {
          body: { action: 'load_source', item_id: itemId, correlation_id: corrId, source_input_raw: sourceUrl },
        });
        if (data?.snapshot) {
          const snap = data.snapshot;
          const attrs = snap.attributes || [];
          const dims = extractDimensions(attrs);
          const safeAttrs = attrs.filter((a: any) => !FORBIDDEN_ATTRIBUTES.has(a.id?.toUpperCase()));

          const op: OriginPayload = {
            origin_status: 'complete',
            item_id: snap.item_id,
            title: snap.title,
            description: snap.description,
            price: snap.price,
            available_quantity: snap.available_quantity,
            condition: snap.condition,
            category_id: snap.category_id,
            listing_type_id: snap.listing_type_id,
            pictures: snap.pictures,
            attributes: safeAttrs,
            package_height: dims.height,
            package_width: dims.width,
            package_length: dims.length,
            package_weight: dims.weight,
            sku: extractIdentifier(attrs, 'SKU', 'SELLER_SKU'),
            gtin: extractIdentifier(attrs, 'GTIN', 'EAN'),
            thumbnail: snap.thumbnail,
          };
          setOriginPayload(op);
          setOriginStatus('complete');
          await safeLog('origin_fetch_result', {
            correlation_id: corrId, status: 'complete', source: 'edge_fallback',
            reason, runtime_version: data.runtime_version || null,
            ...(httpStatus ? { http_status: httpStatus } : {}),
          });
          updateDraftOrigin(op);
          return true;
        }
      } catch (_) { /* fallback also failed */ }
      return false;
    };

    try {
      const itemUrl = `https://api.mercadolibre.com/items/${itemId}?include_attributes=all`;
      const descUrl = `https://api.mercadolibre.com/items/${itemId}/description`;

      const [itemRes, descRes] = await Promise.allSettled([
        fetch(itemUrl, { headers: { Accept: 'application/json' } }),
        fetch(descUrl, { headers: { Accept: 'application/json' } }),
      ]);

      // CORS TypeError fallback
      if (itemRes.status === 'rejected' && itemRes.reason instanceof TypeError) {
        const ok = await tryEdgeFallback('cors_typeerror');
        if (!ok) {
          setOriginPayload({ origin_status: 'unavailable' });
          setOriginStatus('unavailable');
          await safeLog('origin_fetch_result', { correlation_id: corrId, status: 'unavailable', reason: 'cors_and_fallback_failed' });
        }
        return;
      }

      // Network rejected fallback
      if (itemRes.status === 'rejected') {
        const ok = await tryEdgeFallback('network_rejected');
        if (!ok) {
          setOriginPayload({ origin_status: 'unavailable' });
          setOriginStatus('unavailable');
          await safeLog('origin_fetch_result', { correlation_id: corrId, status: 'unavailable', reason: 'network_rejected_and_fallback_failed' });
        }
        return;
      }

      const itemResponse = itemRes.value;

      // HTTP not-ok fallback (403, 404, 5xx, etc.)
      if (!itemResponse.ok) {
        const httpStatus = itemResponse.status;
        const bodySnippet = await itemResponse.text().catch(() => '');
        const ok = await tryEdgeFallback('http_not_ok', httpStatus);
        if (!ok) {
          setOriginPayload({ origin_status: 'unavailable' });
          setOriginStatus('unavailable');
          await safeLog('origin_fetch_result', { correlation_id: corrId, status: 'unavailable', reason: 'http_not_ok_and_fallback_failed', http_status: httpStatus, snippet: bodySnippet.substring(0, 200) });
        }
        return;
      }

      const item = await itemResponse.json();
      let description = '';
      if (descRes.status === 'fulfilled' && descRes.value.ok) {
        const descData = await descRes.value.json().catch(() => null);
        description = descData?.plain_text || descData?.text || '';
      }

      const pictures = (item.pictures || []).map((p: any, i: number) => ({
        id: p.id || `pic_${i}`,
        url: (p.secure_url || p.url || '').replace(/^http:\/\//i, 'https://'),
        secure_url: (p.secure_url || p.url || '').replace(/^http:\/\//i, 'https://'),
      }));

      const attrs = (item.attributes || []).map((a: any) => ({ id: a.id, name: a.name, value_name: a.value_name }));
      const dims = extractDimensions(attrs);
      const safeAttrs = attrs.filter((a: any) => !FORBIDDEN_ATTRIBUTES.has(a.id?.toUpperCase()));

      const hasTitle = !!item.title;
      const hasPics = pictures.length > 0;
      const finalStatus: OriginStatus = hasTitle && hasPics ? 'complete' : hasTitle || hasPics ? 'partial' : 'unavailable';

      const op: OriginPayload = {
        origin_status: finalStatus,
        item_id: item.id || itemId,
        title: item.title || '',
        description,
        price: item.price || 0,
        currency_id: item.currency_id || 'BRL',
        available_quantity: item.available_quantity || 1,
        condition: item.condition || 'new',
        category_id: item.category_id || '',
        listing_type_id: item.listing_type_id || 'gold_special',
        pictures,
        attributes: safeAttrs,
        package_height: dims.height || undefined,
        package_width: dims.width || undefined,
        package_length: dims.length || undefined,
        package_weight: dims.weight || undefined,
        sku: extractIdentifier(attrs, 'SKU', 'SELLER_SKU'),
        gtin: extractIdentifier(attrs, 'GTIN', 'EAN'),
        seller_id: String(item.seller_id || ''),
        thumbnail: item.thumbnail,
        catalog_product_id: item.catalog_product_id,
      };

      setOriginPayload(op);
      setOriginStatus(finalStatus);
      await safeLog('origin_fetch_result', { correlation_id: corrId, status: finalStatus, source: 'browser_direct', pictures: pictures.length, has_description: !!description });
      updateDraftOrigin(op);

    } catch (err: unknown) {
      // Generic catch — also try edge fallback
      const ok = await tryEdgeFallback('generic_catch');
      if (!ok) {
        setOriginPayload({ origin_status: 'unavailable' });
        setOriginStatus('unavailable');
        await safeLog('origin_fetch_result', { correlation_id: corrId, status: 'unavailable', reason: 'generic_catch_and_fallback_failed', error: (err as Error).message });
      }
    }
  }, [sourceUrl, safeLog]);

  const updateDraftOrigin = useCallback(async (op: OriginPayload) => {
    if (!draftId) return;
    try {
      await supabase
        .from('clone_drafts')
        .update({ raw_snapshot: JSON.parse(JSON.stringify(op)), updated_at: new Date().toISOString() })
        .eq('id', draftId);
    } catch (_) { /* fail-safe */ }
  }, [draftId]);

  // ============================================
  // STEP 2: User edits fields
  // ============================================
  const handleUserPayloadChange = useCallback((updates: Partial<UserPayload>) => {
    setUserPayload(prev => ({ ...prev, ...updates }));
    // Clear field errors for changed fields
    const changedFields = Object.keys(updates);
    setFieldErrors(prev => prev.filter(e => !changedFields.includes(e.field)));
  }, []);

  // ============================================
  // STEP 3: Publish with MERGE
  // ============================================
  const handlePublish = useCallback(async () => {
    if (!selectedAccountId) {
      toast.error('Selecione uma conta destino');
      return;
    }

    setPublishing(true);
    setFieldErrors([]);

    const merged = buildMergedPayload(originPayload, userPayload);
    const corrId = correlationId || 'unknown';

    await safeLog('publish_attempt', { correlation_id: corrId, item_id: sourceItemId, account_id: selectedAccountId });

    try {
      // Build ML payload
      const mlPayload: Record<string, unknown> = {
        title: merged.title,
        category_id: merged.category_id,
        price: merged.price,
        currency_id: 'BRL',
        available_quantity: merged.available_quantity,
        buying_mode: 'buy_it_now',
        condition: merged.condition,
        listing_type_id: merged.listing_type_id,
        pictures: merged.pictures.map(p => ({ source: p.secure_url || p.url })),
      };

      // Description
      if (merged.description) {
        mlPayload.description = { plain_text: merged.description };
      }

      // Dimensions (only if > 0)
      if (merged.package_height) {
        mlPayload.shipping = {
          mode: 'me2',
          dimensions: `${merged.package_height}x${merged.package_width || 1}x${merged.package_length || 1},${merged.package_weight || 1}`,
        };
      }

      // Safe attributes
      if (merged.attributes.length > 0) {
        mlPayload.attributes = merged.attributes;
      }

      // POST via edge function (needs token)
      const { data, error: fnError } = await supabase.functions.invoke('mktpfacil-clone', {
        body: {
          action: 'publish_item',
          destination_account_id: selectedAccountId,
          payload: mlPayload,
          correlation_id: corrId,
          source_item_id: sourceItemId,
          draft_id: draftId,
        },
      });

      if (fnError) throw new Error(fnError.message || 'Erro ao publicar');

      if (data?.error || data?.status === 'error') {
        // Map errors to fields
        const errorBody = data.error_body || data;
        const mapped = mapErrorToFields(errorBody);
        setFieldErrors(mapped);

        // Update draft
        if (draftId) {
          await supabase.from('clone_drafts').update({
            status: 'ERROR' as string,
            error_message: data.message || data.error || 'Erro na publicação',
            error_details: JSON.parse(JSON.stringify(errorBody)),
            updated_at: new Date().toISOString(),
          }).eq('id', draftId);
        }

        await safeLog('publish_error', { correlation_id: corrId, error: errorBody, field_errors: mapped.map(e => e.field) });
        toast.error('Erro ao publicar', { description: 'Corrija os campos destacados e tente novamente.' });
        return;
      }

      // Success
      const newItemId = data?.item_id || data?.id;
      setPublished(true);
      setCreatedItemId(newItemId);

      if (draftId) {
        await supabase.from('clone_drafts').update({
          status: 'PUBLISHED' as string,
          created_item_id: newItemId,
          draft_payload: JSON.parse(JSON.stringify(merged)),
          updated_at: new Date().toISOString(),
        }).eq('id', draftId);
      }

      await safeLog('publish_success', { correlation_id: corrId, created_item_id: newItemId });
      toast.success('Anúncio publicado!', { description: `Item ${newItemId} criado com sucesso.` });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setFieldErrors([{ field: '_general', message: msg }]);
      await safeLog('publish_error', { correlation_id: corrId, error: msg });
      toast.error('Falha ao publicar', { description: msg });
    } finally {
      setPublishing(false);
    }
  }, [selectedAccountId, originPayload, userPayload, correlationId, sourceItemId, draftId, safeLog]);

  // ============================================
  // Render
  // ============================================
  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  const generalErrors = fieldErrors.filter(e => e.field === '_general');
  const nonGeneralErrors = fieldErrors.filter(e => e.field !== '_general');

  return (
    <PageContainer title="Clonar Anúncio" subtitle="Clone anúncios do Mercado Livre para sua conta">
      <div className="p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'clone' | 'history')}>
          <TabsList className="mb-6">
            <TabsTrigger value="clone" className="gap-2">
              <Copy className="h-4 w-4" />
              Clonar
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="clone" className="space-y-6">
            {/* Anti-catalog warning */}
            <Alert className="border-amber-500/50 bg-amber-950/20">
              <Info className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-sm">
                Publica como <strong>anúncio comum</strong>. Catálogo não será criado. Identificadores (GTIN, EAN) são removidos automaticamente.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Input card */}
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Search className="h-4 w-4 text-primary" />
                    Anúncio de Origem
                  </CardTitle>
                  <CardDescription>Cole o link ou MLB do anúncio que deseja clonar</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://www.mercadolivre.com.br/... ou MLB123456789"
                      value={sourceUrl}
                      onChange={e => setSourceUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleLoadItem()}
                      className="flex-1"
                    />
                    <Button onClick={handleLoadItem} disabled={loading || !sourceUrl.trim()}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Carregar'}
                    </Button>
                  </div>
                  {correlationId && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50 text-xs">
                      <span className="text-muted-foreground">
                        Execução: <code className="font-mono font-medium text-foreground">{correlationId}</code>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={() => window.open(`/admin/logs?area=clone_anuncio&search=${correlationId}`, '_blank')}
                      >
                        <ExternalLink className="h-3 w-3" />
                        Ver logs
                      </Button>
                    </div>
                  )}
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription className="text-sm">{error}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* Destination account */}
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Copy className="h-4 w-4 text-primary" />
                    Conta Destino
                  </CardTitle>
                  <CardDescription>Selecione a conta para publicar o anúncio</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {accountsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando contas...
                    </div>
                  ) : accounts.length === 0 ? (
                    <Alert>
                      <AlertDescription>
                        Nenhuma conta conectada. Vá em <strong>Configurações → Integrações</strong> para conectar.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a conta destino" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map(acc => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.nickname || acc.ml_user_id} — {acc.ml_user_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {selectedAccount && (
                    <div className="p-3 rounded-lg bg-muted/30 space-y-1">
                      <p className="text-sm font-medium">{selectedAccount.nickname || 'Sem nome'}</p>
                      <p className="text-xs text-muted-foreground">Seller ID: {selectedAccount.ml_user_id}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Draft form — opens immediately */}
            {formOpen && (
              <CloneDraftForm
                originPayload={originPayload}
                originStatus={originStatus}
                userPayload={userPayload}
                onUserPayloadChange={handleUserPayloadChange}
                fieldErrors={nonGeneralErrors}
                generalErrors={generalErrors}
                onPublish={handlePublish}
                publishing={publishing}
                published={published}
                createdItemId={createdItemId}
              />
            )}
          </TabsContent>

          <TabsContent value="history">
            <CloneHistory />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
