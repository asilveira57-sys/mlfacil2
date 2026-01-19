import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Package, Loader2 } from 'lucide-react';
import { useSubcategories, Subcategory } from '@/hooks/useSubcategories';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface SubcategoryNodeProps {
  category: {
    id: string;
    name: string;
    children_count?: number;
  };
  depth: number;
  selectedId: string | null;
  onSelect: (id: string, name: string) => void;
}

function SubcategoryNode({ category, depth, selectedId, onSelect }: SubcategoryNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { data: children, isLoading } = useSubcategories(category.id, isExpanded);

  const hasChildren = (category.children_count ?? 0) > 0 || (children && children.length > 0);
  const isSelected = selectedId === category.id;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleSelect = () => {
    onSelect(category.id, category.name);
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer transition-colors',
          'hover:bg-muted/50',
          isSelected && 'bg-primary/10 text-primary font-medium'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleSelect}
      >
        {hasChildren ? (
          <button
            onClick={handleToggle}
            className="p-0.5 hover:bg-muted rounded"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
        
        {isExpanded ? (
          <FolderOpen className="h-4 w-4 text-amber-500" />
        ) : hasChildren ? (
          <Folder className="h-4 w-4 text-amber-500/70" />
        ) : (
          <Package className="h-4 w-4 text-muted-foreground" />
        )}
        
        <span className="flex-1 truncate text-sm">{category.name}</span>
      </div>

      {isExpanded && children && children.length > 0 && (
        <div>
          {children.map((child) => (
            <SubcategoryNode
              key={child.id}
              category={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SubcategoryNavigatorProps {
  categories: { id: string; name: string }[];
  selectedId: string | null;
  onSelect: (id: string, name: string) => void;
  breadcrumb?: { id: string; name: string }[];
  onBreadcrumbClick?: (id: string) => void;
}

export function SubcategoryNavigator({
  categories,
  selectedId,
  onSelect,
  breadcrumb,
  onBreadcrumbClick,
}: SubcategoryNavigatorProps) {
  return (
    <div className="border rounded-lg bg-card">
      {/* Breadcrumb */}
      {breadcrumb && breadcrumb.length > 1 && (
        <div className="flex items-center gap-1 p-2 border-b text-sm flex-wrap">
          {breadcrumb.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-1">
              {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              <button
                onClick={() => onBreadcrumbClick?.(item.id)}
                className={cn(
                  'hover:text-primary hover:underline truncate max-w-[120px]',
                  idx === breadcrumb.length - 1 ? 'text-primary font-medium' : 'text-muted-foreground'
                )}
              >
                {item.name}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Category Tree */}
      <ScrollArea className="h-[300px]">
        <div className="p-2">
          {/* All categories option */}
          <div
            className={cn(
              'flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors',
              'hover:bg-muted/50',
              !selectedId && 'bg-primary/10 text-primary font-medium'
            )}
            onClick={() => onSelect('', 'Todas')}
          >
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Todas as Categorias</span>
            <Badge variant="outline" className="ml-auto text-xs">Geral</Badge>
          </div>

          {/* Main categories */}
          {categories.map((cat) => (
            <SubcategoryNode
              key={cat.id}
              category={{ ...cat, children_count: 1 }} // Assume has children for main categories
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
