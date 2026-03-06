import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { GripVertical, Pin, PinOff, X, MoreVertical, Maximize2, Minimize2 } from 'lucide-react';
import { UserWidget, useWidgetActions } from '@/hooks/useWidgetHub';
import { WidgetIcon } from './WidgetIcon';
import { WidgetRenderer } from './WidgetRenderer';
import { cn } from '@/lib/utils';

interface Props {
  widget: UserWidget;
  catalogName: string;
  catalogIcon: string | null;
  dragHandleProps?: any;
}

export function WidgetCard({ widget, catalogName, catalogIcon, dragHandleProps }: Props) {
  const { removeWidget, togglePin, resizeWidget } = useWidgetActions();

  const isLarge = widget.largura >= 2 && widget.altura >= 2;
  const isMedium = widget.largura >= 2 && widget.altura === 1;

  const cycleSize = () => {
    if (isLarge) resizeWidget.mutate({ widgetId: widget.id, slug: widget.widget_slug, w: 1, h: 1 });
    else if (isMedium) resizeWidget.mutate({ widgetId: widget.id, slug: widget.widget_slug, w: 2, h: 2 });
    else resizeWidget.mutate({ widgetId: widget.id, slug: widget.widget_slug, w: 2, h: 1 });
  };

  return (
    <Card className={cn(
      'group relative overflow-hidden transition-all duration-200',
      'bg-card/80 backdrop-blur-sm border-border/50',
      'hover:shadow-md hover:border-border',
      isLarge && 'col-span-2 row-span-2',
      isMedium && !isLarge && 'col-span-2',
    )}>
      <CardHeader className="flex flex-row items-center gap-2 p-3 pb-0">
        <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 transition-opacity">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <WidgetIcon name={catalogIcon} className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground flex-1 truncate">{catalogName}</span>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => togglePin.mutate(widget)}>
            {widget.fixado ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={cycleSize}>
                {isLarge ? <Minimize2 className="h-4 w-4 mr-2" /> : <Maximize2 className="h-4 w-4 mr-2" />}
                Redimensionar
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => removeWidget.mutate(widget)}>
                <X className="h-4 w-4 mr-2" />
                Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-2">
        <WidgetRenderer slug={widget.widget_slug} config={widget.config_json} size={{ w: widget.largura, h: widget.altura }} />
      </CardContent>
    </Card>
  );
}
