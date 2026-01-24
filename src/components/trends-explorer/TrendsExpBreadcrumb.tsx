import { ChevronRight, Home } from 'lucide-react';
import { useTrendsExplorer } from '@/contexts/TrendsExplorerContext';
import { Button } from '@/components/ui/button';

export function TrendsExpBreadcrumb() {
  const { state, goBack, goToRoot } = useTrendsExplorer();
  const { breadcrumb } = state;

  if (breadcrumb.length <= 1) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Home className="h-4 w-4" />
        <span className="font-medium text-foreground">Categorias</span>
      </div>
    );
  }

  return (
    <nav className="flex items-center gap-1 text-sm">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-muted-foreground hover:text-foreground"
        onClick={goToRoot}
      >
        <Home className="h-4 w-4" />
      </Button>

      {breadcrumb.map((item, index) => {
        const isLast = index === breadcrumb.length - 1;
        const isFirst = index === 0;

        if (isFirst) return null;

        return (
          <div key={item.id || 'root'} className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            {isLast ? (
              <span className="font-medium text-foreground">{item.name}</span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground hover:text-foreground"
                onClick={goBack}
              >
                {item.name}
              </Button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
