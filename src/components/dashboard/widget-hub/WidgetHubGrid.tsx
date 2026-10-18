import { useMemo, lazy, Suspense } from 'react';
import { useWidgetCatalog, useUserWidgets, useWidgetActions } from '@/hooks/useWidgetHub';
import { WidgetCatalogDrawer } from './WidgetCatalogDrawer';
import { Button } from '@/components/ui/button';
import { RotateCcw, LayoutGrid } from 'lucide-react';

// Drag-and-drop lib only loads when the user actually has widgets.
const WidgetHubDndList = lazy(() => import('./WidgetHubDndList'));

export function WidgetHubGrid() {
  const { data: catalog = [] } = useWidgetCatalog();
  const { data: userWidgets = [], isLoading } = useUserWidgets();
  const { reorderWidgets, resetLayout } = useWidgetActions();

  const catalogMap = useMemo(() => {
    const m = new Map<string, { nome: string; icone: string | null }>();
    catalog.forEach(c => m.set(c.slug, { nome: c.nome, icone: c.icone }));
    return m;
  }, [catalog]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-40 rounded-lg bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Hub de Widgets</h2>
        </div>
        <div className="flex items-center gap-2">
          {userWidgets.length > 0 && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => resetLayout.mutate()}>
              <RotateCcw className="h-3 w-3" />
              Restaurar
            </Button>
          )}
          <WidgetCatalogDrawer />
        </div>
      </div>

      {/* Empty state */}
      {userWidgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border-2 border-dashed border-border/50 bg-gradient-to-b from-muted/30 to-transparent">
          <LayoutGrid className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">Seu hub está vazio. Adicione widgets para personalizar!</p>
          <WidgetCatalogDrawer />
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {userWidgets.map((w) => (
                <div key={w.id} className="h-40 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          }
        >
          <WidgetHubDndList
            userWidgets={userWidgets}
            catalogMap={catalogMap}
            onReorder={(ids) => reorderWidgets.mutate(ids)}
          />
        </Suspense>
      )}
    </div>
  );
}
