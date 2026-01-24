import { createContext, useContext, useReducer, useCallback, ReactNode, useRef, useMemo, useEffect } from 'react';
import { MercadoCategoryItem, MercadoCategoryDetails, MercadoCategoryMetrics, MercadoDrawerType } from '@/types/mercado';
import { createMercadoAdapter, MercadoDataAdapter } from '@/adapters/mercado-data-adapter';
import { useMercadoCache } from '@/hooks/useMercadoCache';
import { useMercadoTelemetry } from '@/hooks/useMercadoTelemetry';
import { useMercadoGridCache } from '@/hooks/useMercadoGridCache';
import { useMercadoChildrenCache } from '@/hooks/useMercadoChildrenCache';

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
  isBackgroundRefresh: boolean;
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
  isBackgroundRefresh: false,
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
  | { type: 'SET_BACKGROUND_REFRESH'; payload: boolean }
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
    case 'SET_BACKGROUND_REFRESH':
      return { ...state, isBackgroundRefresh: action.payload };
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
  loadCategories: (forceRefresh?: boolean) => Promise<void>;
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
  const gridCache = useMercadoGridCache();
  const childrenCache = useMercadoChildrenCache();
  const telemetry = useMercadoTelemetry();
  
  // Memoize adapter to prevent recreation
  const adapter = useMemo(() => createMercadoAdapter(), []);
  
  // Track inflight requests to avoid duplicates
  const inflightCategoriesRef = useRef<Map<string, Promise<MercadoCategoryItem[]>>>(new Map());
  
  // Track if initial warming has been done
  const hasWarmedRef = useRef(false);
  
  // Use ref for current parent to avoid recreating callbacks
  const currentParentIdRef = useRef(state.currentParentId);
  currentParentIdRef.current = state.currentParentId;
  
  // Use ref for categories to avoid recreating callbacks
  const categoriesRef = useRef(state.categories);
  categoriesRef.current = state.categories;

  // Background warming for top categories - define first to be used in loadCategories
  const warmTopCategoriesRef = useRef<(categories: MercadoCategoryItem[]) => void>(() => {});
  warmTopCategoriesRef.current = useCallback((categories: MercadoCategoryItem[]) => {
    if (!categories.length) return;
    
    // Get top 10 by share_percent that have children
    const topCategories = [...categories]
      .filter(c => c.has_children)
      .sort((a, b) => b.share_percent - a.share_percent)
      .slice(0, 10)
      .map(c => c.id);
    
    if (topCategories.length > 0) {
      childrenCache.warmChildren(topCategories, (parentId) => adapter.listCategories(parentId));
    }
  }, [adapter, childrenCache]);

  // Helper to handle categories loaded - use ref to avoid recreation
  const handleCategoriesLoadedRef = useRef<(parentId: string | null, categories: MercadoCategoryItem[], hadExpiredCache: boolean) => void>(() => {});
  handleCategoriesLoadedRef.current = useCallback((parentId: string | null, categories: MercadoCategoryItem[], hadExpiredCache: boolean) => {
    // If empty and not root, mark as having no children
    if (categories.length === 0 && parentId) {
      childrenCache.markNoChildren(parentId);
    } else {
      // Save to both caches
      childrenCache.setChildren(parentId, categories);
    }
    
    // Update grid cache maintaining order if we had expired cache
    if (hadExpiredCache) {
      const orderedCategories = gridCache.updateCacheValues(parentId, categories);
      dispatch({ type: 'SET_CATEGORIES', payload: orderedCategories });
    } else {
      gridCache.setCache(parentId, categories);
      dispatch({ type: 'SET_CATEGORIES', payload: categories });
    }
    
    // Trigger background warming
    warmTopCategoriesRef.current(categories);
  }, [gridCache, childrenCache]);

  const loadCategories = useCallback(async (forceRefresh = false) => {
    const parentId = currentParentIdRef.current;
    const cacheKey = parentId ?? '__root__';
    
    // Check children cache first (30-day TTL)
    if (!forceRefresh) {
      const cachedChildren = childrenCache.getChildren(parentId);
      if (cachedChildren && cachedChildren.children.length > 0) {
        telemetry.log({
          event_type: 'cache_hit',
          category_id: cacheKey,
          data_type: 'grid',
          duration_ms: 0,
          timestamp: new Date().toISOString(),
          cache_source: 'children',
        });
        dispatch({ type: 'SET_CATEGORIES', payload: cachedChildren.children });
        
        // Trigger background warming for visible categories (via ref to avoid dep)
        warmTopCategoriesRef.current(cachedChildren.children);
        return;
      }
      
      // Check if verified to have no children
      if (parentId && childrenCache.hasNoChildren(parentId)) {
        dispatch({ type: 'SET_CATEGORIES', payload: [] });
        return;
      }
    }
    
    // Check for valid grid cache (45min TTL) - render immediately
    if (!forceRefresh) {
      const cachedData = gridCache.getCached(parentId);
      if (cachedData) {
        telemetry.log({
          event_type: 'cache_hit',
          category_id: cacheKey,
          data_type: 'grid',
          duration_ms: 0,
          timestamp: new Date().toISOString(),
          cache_source: 'memory',
        });
        dispatch({ type: 'SET_CATEGORIES', payload: cachedData.categories });
        
        // Also save to children cache for longer TTL
        childrenCache.setChildren(parentId, cachedData.categories);
        
        // Trigger background warming
        warmTopCategoriesRef.current(cachedData.categories);
        return;
      }
    }
    
    // Check for expired cache - show stale data while refreshing
    const expiredCache = gridCache.hasExpiredCache(parentId);
    if (expiredCache) {
      dispatch({ type: 'SET_CATEGORIES', payload: expiredCache.categories });
      dispatch({ type: 'SET_BACKGROUND_REFRESH', payload: true });
    } else {
      dispatch({ type: 'SET_LOADING_CATEGORIES', payload: true });
    }

    // Check if there's already a request in flight
    const existingRequest = inflightCategoriesRef.current.get(cacheKey);
    if (existingRequest) {
      try {
        const categories = await existingRequest;
        handleCategoriesLoadedRef.current(parentId, categories, !!expiredCache);
      } finally {
        dispatch({ type: 'SET_LOADING_CATEGORIES', payload: false });
        dispatch({ type: 'SET_BACKGROUND_REFRESH', payload: false });
      }
      return;
    }
    
    // Create new request
    const fetchPromise = adapter.listCategories(parentId);
    inflightCategoriesRef.current.set(cacheKey, fetchPromise);
    
    try {
      const categories = await fetchPromise;
      handleCategoriesLoadedRef.current(parentId, categories, !!expiredCache);
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao carregar categorias' });
    } finally {
      inflightCategoriesRef.current.delete(cacheKey);
      dispatch({ type: 'SET_LOADING_CATEGORIES', payload: false });
      dispatch({ type: 'SET_BACKGROUND_REFRESH', payload: false });
    }
  }, [adapter, gridCache, childrenCache, telemetry]);

  // Initial warming on mount
  useEffect(() => {
    if (!hasWarmedRef.current && state.categories.length > 0) {
      hasWarmedRef.current = true;
      warmTopCategoriesRef.current(state.categories);
    }
  }, [state.categories]);

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
    const category = categoriesRef.current.find(c => c.id === categoryId);
    if (!category) return;

    const newFavorite = !category.is_favorite;
    dispatch({ type: 'UPDATE_FAVORITE', payload: { id: categoryId, isFavorite: newFavorite } });
    
    try {
      await adapter.toggleFavorite(categoryId, newFavorite);
    } catch (error) {
      dispatch({ type: 'UPDATE_FAVORITE', payload: { id: categoryId, isFavorite: !newFavorite } });
    }
  }, [adapter]);

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

  // Memoize context value to prevent unnecessary re-renders
  const value: MercadoContextValue = useMemo(() => ({
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
  }), [
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
    telemetry.getStats,
  ]);

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
