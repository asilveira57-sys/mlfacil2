import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Check } from 'lucide-react';
import { useWidgetCatalog, useUserWidgets, useWidgetActions, CatalogWidget } from '@/hooks/useWidgetHub';
import { cn } from '@/lib/utils';
import { useMemo, useState } from 'react';
import { WidgetIcon } from './WidgetIcon';

interface Props {
  trigger?: React.ReactNode;
}

const SIZE_LABELS: Record<string, string> = {
  small: 'P',
  medium: 'M',
  large: 'G',
};

export function WidgetCatalogDrawer({ trigger }: Props) {
  const { data: catalog = [] } = useWidgetCatalog();
  const { data: userWidgets = [] } = useUserWidgets();
  const { addWidget } = useWidgetActions();
  const [open, setOpen] = useState(false);

  const addedSlugs = useMemo(() => new Set(userWidgets.map(w => w.widget_slug)), [userWidgets]);

  const handleAdd = (item: CatalogWidget) => {
    if (addedSlugs.has(item.slug)) return;
    addWidget.mutate(item);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar Widget
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-[380px] sm:w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Catálogo de Widgets</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {catalog.map((item) => {
            const added = addedSlugs.has(item.slug);
            return (
              <button
                key={item.slug}
                onClick={() => handleAdd(item)}
                disabled={added || addWidget.isPending}
                className={cn(
                  'w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left',
                  'hover:bg-accent/50 hover:shadow-sm',
                  added && 'opacity-60 cursor-default'
                )}
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                  <WidgetIcon name={item.icone} className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground">{item.nome}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {SIZE_LABELS[item.tamanho_padrao] ?? 'M'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.descricao}</p>
                </div>
                {added && <Check className="h-4 w-4 text-primary flex-shrink-0 mt-1" />}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
