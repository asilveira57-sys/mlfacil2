import { ChevronRight, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMercado } from '@/contexts/MercadoContext';

export function MercadoBreadcrumb() {
  const { state, goBack, goToRoot } = useMercado();

  if (state.breadcrumb.length <= 1) {
    return null;
  }

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 gap-1"
        onClick={goToRoot}
      >
        <Home className="h-3.5 w-3.5" />
      </Button>

      {state.breadcrumb.map((item, index) => (
        <div key={item.id ?? 'root'} className="flex items-center gap-1">
          {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />}
          {index === state.breadcrumb.length - 1 ? (
            <span className="font-medium text-foreground">{item.name}</span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                // Navigate back to this level
                const stepsBack = state.breadcrumb.length - 1 - index;
                for (let i = 0; i < stepsBack; i++) {
                  goBack();
                }
              }}
            >
              {item.name}
            </Button>
          )}
        </div>
      ))}
    </nav>
  );
}
