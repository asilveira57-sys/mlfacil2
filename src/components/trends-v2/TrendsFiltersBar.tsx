import { useEffect, useState } from 'react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  User, 
  Clock, 
  FolderTree, 
  RefreshCw,
  ChevronDown,
  Star,
  Package,
  DollarSign
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================
// TRENDS FILTERS BAR
// Rules:
// - NO portals in body (use modal={false} on SelectContent)
// - NO fullscreen overlays
// - Dropdowns close on route change
// - 90 days only appears when hasHistory=true
// ============================================================

interface Account {
  id: string;
  ml_user_id: string;
  nickname: string | null;
}

interface SellerCategory {
  category_id: string;
  category_name: string;
  orders_count_90d: number;
  gmv_90d: number;
  is_pinned_auto: boolean;
  category_path: string[];
}

interface TrendsFiltersBarProps {
  // Accounts
  accounts: Account[];
  selectedAccountId: string | null;
  onAccountChange: (accountId: string | null) => void;
  
  // Period
  selectedPeriod: number;
  onPeriodChange: (period: number) => void;
  hasHistory: boolean; // Controls if 90 days option shows
  
  // Category
  selectedCategoryId: string | null;
  selectedCategoryName: string;
  sellerCategories: SellerCategory[];
  fallbackCategories: { id: string; name: string }[];
  onCategoryChange: (categoryId: string | null, categoryName: string) => void;
  categoriesLoading: boolean;
  
  // Eligibility
  eligibilityStatus: 'eligible' | 'low_base' | 'inactive' | 'unknown';
  
  // Actions
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function TrendsFiltersBar({
  accounts,
  selectedAccountId,
  onAccountChange,
  selectedPeriod,
  onPeriodChange,
  hasHistory,
  selectedCategoryId,
  selectedCategoryName,
  sellerCategories,
  fallbackCategories,
  onCategoryChange,
  categoriesLoading,
  eligibilityStatus,
  onRefresh,
  isRefreshing,
}: TrendsFiltersBarProps) {
  const [showAllCategories, setShowAllCategories] = useState(false);
  
  // Period options - 90 only when has history
  const periodOptions = hasHistory
    ? [
        { value: 7, label: '7 dias' },
        { value: 30, label: '30 dias' },
        { value: 90, label: '90 dias' },
      ]
    : [
        { value: 7, label: '7 dias' },
        { value: 30, label: '30 dias' },
      ];
  
  // Eligibility badge config
  const eligibilityConfig: Record<string, { label: string; className: string }> = {
    eligible: { 
      label: 'Elegível', 
      className: 'bg-green-500/10 text-green-600 border-green-500/30' 
    },
    low_base: { 
      label: 'Base baixa', 
      className: 'bg-amber-500/10 text-amber-600 border-amber-500/30' 
    },
    inactive: { 
      label: 'Sem vendas', 
      className: 'bg-muted text-muted-foreground border-border' 
    },
    unknown: { 
      label: '', 
      className: '' 
    },
  };
  
  const eligibility = eligibilityConfig[eligibilityStatus];
  
  // Separate pinned from active categories
  const pinnedCategories = sellerCategories.filter(c => c.is_pinned_auto);
  const activeCategories = sellerCategories.filter(c => !c.is_pinned_auto);
  
  const formatGmv = (value: number) => {
    if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}K`;
    return `R$ ${value.toFixed(0)}`;
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Account Selector */}
      {accounts.length > 0 && (
        <Select 
          value={selectedAccountId || 'none'} 
          onValueChange={(v) => onAccountChange(v === 'none' ? null : v)}
        >
          <SelectTrigger className="w-[180px]">
            <User className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Conta" />
          </SelectTrigger>
          <SelectContent 
            className="z-50 bg-popover"
            position="popper"
            sideOffset={4}
          >
            {accounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.ml_user_id}>
                {acc.nickname || acc.ml_user_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      
      {/* Period Selector */}
      <Select 
        value={String(selectedPeriod)} 
        onValueChange={(v) => onPeriodChange(Number(v))}
      >
        <SelectTrigger className="w-[140px]">
          <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent 
          className="z-50 bg-popover"
          position="popper"
          sideOffset={4}
        >
          {periodOptions.map((opt) => (
            <SelectItem key={opt.value} value={String(opt.value)}>
              Últimos {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {/* Category Selector */}
      <Select
        value={selectedCategoryId || ''}
        onValueChange={(value) => {
          // Find category name from seller or fallback
          const sellerCat = sellerCategories.find(c => c.category_id === value);
          const fallbackCat = fallbackCategories.find(c => c.id === value);
          const name = sellerCat?.category_name || fallbackCat?.name || 'Categoria';
          onCategoryChange(value || null, name);
        }}
      >
        <SelectTrigger className="w-[280px]">
          <FolderTree className="h-4 w-4 mr-2 text-muted-foreground" />
          <span className="truncate flex-1 text-left">
            {selectedCategoryName || 'Selecionar categoria'}
          </span>
          {selectedCategoryId && eligibility.label && (
            <Badge 
              variant="outline" 
              className={cn("ml-2 text-[10px] px-1.5 py-0", eligibility.className)}
            >
              {eligibility.label}
            </Badge>
          )}
        </SelectTrigger>
        <SelectContent 
          className="z-50 bg-popover w-[340px] max-h-[400px]"
          position="popper"
          sideOffset={4}
        >
          {categoriesLoading ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              Carregando categorias...
            </div>
          ) : (
            <>
              {/* Pinned Categories */}
              {pinnedCategories.length > 0 && (
                <div className="p-2">
                  <div className="flex items-center gap-2 px-2 mb-1">
                    <Star className="h-3 w-3 text-amber-500" />
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">
                      Fixadas
                    </span>
                  </div>
                  {pinnedCategories.map((cat) => (
                    <SelectItem 
                      key={cat.category_id} 
                      value={cat.category_id}
                      className="py-2"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{cat.category_name}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-2">
                          <Package className="h-3 w-3" />
                          {cat.orders_count_90d} pedidos
                          <DollarSign className="h-3 w-3 ml-1" />
                          {formatGmv(cat.gmv_90d)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </div>
              )}
              
              {/* Active Categories */}
              {activeCategories.length > 0 && (
                <div className="p-2 border-t">
                  <div className="flex items-center gap-2 px-2 mb-1">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">
                      Ativas
                    </span>
                  </div>
                  {activeCategories.slice(0, 8).map((cat) => (
                    <SelectItem 
                      key={cat.category_id} 
                      value={cat.category_id}
                      className="py-2"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{cat.category_name}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-2">
                          <Package className="h-3 w-3" />
                          {cat.orders_count_90d} pedidos
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </div>
              )}
              
              {/* Fallback Categories (expandable) */}
              {fallbackCategories.length > 0 && (
                <div className="p-2 border-t">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAllCategories(!showAllCategories);
                    }}
                    className="w-full flex items-center justify-between px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <span>Todas as categorias</span>
                    <ChevronDown className={cn(
                      "h-3 w-3 transition-transform",
                      showAllCategories && "rotate-180"
                    )} />
                  </button>
                  {showAllCategories && (
                    <div className="mt-1">
                      {fallbackCategories.map((cat) => (
                        <SelectItem 
                          key={cat.id} 
                          value={cat.id}
                          className="py-1.5"
                        >
                          {cat.name}
                        </SelectItem>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {/* Empty state */}
              {sellerCategories.length === 0 && fallbackCategories.length === 0 && (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Nenhuma categoria disponível
                </div>
              )}
            </>
          )}
        </SelectContent>
      </Select>
      
      {/* Refresh Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="gap-2 ml-auto"
      >
        <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
        <span className="hidden sm:inline">Atualizar</span>
      </Button>
    </div>
  );
}
