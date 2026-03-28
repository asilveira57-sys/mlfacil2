import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { fetchAllRows } from '@/lib/supabaseHelpers';

export interface FreightProduct {
  id: string;
  item_id: string;
  title: string | null;
  sku: string | null;
  thumbnail: string | null;
  price: number | null;
  status: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  width_cm: number | null;
  length_cm: number | null;
  dimensions_source: string | null;
  freight_profile: string | null;
  expected_freight_cost: number | null;
  logistic_type: string | null;
  shipping_mode: string | null;
  listing_type_id: string | null;
}

export interface UseFreightProductsFilters {
  search: string;
  dimensionStatus: string; // 'all' | 'no_data' | 'estimated' | 'complete'
  freightProfile: string;  // 'all' | 'A' | 'B' | 'C'
}

const SELECT_FIELDS = 'id,item_id,title,sku,thumbnail,price,status,weight_kg,height_cm,width_cm,length_cm,dimensions_source,freight_profile,expected_freight_cost,logistic_type,shipping_mode,listing_type_id';

export function useFreightProducts(filters: UseFreightProductsFilters) {
  const { sellerId } = useActiveAccount();

  return useQuery({
    queryKey: ['freight-products', sellerId, filters],
    queryFn: async (): Promise<FreightProduct[]> => {
      if (!sellerId) return [];

      let query = supabase
        .from('meli_listings_cache')
        .select(SELECT_FIELDS)
        .eq('seller_id', sellerId)
        .order('title', { ascending: true });

      // Dimension status filter
      if (filters.dimensionStatus === 'no_data') {
        query = query.or('dimensions_source.is.null,dimensions_source.eq.none');
      } else if (filters.dimensionStatus === 'estimated') {
        query = query.eq('dimensions_source', 'estimated');
      } else if (filters.dimensionStatus === 'complete') {
        query = query.not('dimensions_source', 'in', '("none","estimated")').not('dimensions_source', 'is', null);
      }

      // Freight profile filter
      if (filters.freightProfile !== 'all') {
        query = query.eq('freight_profile', filters.freightProfile);
      }

      // Search filter - applied client-side for combined OR across multiple columns
      const allRows = await fetchAllRows<FreightProduct>(query);

      if (filters.search.trim()) {
        const term = filters.search.toLowerCase().trim();
        return allRows.filter(p =>
          (p.title && p.title.toLowerCase().includes(term)) ||
          (p.sku && p.sku.toLowerCase().includes(term)) ||
          (p.item_id && p.item_id.toLowerCase().includes(term))
        );
      }

      return allRows;
    },
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000,
  });
}
