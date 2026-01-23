import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  ArrowLeft, 
  TrendingUp, 
  FolderTree, 
  ChevronDown, 
  ChevronUp,
  Clock,
  RefreshCw,
  User
} from 'lucide-react';
import { useState } from 'react';
import { useTrends } from '@/contexts/TrendsContext';
import { SubcategoryNavigator } from './SubcategoryNavigator';
import { useCategoryBreadcrumb } from '@/hooks/useSubcategories';

// ============================================================
// TIPOS
// ============================================================

interface MlAccount {
  id: string;
  ml_user_id: string;
  nickname: string | null;
}

interface TrendsHeaderBarProps {
  accounts: MlAccount[];
  onBack: () => void;
  onReload: () => void;
  isReloading: boolean;
  categoriesForNavigator: { id: string; name: string }[];
}

// ============================================================
// ELIGIBILITY BADGE
// ============================================================

function EligibilityBadge({ reason }: { reason: string }) {
  const config: Record<string, { label: string; className: string }> = {
    OK: { 
      label: 'Elegível', 
      className: 'bg-green-500/10 text-green-600 border-green-500/30' 
    },
    INSUFFICIENT_CATEGORY_SALES: { 
      label: 'Pouca base', 
      className: 'bg-amber-500/10 text-amber-600 border-amber-500/30' 
    },
    NO_HISTORY: { 
      label: 'Sem vendas', 
      className: 'bg-muted text-muted-foreground border-border' 
    },
    NO_ACCOUNT: { 
      label: '', 
      className: '' 
    },
    NO_CATEGORY: { 
      label: '', 
      className: '' 
    },
  };
  
  const { label, className } = config[reason] || config.NO_CATEGORY;
  
  if (!label) return null;
  
  return (
    <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium border ${className}`}>
      {label}
    </span>
  );
}

// ============================================================
// COMPONENT
// ============================================================

export function TrendsHeaderBar({
  accounts,
  onBack,
  onReload,
  isReloading,
  categoriesForNavigator,
}: TrendsHeaderBarProps) {
  const { 
    state, 
    setAccount, 
    setCategory, 
    setSubcategory,
    setPeriod, 
    effectiveCategoryId,
    hasCategory,
  } = useTrends();
  
  const [showNavigator, setShowNavigator] = useState(false);
  const { data: breadcrumb } = useCategoryBreadcrumb(effectiveCategoryId);
  
  const handleCategorySelect = (id: string, name: string) => {
    if (state.selectedCategoryId && id !== state.selectedCategoryId) {
      // Selecting a subcategory
      setSubcategory(id);
    } else {
      // Selecting main category
      setCategory(id || null, name);
    }
    setShowNavigator(false);
  };
  
  const handleBreadcrumbClick = (id: string) => {
    const item = breadcrumb?.find(b => b.id === id);
    if (item) {
      setCategory(id, item.name);
    }
  };
  
  return (
    <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-20">
      {/* Title Row */}
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <TrendingUp className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-semibold">Tendências de Mercado</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Análise baseada em dados públicos do Mercado Livre
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls Row */}
      <div className="border-t bg-muted/30">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            
            {/* Account Selector */}
            <Select 
              value={state.selectedAccountId || 'none'} 
              onValueChange={(v) => setAccount(v === 'none' ? null : v)}
            >
              <SelectTrigger className="w-[180px]">
                <User className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Selecionar conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.length === 0 ? (
                  <SelectItem value="none" disabled>Nenhuma conta</SelectItem>
                ) : (
                  accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.ml_user_id}>
                      {acc.nickname || acc.ml_user_id}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {/* Period Selector */}
            <Select 
              value={String(state.selectedPeriod)} 
              onValueChange={(v) => setPeriod(Number(v))}
            >
              <SelectTrigger className="w-[150px]">
                <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>

            {/* Category Selector with Eligibility Badge */}
            <Collapsible open={showNavigator} onOpenChange={setShowNavigator}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-[280px] justify-between">
                  <div className="flex items-center gap-2">
                    <FolderTree className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{state.categoryName}</span>
                    {hasCategory && (
                      <EligibilityBadge reason={state.capabilities.reason} />
                    )}
                  </div>
                  {showNavigator ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="absolute z-50 mt-2 w-[320px]">
                <SubcategoryNavigator
                  categories={categoriesForNavigator}
                  selectedId={effectiveCategoryId}
                  onSelect={handleCategorySelect}
                  breadcrumb={breadcrumb}
                  onBreadcrumbClick={handleBreadcrumbClick}
                />
              </CollapsibleContent>
            </Collapsible>

            {/* Reload Button - Single action, no loop */}
            <Button 
              variant="outline" 
              size="sm"
              onClick={onReload}
              disabled={isReloading}
              className="ml-auto"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isReloading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
