import { createContext, useContext, useReducer, useCallback, ReactNode, useMemo } from 'react';

// ============================================================
// TIPOS DO ESTADO GLOBAL ÚNICO
// ============================================================

export type CapabilityReason = 'OK' | 'INSUFFICIENT_CATEGORY_SALES' | 'NO_HISTORY' | 'NO_ACCOUNT' | 'NO_CATEGORY';

export type SectionErrorType = 'TEMP_UNAVAILABLE' | 'RATE_LIMIT' | 'FORBIDDEN' | null;

export interface TrendsCapabilities {
  canUseSellerInsights: boolean;
  reason: CapabilityReason;
}

export interface TrendsMarketData {
  marketTrends: MarketTrendItem[];
  keywords: KeywordItem[];
  bestSellers: BestSellerItem[];
  marketSubcategories: SubcategoryItem[];
}

export interface TrendsSellerData {
  sellerSubcategories: SubcategoryItem[] | null;
  sellerGoals: SellerGoalsData | null;
}

export interface TrendsUIState {
  loadingFlags: Record<SectionKey, boolean>;
  emptyFlags: Record<SectionKey, boolean>;
  errors: Record<SectionKey, SectionErrorType>;
  lastUpdatedAt: string | null;
  requestNonce: number;
}

export type SectionKey = 
  | 'status'
  | 'kpis'
  | 'marketTrends'
  | 'keywords'
  | 'bestSellers'
  | 'marketSubcategories'
  | 'sellerSubcategories'
  | 'sellerGoals'
  | 'recommendations';

// Data Types
export interface MarketTrendItem {
  keyword: string;
  url?: string;
}

export interface KeywordItem {
  keyword: string;
  funnel?: 'topo' | 'meio' | 'fundo';
  trend?: 'up' | 'down' | 'stable';
  url?: string;
}

export interface BestSellerItem {
  item_id: string;
  rank: number;
  title: string | null;
  thumbnail: string | null;
  price: number | null;
  sold_quantity: number | null;
  permalink: string | null;
  estimated_revenue?: number | null;
}

export interface SubcategoryItem {
  id: string;
  name: string;
  variation?: number;
  itemsCount?: number;
  trend?: 'up' | 'down' | 'stable';
}

export interface SellerGoalsData {
  ordersCount: number;
  revenue: number;
  unitsSold: number;
  averageTicket: number;
}

// ============================================================
// ESTADO GLOBAL COMPLETO
// ============================================================

export interface TrendsState {
  // Seleções
  selectedAccountId: string | null;
  selectedCategoryId: string | null;
  selectedSubcategoryId: string | null;
  selectedPeriod: number;
  categoryName: string;
  
  // Capabilities (decidido pelo controller)
  capabilities: TrendsCapabilities;
  
  // Data
  data: TrendsMarketData & TrendsSellerData;
  
  // UI
  ui: TrendsUIState;
}

// ============================================================
// AÇÕES DO REDUCER
// ============================================================

type TrendsAction =
  | { type: 'SET_ACCOUNT'; accountId: string | null }
  | { type: 'SET_CATEGORY'; categoryId: string | null; categoryName: string }
  | { type: 'SET_SUBCATEGORY'; subcategoryId: string | null }
  | { type: 'SET_PERIOD'; period: number }
  | { type: 'SET_CAPABILITIES'; capabilities: TrendsCapabilities }
  | { type: 'SET_MARKET_DATA'; data: Partial<TrendsMarketData> }
  | { type: 'SET_SELLER_DATA'; data: Partial<TrendsSellerData> }
  | { type: 'SET_LOADING'; section: SectionKey; loading: boolean }
  | { type: 'SET_EMPTY'; section: SectionKey; empty: boolean }
  | { type: 'SET_ERROR'; section: SectionKey; error: SectionErrorType }
  | { type: 'SET_LAST_UPDATED'; timestamp: string }
  | { type: 'INCREMENT_NONCE' }
  | { type: 'RESET_UI_ERRORS' }
  | { type: 'CLEAR_SELLER_DATA' }
  | { type: 'RESET_FOR_ACCOUNT'; accountId: string | null };

// ============================================================
// ESTADO INICIAL
// ============================================================

const initialUIState: TrendsUIState = {
  loadingFlags: {
    status: false,
    kpis: false,
    marketTrends: false,
    keywords: false,
    bestSellers: false,
    marketSubcategories: false,
    sellerSubcategories: false,
    sellerGoals: false,
    recommendations: false,
  },
  emptyFlags: {
    status: false,
    kpis: false,
    marketTrends: false,
    keywords: false,
    bestSellers: false,
    marketSubcategories: false,
    sellerSubcategories: false,
    sellerGoals: false,
    recommendations: false,
  },
  errors: {
    status: null,
    kpis: null,
    marketTrends: null,
    keywords: null,
    bestSellers: null,
    marketSubcategories: null,
    sellerSubcategories: null,
    sellerGoals: null,
    recommendations: null,
  },
  lastUpdatedAt: null,
  requestNonce: 0,
};

const initialState: TrendsState = {
  selectedAccountId: null,
  selectedCategoryId: null,
  selectedSubcategoryId: null,
  selectedPeriod: 30,
  categoryName: 'Selecionar Categoria',
  
  capabilities: {
    canUseSellerInsights: false,
    reason: 'NO_ACCOUNT',
  },
  
  data: {
    marketTrends: [],
    keywords: [],
    bestSellers: [],
    marketSubcategories: [],
    sellerSubcategories: null,
    sellerGoals: null,
  },
  
  ui: initialUIState,
};

// ============================================================
// REDUCER
// ============================================================

function trendsReducer(state: TrendsState, action: TrendsAction): TrendsState {
  switch (action.type) {
    case 'SET_ACCOUNT':
      return {
        ...state,
        selectedAccountId: action.accountId,
        capabilities: action.accountId
          ? state.capabilities
          : { canUseSellerInsights: false, reason: 'NO_ACCOUNT' },
      };
      
    case 'SET_CATEGORY':
      console.log('[TrendsContext] SET_CATEGORY:', { categoryId: action.categoryId, categoryName: action.categoryName });
      return {
        ...state,
        selectedCategoryId: action.categoryId,
        selectedSubcategoryId: null,
        categoryName: action.categoryName,
        // Reset capabilities para reavaliação
        capabilities: {
          canUseSellerInsights: false,
          reason: action.categoryId ? 'NO_CATEGORY' : state.capabilities.reason,
        },
        // Limpar TODOS os dados ao trocar categoria (market + seller)
        data: {
          marketTrends: [],
          keywords: [],
          bestSellers: [],
          marketSubcategories: [],
          sellerSubcategories: null,
          sellerGoals: null,
        },
        // Reset UI flags
        ui: {
          ...state.ui,
          emptyFlags: initialUIState.emptyFlags,
          errors: initialUIState.errors,
        },
      };
      
    case 'SET_SUBCATEGORY':
      return {
        ...state,
        selectedSubcategoryId: action.subcategoryId,
      };
      
    case 'SET_PERIOD':
      return {
        ...state,
        selectedPeriod: action.period,
        // Clear seller data to force recalculation with new period
        data: {
          ...state.data,
          sellerSubcategories: null,
          sellerGoals: null,
        },
        // Reset capabilities to re-evaluate with new period
        capabilities: {
          canUseSellerInsights: false,
          reason: state.selectedCategoryId ? 'NO_CATEGORY' : state.capabilities.reason,
        },
      };
      
    case 'SET_CAPABILITIES':
      return {
        ...state,
        capabilities: action.capabilities,
        // Clear seller data if not allowed
        data: action.capabilities.canUseSellerInsights
          ? state.data
          : {
              ...state.data,
              sellerSubcategories: null,
              sellerGoals: null,
            },
      };
      
    case 'SET_MARKET_DATA':
      return {
        ...state,
        data: {
          ...state.data,
          ...action.data,
        },
      };
      
    case 'SET_SELLER_DATA':
      // REGRA: Só aceita dados seller se permitido
      if (!state.capabilities.canUseSellerInsights) {
        console.warn('[TrendsContext] Attempted to set seller data without permission');
        return state;
      }
      return {
        ...state,
        data: {
          ...state.data,
          ...action.data,
        },
      };
      
    case 'SET_LOADING':
      return {
        ...state,
        ui: {
          ...state.ui,
          loadingFlags: {
            ...state.ui.loadingFlags,
            [action.section]: action.loading,
          },
        },
      };
      
    case 'SET_EMPTY':
      return {
        ...state,
        ui: {
          ...state.ui,
          emptyFlags: {
            ...state.ui.emptyFlags,
            [action.section]: action.empty,
          },
        },
      };
      
    case 'SET_ERROR':
      return {
        ...state,
        ui: {
          ...state.ui,
          errors: {
            ...state.ui.errors,
            [action.section]: action.error,
          },
        },
      };
      
    case 'SET_LAST_UPDATED':
      return {
        ...state,
        ui: {
          ...state.ui,
          lastUpdatedAt: action.timestamp,
        },
      };
      
    case 'INCREMENT_NONCE':
      return {
        ...state,
        ui: {
          ...state.ui,
          requestNonce: state.ui.requestNonce + 1,
        },
      };
      
    case 'RESET_UI_ERRORS':
      return {
        ...state,
        ui: {
          ...state.ui,
          errors: initialUIState.errors,
        },
      };
      
    case 'CLEAR_SELLER_DATA':
      return {
        ...state,
        data: {
          ...state.data,
          sellerSubcategories: null,
          sellerGoals: null,
        },
      };
    
    case 'RESET_FOR_ACCOUNT':
      return {
        ...initialState,
        selectedAccountId: action.accountId,
        selectedPeriod: state.selectedPeriod, // Preserve period preference
      };
      
    default:
      return state;
  }
}

// ============================================================
// CONTEXT
// ============================================================

interface TrendsContextValue {
  state: TrendsState;
  dispatch: React.Dispatch<TrendsAction>;
  
  // Convenience actions
  setAccount: (accountId: string | null) => void;
  setCategory: (categoryId: string | null, categoryName: string) => void;
  setSubcategory: (subcategoryId: string | null) => void;
  setPeriod: (period: number) => void;
  setCapabilities: (capabilities: TrendsCapabilities) => void;
  setMarketData: (data: Partial<TrendsMarketData>) => void;
  setSellerData: (data: Partial<TrendsSellerData>) => void;
  setSectionLoading: (section: SectionKey, loading: boolean) => void;
  setSectionEmpty: (section: SectionKey, empty: boolean) => void;
  setSectionError: (section: SectionKey, error: SectionErrorType) => void;
  markUpdated: () => void;
  triggerRefresh: () => void;
  clearSellerData: () => void;
  resetForAccount: (accountId: string | null) => void;
  
  // Computed values
  effectiveCategoryId: string | null;
  hasSeller: boolean;
  hasCategory: boolean;
}

const TrendsContext = createContext<TrendsContextValue | null>(null);

// ============================================================
// PROVIDER
// ============================================================

export function TrendsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(trendsReducer, initialState);
  
  // Actions
  const setAccount = useCallback((accountId: string | null) => {
    dispatch({ type: 'SET_ACCOUNT', accountId });
  }, []);
  
  const setCategory = useCallback((categoryId: string | null, categoryName: string) => {
    dispatch({ type: 'SET_CATEGORY', categoryId, categoryName });
  }, []);
  
  const setSubcategory = useCallback((subcategoryId: string | null) => {
    dispatch({ type: 'SET_SUBCATEGORY', subcategoryId });
  }, []);
  
  const setPeriod = useCallback((period: number) => {
    dispatch({ type: 'SET_PERIOD', period });
  }, []);
  
  const setCapabilities = useCallback((capabilities: TrendsCapabilities) => {
    dispatch({ type: 'SET_CAPABILITIES', capabilities });
  }, []);
  
  const setMarketData = useCallback((data: Partial<TrendsMarketData>) => {
    dispatch({ type: 'SET_MARKET_DATA', data });
  }, []);
  
  const setSellerData = useCallback((data: Partial<TrendsSellerData>) => {
    dispatch({ type: 'SET_SELLER_DATA', data });
  }, []);
  
  const setSectionLoading = useCallback((section: SectionKey, loading: boolean) => {
    dispatch({ type: 'SET_LOADING', section, loading });
  }, []);
  
  const setSectionEmpty = useCallback((section: SectionKey, empty: boolean) => {
    dispatch({ type: 'SET_EMPTY', section, empty });
  }, []);
  
  const setSectionError = useCallback((section: SectionKey, error: SectionErrorType) => {
    dispatch({ type: 'SET_ERROR', section, error });
  }, []);
  
  const markUpdated = useCallback(() => {
    dispatch({ type: 'SET_LAST_UPDATED', timestamp: new Date().toISOString() });
  }, []);
  
  const triggerRefresh = useCallback(() => {
    dispatch({ type: 'INCREMENT_NONCE' });
    dispatch({ type: 'RESET_UI_ERRORS' });
  }, []);
  
  const clearSellerData = useCallback(() => {
    dispatch({ type: 'CLEAR_SELLER_DATA' });
  }, []);
  
  const resetForAccount = useCallback((accountId: string | null) => {
    dispatch({ type: 'RESET_FOR_ACCOUNT', accountId });
  }, []);
  
  // Computed values
  const effectiveCategoryId = state.selectedSubcategoryId || state.selectedCategoryId;
  const hasSeller = !!state.selectedAccountId;
  const hasCategory = !!state.selectedCategoryId;
  
  const value = useMemo<TrendsContextValue>(() => ({
    state,
    dispatch,
    setAccount,
    setCategory,
    setSubcategory,
    setPeriod,
    setCapabilities,
    setMarketData,
    setSellerData,
    setSectionLoading,
    setSectionEmpty,
    setSectionError,
    markUpdated,
    triggerRefresh,
    clearSellerData,
    resetForAccount,
    effectiveCategoryId,
    hasSeller,
    hasCategory,
  }), [
    state,
    setAccount,
    setCategory,
    setSubcategory,
    setPeriod,
    setCapabilities,
    setMarketData,
    setSellerData,
    setSectionLoading,
    setSectionEmpty,
    setSectionError,
    markUpdated,
    triggerRefresh,
    clearSellerData,
    resetForAccount,
    effectiveCategoryId,
    hasSeller,
    hasCategory,
  ]);
  
  return (
    <TrendsContext.Provider value={value}>
      {children}
    </TrendsContext.Provider>
  );
}

// ============================================================
// HOOK
// ============================================================

export function useTrends() {
  const context = useContext(TrendsContext);
  if (!context) {
    throw new Error('useTrends must be used within TrendsProvider');
  }
  return context;
}
