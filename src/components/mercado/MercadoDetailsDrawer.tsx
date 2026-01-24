import { RefreshCw, X, Copy, Video, Tag, Truck, Percent, MapPin, Store } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMercado } from '@/contexts/MercadoContext';
import { toast } from 'sonner';

export function MercadoDetailsDrawer() {
  const { state, closeDrawer, openDetails } = useMercado();
  const isOpen = state.drawerType === 'details';
  const details = state.currentDetails;
  const isLoading = state.isLoadingDetails;
  const categoryName = state.categories.find(c => c.id === state.selectedCategoryId)?.name || 'Categoria';

  const handleRefresh = () => {
    if (state.selectedCategoryId) {
      openDetails(state.selectedCategoryId);
    }
  };

  const handleCopyResume = () => {
    if (!details) return;
    const text = `
${categoryName}
Total: ${details.kpis.total_listings.toLocaleString('pt-BR')} anúncios
Criados 24h: ${details.kpis.created_24h.toLocaleString('pt-BR')}
Preço médio: R$ ${details.kpis.avg_price.toLocaleString('pt-BR')}
`.trim();
    navigator.clipboard.writeText(text);
    toast.success('Resumo copiado!');
  };

  return (
    <Sheet open={isOpen} onOpenChange={() => closeDrawer()}>
      <SheetContent className="w-full sm:max-w-lg overflow-hidden flex flex-col">
        <SheetHeader className="flex-shrink-0 border-b pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold truncate pr-2">
              {categoryName}
            </SheetTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopyResume}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeDrawer}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="py-4 space-y-6">
            {isLoading ? (
              <DetailsSkeleton />
            ) : details ? (
              <DetailsContent details={details} />
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Nenhum dado disponível
              </p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function DetailsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-lg" />
      ))}
    </div>
  );
}

function DetailsContent({ details }: { details: NonNullable<ReturnType<typeof useMercado>['state']['currentDetails']> }) {
  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Total de Anúncios" value={details.kpis.total_listings.toLocaleString('pt-BR')} />
        <KpiCard label="Criados em 24h" value={details.kpis.created_24h.toLocaleString('pt-BR')} />
        <KpiCard label="Preço Médio" value={`R$ ${details.kpis.avg_price.toLocaleString('pt-BR')}`} />
        <KpiCard label="Preço Mediano" value={`R$ ${details.kpis.median_price.toLocaleString('pt-BR')}`} />
      </div>

      {/* Conditions */}
      <BreakdownSection title="Condição" items={details.conditions} />

      {/* Sale Formats */}
      <BreakdownSection title="Formato de Venda" items={details.sale_formats} />

      {/* Listing Types */}
      <BreakdownSection title="Tipo de Anúncio" items={details.listing_types} />

      {/* Shipping */}
      <BreakdownSection title="Modalidade de Envio" items={details.shipping_modes} icon={<Truck className="h-4 w-4" />} />

      {/* Flags */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          Características
        </h4>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1">
            <Video className="h-3 w-3" />
            Com vídeo: {details.flags.with_video.toLocaleString('pt-BR')}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Percent className="h-3 w-3" />
            Com oferta: {details.flags.with_offer.toLocaleString('pt-BR')}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Truck className="h-3 w-3" />
            Frete grátis: {details.flags.with_free_shipping.toLocaleString('pt-BR')}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Tag className="h-3 w-3" />
            Com desconto: {details.flags.with_discount.toLocaleString('pt-BR')}
          </Badge>
        </div>
      </div>

      {/* Price Ranges */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Faixas de Preço</h4>
        <div className="space-y-1.5">
          {details.price_ranges.map((range) => (
            <div key={range.range} className="flex items-center gap-2 text-sm">
              <span className="w-24 text-muted-foreground">{range.range}</span>
              <Progress value={range.percent} className="flex-1 h-2" />
              <span className="w-12 text-right">{range.percent}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Locations */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          Localização
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {details.locations.slice(0, 8).map((loc) => (
            <div key={loc.state} className="flex items-center justify-between text-sm bg-muted/50 rounded-md px-2 py-1">
              <span>{loc.state}</span>
              <span className="text-muted-foreground">{loc.percent}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Official Stores */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Store className="h-4 w-4 text-muted-foreground" />
          Lojas Oficiais ({details.official_stores.length})
        </h4>
        <div className="max-h-32 overflow-y-auto space-y-1">
          {details.official_stores.slice(0, 10).map((store) => (
            <div key={store.id} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
              <span className="truncate">{store.name}</span>
              <span className="text-muted-foreground">{store.listings_count.toLocaleString('pt-BR')}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-0.5">{value}</p>
    </div>
  );
}

function BreakdownSection({
  title,
  items,
  icon,
}: {
  title: string;
  items: { label: string; count: number; percent: number }[];
  icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium flex items-center gap-2">
        {icon}
        {title}
      </h4>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-sm">
            <span className="w-28 text-muted-foreground truncate">{item.label}</span>
            <Progress value={item.percent} className="flex-1 h-2" />
            <span className="w-10 text-right">{item.percent}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
