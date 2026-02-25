import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Search, Loader2, AlertTriangle, CheckCircle2, Image as ImageIcon, Tag, Package, Info, Settings2, ArrowRight, History, ChevronDown, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMlAccounts } from '@/hooks/useMlAccounts';
import { extractMeliId, isCatalogMeliId } from '@/lib/meli/extractMeliId';
import { PageContainer } from '@/components/layout/PageContainer';
import { CloneHistory } from '@/components/clone-module/CloneHistory';

// ============================================
// Types
// ============================================

interface SourceSnapshot {
  item_id: string;
  title: string;
  description: string;
  price: number;
  currency_id: string;
  available_quantity: number;
  condition: string;
  category_id: string;
  category_name?: string;
  listing_type_id: string;
  pictures: { id: string; url: string; secure_url: string }[];
  attributes: { id: string; name?: string; value_name?: string }[];
  variations: {
    id: number;
    attribute_combinations: { id: string; name?: string; value_name?: string }[];
    available_quantity: number;
    price: number;
    picture_ids: string[];
  }[];
  seller_id: string;
  thumbnail?: string;
  catalog_product_id?: string;
  catalog_listing?: boolean;
}

interface CloneSettings {
  price_mode: 'keep' | 'percent' | 'fixed';
  price_percent: number;
  price_fixed: number;
  stock_value: number;
  listing_type: 'keep' | 'gold_special' | 'gold_pro';
  description_mode: 'keep' | 'blank';
}

type MlAccountForClone = {
  id: string;
  ml_user_id: string;
  nickname: string | null;
  connection_status?: string;
};

// ============================================
// Component
// ============================================

export default function ClonarAnuncio() {
  const { t } = useTranslation(['actions', 'nav']);
  const { data: accounts = [], isLoading: accountsLoading } = useMlAccounts({ onlyConnected: true });

  // State
  const [sourceUrl, setSourceUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<SourceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [cloning, setCloning] = useState(false);
  const [activeTab, setActiveTab] = useState<'clone' | 'history'>('clone');

  const [settings, setSettings] = useState<CloneSettings>({
    price_mode: 'keep',
    price_percent: 0,
    price_fixed: 0,
    stock_value: 1,
    listing_type: 'keep',
    description_mode: 'keep',
  });

  // ============================================
  // Load source item — fetch from BROWSER to avoid PolicyAgent 403
  // ============================================
  const handleLoadItem = useCallback(async () => {
    setError(null);
    setSnapshot(null);
    setCorrelationId(null);

    const itemId = extractMeliId(sourceUrl);
    if (!itemId) {
      setError('Não foi possível detectar um item_id válido no link informado. Cole o link completo do anúncio.');
      return;
    }

    const corrId = crypto.randomUUID().substring(0, 8);
    setCorrelationId(corrId);

    // Log UI click
    try {
      await supabase.rpc('register_system_log', {
        p_level: 'info',
        p_system_area: 'clone_anuncio',
        p_action: 'ui_click_carregar',
        p_user_id: null,
        p_success: true,
        p_message: `Usuário clicou Carregar para ${itemId}`,
        p_meta_json: { correlation_id: corrId, input_raw: sourceUrl, item_id: itemId },
      });
    } catch (_) { /* fail-safe */ }

    setLoading(true);
    try {
      // ---- BROWSER FETCH (bypasses edge PolicyAgent) ----
      const itemUrl = `https://api.mercadolibre.com/items/${itemId}?include_attributes=all`;
      const descUrl = `https://api.mercadolibre.com/items/${itemId}/description`;

      const [itemRes, descRes] = await Promise.allSettled([
        fetch(itemUrl, { headers: { Accept: 'application/json' } }),
        fetch(descUrl, { headers: { Accept: 'application/json' } }),
      ]);

      // Check if CORS blocked us (TypeError = network/CORS error)
      if (itemRes.status === 'rejected') {
        const isCors = itemRes.reason instanceof TypeError;
        if (isCors) {
          setError('O Mercado Livre bloqueou a leitura direta no navegador (CORS). Tentando modo alternativo via servidor...');
          // Fallback to edge function
          const { data, error: fnError } = await supabase.functions.invoke('mktpfacil-clone', {
            body: { action: 'load_source', item_id: itemId, correlation_id: corrId, source_input_raw: sourceUrl },
          });
          if (fnError) throw new Error(fnError.message || 'Erro ao carregar anúncio');
          if (data?.error) throw new Error(data.error);
          if (!data?.snapshot) throw new Error('Resposta inválida do servidor');
          setSnapshot(data.snapshot as SourceSnapshot);
          setError(null); // clear CORS warning since fallback worked
          return;
        }
        throw new Error(`Erro de rede ao buscar item: ${itemRes.reason?.message || 'desconhecido'}`);
      }

      const itemResponse = itemRes.value;
      if (!itemResponse.ok) {
        const body = await itemResponse.text().catch(() => '');
        throw new Error(`Falha ao carregar (HTTP ${itemResponse.status}): ${body.substring(0, 300)}`);
      }

      const item = await itemResponse.json();

      // Description (optional, may fail)
      let description = '';
      if (descRes.status === 'fulfilled' && descRes.value.ok) {
        const descData = await descRes.value.json().catch(() => null);
        description = descData?.plain_text || descData?.text || '';
      }

      // Build snapshot from browser data
      const pictures = (item.pictures || []).map((p: any, i: number) => ({
        id: p.id || `pic_${i}`,
        url: (p.secure_url || p.url || '').replace(/^http:\/\//i, 'https://'),
        secure_url: (p.secure_url || p.url || '').replace(/^http:\/\//i, 'https://'),
      }));

      const snap: SourceSnapshot = {
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
        attributes: (item.attributes || []).map((a: any) => ({
          id: a.id,
          name: a.name,
          value_name: a.value_name,
        })),
        variations: (item.variations || []).map((v: any) => ({
          id: v.id,
          attribute_combinations: v.attribute_combinations || [],
          available_quantity: v.available_quantity || 0,
          price: v.price || item.price || 0,
          picture_ids: v.picture_ids || [],
        })),
        seller_id: String(item.seller_id || ''),
        thumbnail: item.thumbnail,
        catalog_product_id: item.catalog_product_id,
        catalog_listing: item.catalog_listing,
      };

      setSnapshot(snap);

      // Log success
      try {
        await supabase.rpc('register_system_log', {
          p_level: 'info',
          p_system_area: 'clone_anuncio',
          p_action: 'ml_browser_fetch_result',
          p_user_id: null,
          p_success: true,
          p_message: `Browser fetch OK: ${itemId}`,
          p_meta_json: {
            correlation_id: corrId,
            endpoint: itemUrl,
            http_status: itemResponse.status,
            pictures_count: pictures.length,
            has_description: description.length > 0,
            snippet: item.title?.substring(0, 100),
          },
        });
      } catch (_) { /* fail-safe */ }

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(msg);
      toast.error('Falha ao carregar anúncio', { description: msg });
    } finally {
      setLoading(false);
    }
  }, [sourceUrl]);

  // ============================================
  // Clone
  // ============================================
  const handleClone = useCallback(async () => {
    if (!snapshot || !selectedAccountId) return;

    setCloning(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('mktpfacil-clone', {
        body: {
          action: 'clone',
          item_id: snapshot.item_id,
          source_url: sourceUrl,
          destination_account_id: selectedAccountId,
          settings,
          source_snapshot: snapshot,
        },
      });

      if (fnError) throw new Error(fnError.message || 'Erro ao clonar');
      if (data?.error) throw new Error(data.error);

      toast.success('Job de clonagem criado!', {
        description: `Job ${data?.job_id?.slice(0, 8)}... em processamento`,
      });

      // Switch to history tab
      setActiveTab('history');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error('Falha ao clonar', { description: msg });
    } finally {
      setCloning(false);
    }
  }, [snapshot, selectedAccountId, sourceUrl, settings]);

  // ============================================
  // Helpers
  // ============================================
  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  const variationCount = snapshot?.variations?.length || 0;
  const hasCatalogSignals = !!(snapshot?.catalog_product_id || snapshot?.catalog_listing);

  const computedPrice = (basePrice: number) => {
    if (settings.price_mode === 'percent') return basePrice * (1 + settings.price_percent / 100);
    if (settings.price_mode === 'fixed') return settings.price_fixed;
    return basePrice;
  };

  // ============================================
  // Render
  // ============================================
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

          {/* ============================================ */}
          {/* TAB: CLONAR */}
          {/* ============================================ */}
          <TabsContent value="clone" className="space-y-6">
            {/* Anti-catalog warning */}
            <Alert className="border-amber-500/50 bg-amber-950/20">
              <Info className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-sm">
                O módulo publica como <strong>anúncio comum</strong>. Catálogo não será criado. 
                Campos que forçam catálogo são removidos automaticamente.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ============================================ */}
              {/* BLOCO 1 — ENTRADA */}
              {/* ============================================ */}
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Search className="h-4 w-4 text-primary" />
                    Anúncio de Origem
                  </CardTitle>
                  <CardDescription>Cole o link público do anúncio que deseja clonar</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://www.mercadolivre.com.br/..."
                      value={sourceUrl}
                      onChange={e => setSourceUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleLoadItem()}
                      className="flex-1"
                    />
                    <Button onClick={handleLoadItem} disabled={loading || !sourceUrl.trim()}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Carregar'}
                    </Button>
                  </div>
                  {/* Correlation ID display */}
                  {correlationId && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50 text-xs">
                      <span className="text-muted-foreground">
                        Execução: <code className="font-mono font-medium text-foreground">{correlationId}</code>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={() => {
                          window.open(`/admin/logs?area=clone_anuncio&search=${correlationId}`, '_blank');
                        }}
                      >
                        <ExternalLink className="h-3 w-3" />
                        Ver logs desta execução
                      </Button>
                    </div>
                  )}

                  {error && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-sm">{error}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* ============================================ */}
              {/* BLOCO 2 — CONTA DESTINO */}
              {/* ============================================ */}
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    Conta Destino
                  </CardTitle>
                  <CardDescription>Selecione a conta para receber o anúncio clonado</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {accountsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando contas...
                    </div>
                  ) : accounts.length === 0 ? (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
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
                      {selectedAccount.connection_status && (
                        <Badge variant={selectedAccount.connection_status === 'connected' ? 'default' : 'secondary'} className="text-xs">
                          {selectedAccount.connection_status}
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ============================================ */}
            {/* BLOCO 3 — PRÉVIA DO ANÚNCIO */}
            {/* ============================================ */}
            {snapshot && (
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Tag className="h-4 w-4 text-primary" />
                    Prévia do Anúncio
                  </CardTitle>
                  <CardDescription>Dados lidos publicamente do anúncio de origem</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Photos */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fotos ({snapshot.pictures?.length || 0})</p>
                      <div className="flex flex-wrap gap-2">
                        {(snapshot.pictures || []).slice(0, 6).map((pic, i) => (
                          <img
                            key={pic.id || i}
                            src={pic.secure_url || pic.url}
                            alt={`Foto ${i + 1}`}
                            className="h-16 w-16 rounded-md object-cover border border-border/50"
                          />
                        ))}
                        {(snapshot.pictures?.length || 0) > 6 && (
                          <div className="h-16 w-16 rounded-md border border-border/50 flex items-center justify-center text-xs text-muted-foreground">
                            +{snapshot.pictures.length - 6}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="md:col-span-2 space-y-3">
                      <div>
                        <p className="text-sm font-medium">{snapshot.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">ID: {snapshot.item_id}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{snapshot.condition === 'new' ? 'Novo' : 'Usado'}</Badge>
                        <Badge variant="outline">Categoria: {snapshot.category_name || snapshot.category_id}</Badge>
                        <Badge variant="outline">Tipo: {snapshot.listing_type_id}</Badge>
                        <Badge variant="outline">
                          R$ {snapshot.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </Badge>
                        <Badge variant="outline">
                          {variationCount === 0 ? 'Sem variações' : variationCount === 1 ? '1 variação' : `${variationCount} variações`}
                        </Badge>
                      </div>

                      {/* Catalog signals diagnosis */}
                      {hasCatalogSignals && (
                        <Alert className="border-amber-500/50 bg-amber-500/5">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          <AlertDescription className="text-xs">
                            O anúncio de origem tem sinais de catálogo (catalog_product_id: {snapshot.catalog_product_id}).
                            Esses campos serão <strong>removidos</strong> na clonagem.
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Key attributes */}
                      {snapshot.attributes && snapshot.attributes.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Atributos principais:</p>
                          <div className="flex flex-wrap gap-1">
                            {snapshot.attributes.slice(0, 10).map((attr, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {attr.name || attr.id}: {attr.value_name || '-'}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ============================================ */}
            {/* BLOCO 4 — CONFIGURAÇÕES DE CLONAGEM */}
            {/* ============================================ */}
            {snapshot && (
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-primary" />
                    Configurações de Clonagem
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Preço */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Preço</Label>
                      <RadioGroup
                        value={settings.price_mode}
                        onValueChange={v => setSettings(s => ({ ...s, price_mode: v as CloneSettings['price_mode'] }))}
                        className="space-y-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="keep" id="price-keep" />
                          <Label htmlFor="price-keep" className="text-sm">Manter preço público</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="percent" id="price-percent" />
                          <Label htmlFor="price-percent" className="text-sm">Aplicar %</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="fixed" id="price-fixed" />
                          <Label htmlFor="price-fixed" className="text-sm">Valor fixo</Label>
                        </div>
                      </RadioGroup>
                      {settings.price_mode === 'percent' && (
                        <Input
                          type="number"
                          placeholder="+10 ou -5"
                          value={settings.price_percent}
                          onChange={e => setSettings(s => ({ ...s, price_percent: Number(e.target.value) }))}
                        />
                      )}
                      {settings.price_mode === 'fixed' && (
                        <Input
                          type="number"
                          placeholder="Valor em R$"
                          value={settings.price_fixed || ''}
                          onChange={e => setSettings(s => ({ ...s, price_fixed: Number(e.target.value) }))}
                        />
                      )}
                      {snapshot && (
                        <p className="text-xs text-muted-foreground">
                          Preço final: R$ {computedPrice(snapshot.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>

                    {/* Estoque */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Estoque (por variação)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={settings.stock_value}
                        onChange={e => setSettings(s => ({ ...s, stock_value: Math.max(1, Number(e.target.value)) }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Aplicado a todas as {variationCount || 1} unidade(s)
                      </p>
                    </div>

                    {/* Tipo de anúncio */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Tipo de Anúncio</Label>
                      <Select
                        value={settings.listing_type}
                        onValueChange={v => setSettings(s => ({ ...s, listing_type: v as CloneSettings['listing_type'] }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="keep">Manter: {snapshot?.listing_type_id || '?'}</SelectItem>
                          <SelectItem value="gold_special">Clássico (gold_special)</SelectItem>
                          <SelectItem value="gold_pro">Premium (gold_pro)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Descrição */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Descrição</Label>
                      <RadioGroup
                        value={settings.description_mode}
                        onValueChange={v => setSettings(s => ({ ...s, description_mode: v as 'keep' | 'blank' }))}
                        className="space-y-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="keep" id="desc-keep" />
                          <Label htmlFor="desc-keep" className="text-sm">Duplicar descrição pública</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="blank" id="desc-blank" />
                          <Label htmlFor="desc-blank" className="text-sm">Deixar em branco</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </div>

                  <Separator />

                  {/* Clone button */}
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {variationCount > 0
                        ? `Serão criados ${variationCount} anúncio(s) (1 por variação)`
                        : 'Será criado 1 anúncio'}
                    </div>
                    <Button
                      size="lg"
                      onClick={handleClone}
                      disabled={cloning || !selectedAccountId}
                      className="gap-2"
                    >
                      {cloning ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Clonando...
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Clonar para conta destino
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ============================================ */}
          {/* TAB: HISTÓRICO */}
          {/* ============================================ */}
          <TabsContent value="history">
            <CloneHistory />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
