import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, GripVertical, Save, RotateCcw, Package, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { HeaderPreferences, OrderData, OrderItem } from '@/lib/buildHeaderLines';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';

const DEFAULT_PREFERENCES: HeaderPreferences = {
  show_customer: true,
  show_products: true,
  show_order_id: true,
  show_shipment_id: false,
  show_comment: true,
  show_sku: true,
  show_variation_attrs: true,
  line_order: ['customer', 'products', 'order', 'comment'],
  max_product_lines: 3,
  max_total_lines: 6,
  font_size: 8,
};

const LINE_TYPE_LABELS: Record<string, string> = {
  customer: 'Nome do Cliente',
  products: 'Lista de Produtos',
  order: 'Número do Pedido',
  comment: 'Observações',
};

// Sample data for preview
const SAMPLE_ORDER: OrderData = {
  order_id: '2000005847123456',
  shipment_id: '44123456789',
  buyer_name: 'João da Silva',
  order_comment: 'Presente, embrulhar para presente. Entregar após 18h.',
};

const SAMPLE_ITEMS: OrderItem[] = [
  { sku: 'W11310109', title_short: 'Hélice Espargidor Superior Lava Louça', title: 'Hélice Espargidor Superior Lava Louça Brastemp', quantity: 1, variation_attributes: [{ name: 'Cor', value_name: 'Transparente + Cinza' }] },
  { sku: 'XYZ-789', title_short: 'Calça Jeans 42', title: 'Calça Jeans Tamanho 42', quantity: 1, variation_attributes: [{ name: 'Tamanho', value_name: '42' }, { name: 'Cor', value_name: 'Azul Escuro' }] },
  { sku: 'DEF-456', title_short: 'Tênis Branco 40', title: 'Tênis Branco Tamanho 40', quantity: 1, variation_attributes: [{ name: 'Tamanho', value_name: '40' }] },
  { sku: null, title_short: 'Meia Preta Kit 3 pares', title: 'Meia Preta Kit 3 pares', quantity: 3 },
];

export default function LabelHeaderSettings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const { activeAccount, sellerId, loading: accountLoading, initialized } = useActiveAccount();
  
  const [preferences, setPreferences] = useState<HeaderPreferences>(DEFAULT_PREFERENCES);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!accountLoading && initialized && !activeAccount) {
      toast({
        title: 'Conta não conectada',
        description: 'Você precisa conectar sua conta do Mercado Livre primeiro.',
        variant: 'destructive',
      });
      navigate('/dashboard');
    }
  }, [accountLoading, initialized, activeAccount, navigate, toast]);

  useEffect(() => {
    if (!sellerId) return;
    
    const fetchPreferences = async () => {
      const { data: prefData } = await supabase
        .from('meli_label_header_preferences')
        .select('*')
        .eq('seller_id', sellerId)
        .maybeSingle();

      if (prefData) {
        setPreferences({
          show_customer: prefData.show_customer,
          show_products: prefData.show_products,
          show_order_id: prefData.show_order_id,
          show_shipment_id: prefData.show_shipment_id,
          show_comment: prefData.show_comment,
          show_sku: prefData.show_sku ?? true,
          show_variation_attrs: (prefData as any).show_variation_attrs ?? true,
          line_order: prefData.line_order as string[],
          max_product_lines: prefData.max_product_lines,
          max_total_lines: prefData.max_total_lines,
          font_size: prefData.font_size,
        });
      }
      setLoading(false);
    };

    fetchPreferences();
  }, [sellerId]);

  // Generate preview lines — customer always first, one product per line with SKU
  const generatePreviewLines = useCallback((): { text: string; bold?: boolean }[] => {
    const lineContents: Record<string, { text: string; bold?: boolean }[]> = {
      customer: [],
      products: [],
      order: [],
      comment: [],
    };

    if (preferences.show_customer && SAMPLE_ORDER.buyer_name) {
      lineContents.customer = [{ text: SAMPLE_ORDER.buyer_name }];
    }

    if (preferences.show_products && SAMPLE_ITEMS.length > 0) {
      const sortedItems = [...SAMPLE_ITEMS].sort((a, b) => b.quantity - a.quantity);
      const lines: { text: string; bold?: boolean }[] = [];

      for (let i = 0; i < sortedItems.length; i++) {
        if (lines.length >= preferences.max_product_lines) break;

        const item = sortedItems[i];
        const displayTitle = item.title || item.title_short || 'Item';
        lines.push({ text: displayTitle.substring(0, 60), bold: true });

        if (lines.length < preferences.max_product_lines) {
          const skuPart = preferences.show_sku && item.sku ? ` - Apelido: ${item.sku}` : '';
          lines.push({ text: `Quantidade: ${item.quantity}${skuPart}` });
        }

        if (preferences.show_variation_attrs && item.variation_attributes && lines.length < preferences.max_product_lines) {
          for (const attr of item.variation_attributes) {
            if (lines.length >= preferences.max_product_lines) break;
            const name = (attr as any).name || '';
            const value = (attr as any).value_name || '';
            if (name && value) {
              lines.push({ text: `${name}: ${value}` });
            }
          }
        }
      }

      lineContents.products = lines;
    }

    if (preferences.show_order_id) {
      lineContents.order = [{ text: `Pedido: ${SAMPLE_ORDER.order_id}` }];
    }

    if (preferences.show_comment && SAMPLE_ORDER.order_comment) {
      const cleanComment = SAMPLE_ORDER.order_comment.substring(0, 50);
      lineContents.comment = [{ text: `Obs: ${cleanComment}...` }];
    }

    // Customer ALWAYS first, then remaining in configured order
    const allLines: { text: string; bold?: boolean }[] = [];
    if (lineContents.customer.length > 0) {
      for (const line of lineContents.customer) {
        if (allLines.length >= preferences.max_total_lines) break;
        allLines.push(line);
      }
    }
    for (const lineType of preferences.line_order) {
      if (lineType === 'customer') continue;
      const content = lineContents[lineType] || [];
      for (const line of content) {
        if (allLines.length >= preferences.max_total_lines) break;
        allLines.push(line);
      }
      if (allLines.length >= preferences.max_total_lines) break;
    }

    return allLines;
  }, [preferences]);

  const calculateHeaderHeight = useCallback((lines: number, fontSize: number): number => {
    const lineHeightMm = fontSize * 1.4 * 0.353;
    const paddingMm = 2;
    return lines * lineHeightMm + paddingMm;
  }, []);

  const previewLines = generatePreviewLines();
  const estimatedHeightMm = calculateHeaderHeight(previewLines.length, preferences.font_size);
  const maxHeightMm = 25;
  const isOverflow = estimatedHeightMm > maxHeightMm;
  const usagePercent = Math.min((estimatedHeightMm / maxHeightMm) * 100, 100);
  const heightDisplay = estimatedHeightMm.toFixed(1);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newOrder = [...preferences.line_order];
    const [draggedItem] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(index, 0, draggedItem);
    
    setPreferences(prev => ({ ...prev, line_order: newOrder }));
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleSave = async () => {
    if (!sellerId) return;

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      const { error } = await supabase
        .from('meli_label_header_preferences')
        .upsert({
          seller_id: sellerId,
          user_id: session.user.id,
          show_customer: preferences.show_customer,
          show_products: preferences.show_products,
          show_order_id: preferences.show_order_id,
          show_shipment_id: preferences.show_shipment_id,
          show_comment: preferences.show_comment,
          show_sku: preferences.show_sku,
          line_order: preferences.line_order,
          max_product_lines: preferences.max_product_lines,
          max_total_lines: preferences.max_total_lines,
          font_size: preferences.font_size,
        }, { onConflict: 'seller_id' });

      if (error) throw error;

      toast({
        title: 'Preferências salvas',
        description: 'Suas configurações de cabeçalho foram atualizadas.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao salvar',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPreferences(DEFAULT_PREFERENCES);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/shipping-labels')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <Package className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-xl font-semibold">Configurar Cabeçalho</h1>
                <p className="text-sm text-muted-foreground">
                  Personalize o cabeçalho das etiquetas 100×175mm
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Settings Panel */}
          <div className="space-y-6">
            {/* Toggle Sections */}
            <Card>
              <CardHeader>
                <CardTitle>Seções do Cabeçalho</CardTitle>
                <CardDescription>
                  Escolha quais informações aparecem na etiqueta
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="show_customer" className="flex-1">Nome do Cliente</Label>
                  <Switch
                    id="show_customer"
                    checked={preferences.show_customer}
                    onCheckedChange={(checked) => 
                      setPreferences(prev => ({ ...prev, show_customer: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="show_products" className="flex-1">Lista de Produtos</Label>
                  <Switch
                    id="show_products"
                    checked={preferences.show_products}
                    onCheckedChange={(checked) => 
                      setPreferences(prev => ({ ...prev, show_products: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="show_sku" className="flex-1">Exibir SKU nos Produtos</Label>
                  <Switch
                    id="show_sku"
                    checked={preferences.show_sku}
                    onCheckedChange={(checked) => 
                      setPreferences(prev => ({ ...prev, show_sku: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="show_order_id" className="flex-1">Número do Pedido</Label>
                  <Switch
                    id="show_order_id"
                    checked={preferences.show_order_id}
                    onCheckedChange={(checked) => 
                      setPreferences(prev => ({ ...prev, show_order_id: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="show_comment" className="flex-1">Observações do Pedido</Label>
                  <Switch
                    id="show_comment"
                    checked={preferences.show_comment}
                    onCheckedChange={(checked) => 
                      setPreferences(prev => ({ ...prev, show_comment: checked }))
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Drag & Drop Order */}
            <Card>
              <CardHeader>
                <CardTitle>Ordem das Seções</CardTitle>
                <CardDescription>
                  Arraste para reorganizar (o nome do cliente aparece sempre em 1º)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {preferences.line_order.map((lineType, index) => (
                    <div
                      key={lineType}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-3 p-3 rounded-lg border bg-card cursor-move transition-all ${
                        draggedIndex === index ? 'opacity-50 scale-95' : 'hover:bg-muted/50'
                      }`}
                    >
                      <GripVertical className="h-5 w-5 text-muted-foreground" />
                      <span className="flex-1 font-medium">
                        {LINE_TYPE_LABELS[lineType] || lineType}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {lineType === 'customer' ? '1º (fixo)' : `${index + 1}º`}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Limits */}
            <Card>
              <CardHeader>
                <CardTitle>Limites</CardTitle>
                <CardDescription>
                  Configure os limites de linhas no cabeçalho
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Máximo de linhas de produtos</Label>
                    <span className="text-sm font-medium">{preferences.max_product_lines}</span>
                  </div>
                  <Slider
                    value={[preferences.max_product_lines]}
                    onValueChange={([value]) => 
                      setPreferences(prev => ({ ...prev, max_product_lines: value }))
                    }
                    min={1}
                    max={5}
                    step={1}
                    className="w-full"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Máximo total de linhas</Label>
                    <span className="text-sm font-medium">{preferences.max_total_lines}</span>
                  </div>
                  <Slider
                    value={[preferences.max_total_lines]}
                    onValueChange={([value]) => 
                      setPreferences(prev => ({ ...prev, max_total_lines: value }))
                    }
                    min={2}
                    max={8}
                    step={1}
                    className="w-full"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Tamanho da fonte</Label>
                    <span className="text-sm font-medium">{preferences.font_size}pt</span>
                  </div>
                  <Slider
                    value={[preferences.font_size]}
                    onValueChange={([value]) => 
                      setPreferences(prev => ({ ...prev, font_size: value }))
                    }
                    min={6}
                    max={12}
                    step={1}
                    className="w-full"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Height Validation Alert */}
            <Alert variant={isOverflow ? "destructive" : "default"} className={isOverflow ? "" : "border-green-500/50 bg-green-500/10"}>
              {isOverflow ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <CheckCircle className="h-4 w-4 text-green-600" />
              )}
              <AlertDescription className="flex items-center justify-between">
                <span>
                  {isOverflow 
                    ? `Cabeçalho excede 25mm (${heightDisplay}mm). Reduza linhas ou fonte.`
                    : `Altura estimada: ${heightDisplay}mm de 25mm disponíveis`
                  }
                </span>
                <div className="flex items-center gap-2 ml-4">
                  <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${isOverflow ? 'bg-destructive' : 'bg-green-500'}`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium w-10">{Math.round(usagePercent)}%</span>
                </div>
              </AlertDescription>
            </Alert>

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleReset} className="flex-1">
                <RotateCcw className="h-4 w-4 mr-2" />
                Restaurar Padrão
              </Button>
              <Button onClick={handleSave} disabled={saving || isOverflow} className="flex-1">
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Salvando...' : 'Salvar Preferências'}
              </Button>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="lg:sticky lg:top-6">
            <Card>
              <CardHeader>
                <CardTitle>Pré-visualização</CardTitle>
                <CardDescription>
                  Exemplo de como ficará o cabeçalho da etiqueta
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Label Preview - 100x175mm aspect ratio (4:7) */}
                <div 
                  className="mx-auto border-2 border-dashed border-muted-foreground/30 rounded-lg overflow-hidden"
                  style={{ 
                    width: '280px', 
                    height: '490px',
                    background: 'white'
                  }}
                >
                  {/* Header Section - 25mm top (proportional) */}
                  <div 
                    className="bg-muted/30 border-b-2 border-dashed border-muted-foreground/30 p-3"
                    style={{ height: '70px' }}
                  >
                    <div 
                      className="font-mono text-foreground leading-tight overflow-hidden"
                      style={{ fontSize: `${preferences.font_size}px` }}
                    >
                      {previewLines.length > 0 ? (
                        previewLines.map((line, i) => (
                          <div key={i} className="truncate">{line}</div>
                        ))
                      ) : (
                        <div className="text-muted-foreground italic text-center">
                          Nenhuma seção ativada
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ML Label Section - 100x150mm (bottom portion) */}
                  <div 
                    className="flex flex-col items-center justify-center text-muted-foreground/50"
                    style={{ height: '420px' }}
                  >
                    <Package className="h-12 w-12 mb-2" />
                    <span className="text-sm font-medium">Etiqueta Mercado Livre</span>
                    <span className="text-xs">(100 × 150 mm)</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground text-center mt-4">
                  O cabeçalho ocupa 25mm no topo da etiqueta 100×175mm
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
