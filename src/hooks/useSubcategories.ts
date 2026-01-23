import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Subcategory {
  id: string;
  name: string;
  parent_id: string | null;
  depth: number;
  path: string[];
  children_count: number;
  total_items_qty?: number;
}

// Fetch subcategories from cache first, then ML API as fallback
export function useSubcategories(parentId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ['subcategories', parentId],
    queryFn: async (): Promise<Subcategory[]> => {
      if (!parentId) return [];

      // First try from cache
      const { data: cached, error: cacheError } = await supabase
        .from('category_tree_cache')
        .select('id, name, parent_id, depth, path, children_count, total_items_qty')
        .eq('parent_id', parentId)
        .order('name');

      if (!cacheError && cached && cached.length > 0) {
        return cached.map(c => ({
          id: c.id,
          name: c.name,
          parent_id: c.parent_id,
          depth: c.depth ?? 1,
          path: c.path ?? [c.id],
          children_count: c.children_count ?? 0,
          total_items_qty: c.total_items_qty ?? undefined,
        }));
      }

      // Fallback: fetch from ML API (public, no auth needed)
      try {
        const response = await fetch(`https://api.mercadolibre.com/categories/${parentId}`);
        if (!response.ok) throw new Error('Failed to fetch category');
        
        const data = await response.json();
        
        if (!data.children_categories || data.children_categories.length === 0) {
          return [];
        }

        // Calculate correct depth from path_from_root
        const pathFromRoot = data.path_from_root?.map((p: { id: string }) => p.id) || [parentId];
        const actualDepth = pathFromRoot.length;

        // Map children to subcategories
        const subcategories: Subcategory[] = data.children_categories.map((child: {
          id: string;
          name: string;
          total_items_in_this_category?: number;
        }) => ({
          id: child.id,
          name: child.name,
          parent_id: parentId,
          depth: actualDepth, // Use actual depth from path_from_root
          path: [...pathFromRoot, child.id],
          children_count: 1, // Assume has children (expand by attempt)
          total_items_qty: child.total_items_in_this_category,
        }));

        // Save to cache for future use
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.from('category_tree_cache').upsert(
            subcategories.map(sc => ({
              id: sc.id,
              name: sc.name,
              parent_id: sc.parent_id,
              depth: sc.depth,
              path: sc.path,
              children_count: sc.children_count,
              total_items_qty: sc.total_items_qty,
              fetched_at: new Date().toISOString(),
            })),
            { onConflict: 'id' }
          );
        }

        return subcategories;
      } catch (err) {
        console.error('[useSubcategories] ML API error:', err);
        return [];
      }
    },
    enabled: enabled && !!parentId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Get breadcrumb path for a category
export function useCategoryBreadcrumb(categoryId: string | null) {
  return useQuery({
    queryKey: ['category-breadcrumb', categoryId],
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      if (!categoryId) return [];

      try {
        const response = await fetch(`https://api.mercadolibre.com/categories/${categoryId}`);
        if (!response.ok) return [];
        
        const data = await response.json();
        
        if (data.path_from_root) {
          return data.path_from_root.map((p: { id: string; name: string }) => ({
            id: p.id,
            name: p.name,
          }));
        }
        
        return [{ id: categoryId, name: data.name || categoryId }];
      } catch {
        return [];
      }
    },
    enabled: !!categoryId,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}
