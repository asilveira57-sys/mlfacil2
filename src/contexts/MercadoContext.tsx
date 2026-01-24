import { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import { MercadoCategoryItem, MercadoCategoryDetails, MercadoCategoryMetrics, MercadoDrawerType } from '@/types/mercado';
import { createMercadoAdapter, MercadoDataAdapter } from '@/adapters/mercado-data-adapter';
import { useMercadoCache } from '@/hooks/useMercadoCache';
import { useMercadoTelemetry } from '@/hooks/useMercadoTelemetry';

// State
interface MercadoState {
  // Navigation
  currentParentId: string | null;
  breadcrumb: { id: string | null; name: string }[];
  
  // Data
  categories: MercadoCategoryItem[];
  selectedCategoryId: string | null;
  currentDetails: MercadoCategoryDetails | null;
  currentMetrics: MercadoCategoryMetrics | null;
  
  // UI State
  isLoadingCategories: boolean;
  isLoadingDetails: boolean;
  isLoadingMetrics: boolean;
  drawerType: MercadoDrawerType;
  searchQuery: string;
  sortBy: 'share' | 'name' | 'total' | 'delta';
  sortOrder: 'asc' | 'desc';
  
  // Comparison
  comparisonIds: string[];
  isCompareMode: boolean;
  
  // Errors
  error: string | null;
}

const initialState: MercadoState = {
  currentParentId: null,
  breadcrumb: [{ id: null, name: 'Mercado' }],
  categories: [],
  selectedCategoryId: null,
  currentDetails: null,
  currentMetrics: null,
  isLoadingCategories: false,
  isLoadingDetails: false,
  isLoadingMetrics: false,
  drawerType: null,
  searchQuery: '',
  sortBy: 'share',
  sortOrder: 'desc',
  comparisonIds: [],
  isCompareMode: false,
  error: null,
};

// Actions
type Action =
  | { type: 'SET_LOADING_CATEGORIES'; payload: boolean }
  | { type: 'SET_LOADING_DETAILS'; payload: boolean }
  | { type: 'SET_LOADING_METRICS'; payload: boolean }
  | { type: 'SET_CATEGORIES'; payload: MercadoCategoryItem[] }
  | { type: 'SET_DETAILS'; payload: MercadoCategoryDetails | null }
  | { type: 'SET_METRICS'; payload: MercadoCategoryMetrics | null }
  | { type: 'NAVIGATE_TO'; payload: { parentId: string | null; name: string } }
  | { type: 'SELECT_CATEGORY'; payload: string | null }
  | { type: 'OPEN_DRAWER'; payload: MercadoDrawerType }
  | { type: 'CLOSE_DRAWER' }
  | { type: 'SET_SEARCH'; payload: string }
  | { type: 'SET_SORT'; payload: { by: 'share' | 'name' | 'total' | 'delta'; order: 'asc' | 'desc' } }
  | { type: 'TOGGLE_COMPARE_MODE' }
  | { type: 'TOGGLE_COMPARISON'; payload: string }
  | { type: 'CLEAR_COMPARISON' }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'GO_BACK' }
  | { type: 'GO_TO_ROOT' }
  | { type: 'UPDATE_FAVORITE'; payload: { id: string; isFavorite: boolean } };

function reducer(state: MercadoState, action: Action): MercadoState {
  switch (action.type) {
    case 'SET_LOADING_CATEGORIES':
      return { ...state, isLoadingCategories: action.payload };
    case 'SET_LOADING_DETAILS':
      return { ...state, isLoadingDetails: action.payload };
    case 'SET_LOADING_METRICS':
      return { ...state, isLoadingMetrics: action.payload };
    case 'SET_CATEGORIES':
      return { ...state, categories: action.payload, error: null };
    case 'SET_DETAILS':
      return { ...state, currentDetails: action.payload };
    case 'SET_METRICS':
      return { ...state, currentMetrics: action.payload };
    case 'NAVIGATE_TO': {
      const newBreadcrumb = [...state.breadcrumb, { id: action.payload.parentId, name: action.payload.name }];
      return {
        ...state,
        currentParentId: action.payload.parentId,
        breadcrumb: newBreadcrumb,
        categories: [],
        comparisonIds: [],
      };
    }
    case 'SELECT_CATEGORY':
      return { ...state, selectedCategoryId: action.payload };
    case 'OPEN_DRAWER':
      return { ...state, drawerType: action.payload };
    case 'CLOSE_DRAWER':
      return { ...state, drawerType: null, currentDetails: null, currentMetrics: null };
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.payload };
    case 'SET_SORT':
      return { ...state, sortBy: action.payload.by, sortOrder: action.payload.order };
    case 'TOGGLE_COMPARE_MODE':
      return { ...state, isCompareMode: !state.isCompareMode, comparisonIds: [] };
    case 'TOGGLE_COMPARISON': {
      const ids = state.comparisonIds.includes(action.payload)
        ? state.comparisonIds.filter(id => id !== action.payload)
        : state.comparisonIds.length < 3
          ? [...state.comparisonIds, action.payload]
          : state.comparisonIds;
      return { ...state, comparisonIds: ids };
    }
    case 'CLEAR_COMPARISON':
      return { ...state, comparisonIds: [], isCompareMode: false };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'GO_BACK': {
      if (state.breadcrumb.length <= 1) return state;
      const newBreadcrumb = state.breadcrumb.slice(0, -1);
      const newParentId = newBreadcrumb[newBreadcrumb.length - 1]?.id ?? null;
      return {
        ...state,
        breadcrumb: newBreadcrumb,
        currentParentId: newParentId,
        categories: [],
      };
    }
    case 'GO_TO_ROOT':
      return {
        ...state,
        breadcrumb: [{ id: null, name: 'Mercado' }],
        currentParentId: null,
        categories: [],
      };
    case 'UPDATE_FAVORITE':
      return {
        ...state,
        categories: state.categories.map(cat =>
          cat.id === action.payload.id ? { ...cat, is_favorite: action.payload.isFavorite } : cat
        ),
      };
    default:
      return state;
  }
}

// Context
interface MercadoContextValue {
  state: MercadoState;
  adapter: MercadoDataAdapter;
  
  // Actions
  loadCategories: () => Promise<void>;
  navigateTo: (categoryId: string, categoryName: string) => Promise<void>;
  goBack: () => void;
  goToRoot: () => void;
  
  openDetails: (categoryId: string) => Promise<void>;
  openMetrics: (categoryId: string) => Promise<void>;
  closeDrawer: () => void;
  
  setSearch: (query: string) => void;
  setSort: (by: 'share' | 'name' | 'total' | 'delta', order: 'asc' | 'desc') => void;
  
  toggleFavorite: (categoryId: string) => Promise<void>;
  toggleCompareMode: () => void;
  toggleComparison: (categoryId: string) => void;
  clearComparison: () => void;
  
  // Prefetch helpers
  prefetchDetails: (categoryId: string) => Promise<void>;
  prefetchMetrics: (categoryId: string) => Promise<void>;
  
  // Telemetry
  getTelemetryStats: () => ReturnType<ReturnType<typeof useMercadoTelemetry>['getStats']>;
}

const MercadoContext = createContext<MercadoContextValue | null>(null);

// Provider
interface MercadoProviderProps {
  children: ReactNode;
}

export function MercadoProvider({ children }: MercadoProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const cache = useMercadoCache();
  const telemetry = useMercadoTelemetry();
  const adapter = createMercadoAdapter();

  const loadCategories = useCallback(async () => {
    dispatch({ type: 'SET_LOADING_CATEGORIES', payload: true });
    
    try {
      const categories = await adapter.listCategories(state.currentParentId);
      dispatch({ type: 'SET_CATEGORIES', payload: categories });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao carregar categorias' });
    } finally {
      dispatch({ type: 'SET_LOADING_CATEGORIES', payload: false });
    }
  }, [adapter, state.currentParentId]);

  const navigateTo = useCallback(async (categoryId: string, categoryName: string) => {
    dispatch({ type: 'NAVIGATE_TO', payload: { parentId: categoryId, name: categoryName } });
  }, []);

  const goBack = useCallback(() => {
    dispatch({ type: 'GO_BACK' });
  }, []);

  const goToRoot = useCallback(() => {
    dispatch({ type: 'GO_TO_ROOT' });
  }, []);

  const openDetails = useCallback(async (categoryId: string) => {
    telemetry.startTimer(`drawer_open_${categoryId}`);
    dispatch({ type: 'SELECT_CATEGORY', payload: categoryId });
    dispatch({ type: 'OPEN_DRAWER', payload: 'details' });
    
    const cached = cache.getFromMemory<MercadoCategoryDetails>('details', categoryId);
    if (cached) {
      dispatch({ type: 'SET_DETAILS', payload: cached });
      telemetry.endTimer(`drawer_open_${categoryId}`, 'cache_hit', categoryId, 'details', 'memory');
      return;
    }

    dispatch({ type: 'SET_LOADING_DETAILS', payload: true });
    telemetry.log({
      event_type: 'cache_miss',
      category_id: categoryId,
      data_type: 'details',
      duration_ms: 0,
      timestamp: new Date().toISOString(),
    });

    try {
      const details = await cache.getOrCreateRequest('details', categoryId, () => 
        adapter.getDetails(categoryId)
      );
      
      cache.setToMemory('details', categoryId, details);
      dispatch({ type: 'SET_DETAILS', payload: details });
      telemetry.endTimer(`drawer_open_${categoryId}`, 'drawer_open', categoryId, 'details', 'network');
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao carregar detalhes' });
    } finally {
      dispatch({ type: 'SET_LOADING_DETAILS', payload: false });
    }
  }, [adapter, cache, telemetry]);

  const openMetrics = useCallback(async (categoryId: string) => {
    telemetry.startTimer(`drawer_open_${categoryId}`);
    dispatch({ type: 'SELECT_CATEGORY', payload: categoryId });
    dispatch({ type: 'OPEN_DRAWER', payload: 'metrics' });
    
    const cached = cache.getFromMemory<MercadoCategoryMetrics>('metrics', categoryId);
    if (cached) {
      dispatch({ type: 'SET_METRICS', payload: cached });
      telemetry.endTimer(`drawer_open_${categoryId}`, 'cache_hit', categoryId, 'metrics', 'memory');
      return;
    }

    dispatch({ type: 'SET_LOADING_METRICS', payload: true });

    try {
      const metrics = await cache.getOrCreateRequest('metrics', categoryId, () => 
        adapter.getMetrics(categoryId)
      );
      
      cache.setToMemory('metrics', categoryId, metrics);
      dispatch({ type: 'SET_METRICS', payload: metrics });
      telemetry.endTimer(`drawer_open_${categoryId}`, 'drawer_open', categoryId, 'metrics', 'network');
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao carregar métricas' });
    } finally {
      dispatch({ type: 'SET_LOADING_METRICS', payload: false });
    }
  }, [adapter, cache, telemetry]);

  const closeDrawer = useCallback(() => {
    dispatch({ type: 'CLOSE_DRAWER' });
  }, []);

  const setSearch = useCallback((query: string) => {
    dispatch({ type: 'SET_SEARCH', payload: query });
  }, []);

  const setSort = useCallback((by: 'share' | 'name' | 'total' | 'delta', order: 'asc' | 'desc') => {
    dispatch({ type: 'SET_SORT', payload: { by, order } });
  }, []);

  const toggleFavorite = useCallback(async (categoryId: string) => {
    const category = state.categories.find(c => c.id === categoryId);
    if (!category) return;

    const newFavorite = !category.is_favorite;
    dispatch({ type: 'UPDATE_FAVORITE', payload: { id: categoryId, isFavorite: newFavorite } });
    
    try {
      await adapter.toggleFavorite(categoryId, newFavorite);
    } catch (error) {
      dispatch({ type: 'UPDATE_FAVORITE', payload: { id: categoryId, isFavorite: !newFavorite } });
    }
  }, [adapter, state.categories]);

  const toggleCompareMode = useCallback(() => {
    dispatch({ type: 'TOGGLE_COMPARE_MODE' });
  }, []);

  const toggleComparison = useCallback((categoryId: string) => {
    dispatch({ type: 'TOGGLE_COMPARISON', payload: categoryId });
  }, []);

  const clearComparison = useCallback(() => {
    dispatch({ type: 'CLEAR_COMPARISON' });
  }, []);

  const prefetchDetails = useCallback(async (categoryId: string) => {
    const cached = cache.getFromMemory<MercadoCategoryDetails>('details', categoryId);
    if (cached) return;

    try {
      const details = await cache.getOrCreateRequest('details', categoryId, () => 
        adapter.getDetails(categoryId)
      );
      cache.setToMemory('details', categoryId, details);
    } catch {
      // Silently fail prefetch
    }
  }, [adapter, cache]);

  const prefetchMetrics = useCallback(async (categoryId: string) => {
    const cached = cache.getFromMemory<MercadoCategoryMetrics>('metrics', categoryId);
    if (cached) return;

    try {
      const metrics = await cache.getOrCreateRequest('metrics', categoryId, () => 
        adapter.getMetrics(categoryId)
      );
      cache.setToMemory('metrics', categoryId, metrics);
    } catch {
      // Silently fail prefetch
    }
  }, [adapter, cache]);

  const value: MercadoContextValue = {
    state,
    adapter,
    loadCategories,
    navigateTo,
    goBack,
    goToRoot,
    openDetails,
    openMetrics,
    closeDrawer,
    setSearch,
    setSort,
    toggleFavorite,
    toggleCompareMode,
    toggleComparison,
    clearComparison,
    prefetchDetails,
    prefetchMetrics,
    getTelemetryStats: telemetry.getStats,
  };

  return (
    <MercadoContext.Provider value={value}>
      {children}
    </MercadoContext.Provider>
  );
}

// Hook
export function useMercado() {
  const context = useContext(MercadoContext);
  if (!context) {
    throw new Error('useMercado must be used within MercadoProvider');
  }
  return context;
}
