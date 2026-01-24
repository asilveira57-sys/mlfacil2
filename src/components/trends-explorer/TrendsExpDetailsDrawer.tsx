import { RefreshCw, Copy, X } from 'lucide-react';
import { useTrendsExplorer } from '@/contexts/TrendsExplorerContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from 'sonner';

export function TrendsExpDetailsDrawer() {
  const { state, closeDrawer, openDetails } = useTrendsExplorer();
  const { drawerType, selectedCategoryId, currentDetails, isLoadingDetails, categories } = state;

  const isOpen = drawerType === 'details';
  const category = categories.find(c => c.id === selectedCategoryId);

  const handleRefresh = () => {
    if (selectedCategoryId) {
      openDetails(selectedCategoryId);
    }
  };

  const handleCopySummary = () => {
    if (!currentDetails || !category) return;
    
    const summary = `
📊 ${category.name}
━━━━━━━━━━━━━━━━━━━━━
📦 Total de anúncios: ${currentDetails.kpis.total_listings.toLocaleString('pt-BR')}
🆕 Criados (24h): ${currentDetails.kpis.created_24h.toLocaleString('pt-BR')}
💰 Preço médio: R$ ${currentDetails.kpis.avg_price.toLocaleString('pt-BR')}
📈 Preço mediano: R$ ${currentDetails.kpis.median_price.toLocaleString('pt-BR')}

🏷️ Condições:
${currentDetails.conditions.map(c => `  • ${c.label}: ${c.percent}%`).join('\n')}

📦 Envio:
${currentDetails.shipping_modes.map(s => `  • ${s.label}: ${s.percent}%`).join('\n')}
    `.trim();

    navigator.clipboard.writeText(summary);
    toast.success('Resumo copiado!');
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeDrawer()}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        {/* Fixed Header */}
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-4">
            <SheetTitle className="text-lg font-semibold truncate">
              {category?.name || 'Detalhes'}
            </SheetTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopySummary}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeDrawer}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        {/* Scrollable Content */}
        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-6">
            {isLoadingDetails ? (
              <DetailsLoading />
            ) : currentDetails ? (
              <>
                {/* KPIs */}
                <section>
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">Indicadores</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <KpiCard label="Total de anúncios" value={currentDetails.kpis.total_listings.toLocaleString('pt-BR')} />
                    <KpiCard label="Criados (24h)" value={currentDetails.kpis.created_24h.toLocaleString('pt-BR')} />
                    <KpiCard label="Preço médio" value={`R$ ${currentDetails.kpis.avg_price.toLocaleString('pt-BR')}`} />
                    <KpiCard label="Preço mediano" value={`R$ ${currentDetails.kpis.median_price.toLocaleString('pt-BR')}`} />
                  </div>
                </section>

                {/* Conditions */}
                <BreakdownSection title="Condição" items={currentDetails.conditions} />

                {/* Sale Formats */}
                <BreakdownSection title="Formato de venda" items={currentDetails.sale_formats} />

                {/* Listing Types */}
                <BreakdownSection title="Tipo de anúncio" items={currentDetails.listing_types} />

                {/* Shipping Modes */}
                <BreakdownSection title="Envio" items={currentDetails.shipping_modes} />

                {/* Flags */}
                <section>
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">Recursos</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">🎥 Vídeo: {currentDetails.flags.with_video.toLocaleString('pt-BR')}</Badge>
                    <Badge variant="secondary">🏷️ Oferta: {currentDetails.flags.with_offer.toLocaleString('pt-BR')}</Badge>
                    <Badge variant="secondary">🚚 Frete grátis: {currentDetails.flags.with_free_shipping.toLocaleString('pt-BR')}</Badge>
                    <Badge variant="secondary">💸 Desconto: {currentDetails.flags.with_discount.toLocaleString('pt-BR')}</Badge>
                  </div>
                </section>

                {/* Price Ranges */}
                <section>
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">Faixas de preço</h4>
                  <div className="space-y-2">
                    {currentDetails.price_ranges.map((range) => (
                      <div key={range.range} className="flex items-center gap-3">
                        <span className="text-sm w-24 shrink-0">{range.range}</span>
                        <Progress value={range.percent} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground w-12 text-right">{range.percent}%</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Locations */}
                <section>
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">Localização</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {currentDetails.locations.slice(0, 8).map((loc) => (
                      <div key={loc.state} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <span className="text-sm font-medium">{loc.state}</span>
                        <span className="text-xs text-muted-foreground">{loc.percent}%</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Official Stores */}
                <section>
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">
                    Lojas oficiais ({currentDetails.official_stores.length})
                  </h4>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {currentDetails.official_stores.slice(0, 10).map((store) => (
                      <div key={store.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                        <span className="text-sm truncate">{store.name}</span>
                        <span className="text-xs text-muted-foreground">{store.listings_count.toLocaleString('pt-BR')}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Selecione uma categoria para ver os detalhes
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/50 border">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function BreakdownSection({ title, items }: { title: string; items: { label: string; percent: number }[] }) {
  return (
    <section>
      <h4 className="text-sm font-medium text-muted-foreground mb-3">{title}</h4>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <span className="text-sm w-28 shrink-0 truncate">{item.label}</span>
            <Progress value={item.percent} className="h-2 flex-1" />
            <span className="text-xs text-muted-foreground w-10 text-right">{item.percent}%</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DetailsLoading() {
  return (
    <div className="space-y-6">
      <section>
        <Skeleton className="h-4 w-20 mb-3" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </section>
      {Array.from({ length: 4 }).map((_, i) => (
        <section key={i}>
          <Skeleton className="h-4 w-24 mb-3" />
          <div className="space-y-2">
            <Skeleton className="h-4" />
            <Skeleton className="h-4" />
            <Skeleton className="h-4" />
          </div>
        </section>
      ))}
    </div>
  );
}
