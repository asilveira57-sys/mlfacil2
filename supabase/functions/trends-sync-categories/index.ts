import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const MIN_ORDERS_90D = 5; // Minimum orders for active status
const MIN_ORDERS_30D = 2; // For new accounts
const MIN_ORDERS_FOR_THRESHOLD_PIN = 10; // Auto-pin if >= this many orders
const TOP_GMV_PIN_COUNT = 3; // Top N categories by GMV to pin
const RATE_LIMIT_DELAY = 150; // ms between category API calls

interface CategoryAggregation {
  category_id: string;
  orders_count_90d: number;
  gmv_90d: number;
  units_sold_90d: number;
  orders_count_30d: number;
  gmv_30d: number;
  units_sold_30d: number;
  last_order_at: string | null;
  first_order_at: string | null;
}

interface CategoryInfo {
  id: string;
  name: string;
  path_from_root: Array<{ id: string; name: string }>;
}

interface OrderItem {
  order_id: string;
  item_id: string;
  quantity: number;
  unit_price: number;
  created_at_meli: string;
}

interface ListingItem {
  item_id: string;
  category_id: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    let accountId: string | null = null;

    // Parse request body
    const body = await req.json().catch(() => ({}));
    accountId = body.account_id || null;

    // Get user from auth header if present
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    // If no specific account, get all active accounts (for nightly job)
    let accounts: Array<{ ml_user_id: string; user_id: string; access_token: string }> = [];
    
    if (accountId && userId) {
      // Single account sync
      const { data: account } = await supabase
        .from('ml_accounts')
        .select('ml_user_id, user_id, access_token')
        .eq('ml_user_id', accountId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();
      
      if (account) {
        accounts = [account];
      }
    } else {
      // Nightly job - all active accounts
      const { data: allAccounts } = await supabase
        .from('ml_accounts')
        .select('ml_user_id, user_id, access_token')
        .eq('is_active', true);
      
      accounts = allAccounts || [];
    }

    if (accounts.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No accounts found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    console.log(`[trends-sync-categories] Processing ${accounts.length} account(s)`);

    const results: Array<{ account_id: string; categories_found: number; categories_pinned: number; error?: string }> = [];

    for (const account of accounts) {
      const startTime = Date.now();
      
      try {
        // Update sync state to running
        await supabase
          .from('account_category_sync_state')
          .upsert({
            user_id: account.user_id,
            account_id: account.ml_user_id,
            status: 'running',
            error_message: null,
          }, { onConflict: 'account_id' });

        // Step 1: Aggregate orders by category from cache
        const aggregations = await aggregateOrdersByCategory(supabase, account.ml_user_id);
        console.log(`[trends-sync-categories] Account ${account.ml_user_id}: ${aggregations.length} categories found`);

        if (aggregations.length === 0) {
          await supabase
            .from('account_category_sync_state')
            .update({
              status: 'completed',
              last_sync_at: new Date().toISOString(),
              last_sync_duration_ms: Date.now() - startTime,
              categories_found: 0,
              categories_pinned: 0,
            })
            .eq('account_id', account.ml_user_id);

          results.push({ account_id: account.ml_user_id, categories_found: 0, categories_pinned: 0 });
          continue;
        }

        // Step 2: Enrich with category names and paths
        const enrichedCategories = await enrichCategoryInfo(aggregations, account.access_token);

        // Step 3: Apply pinning rules
        const categoriesWithPinning = applyPinningRules(enrichedCategories);

        // Step 4: Upsert to database
        const upsertData = categoriesWithPinning.map(cat => ({
          user_id: account.user_id,
          account_id: account.ml_user_id,
          category_id: cat.category_id,
          category_name: cat.category_name,
          category_path: cat.category_path,
          level1_category_id: cat.level1_category_id,
          level1_category_name: cat.level1_category_name,
          orders_count_90d: cat.orders_count_90d,
          gmv_90d: cat.gmv_90d,
          units_sold_90d: cat.units_sold_90d,
          orders_count_30d: cat.orders_count_30d,
          gmv_30d: cat.gmv_30d,
          units_sold_30d: cat.units_sold_30d,
          last_order_at: cat.last_order_at,
          first_order_at: cat.first_order_at,
          is_active: cat.is_active,
          is_pinned_auto: cat.is_pinned_auto,
          pinned_reason: cat.pinned_reason,
          pinned_rank: cat.pinned_rank,
          computed_at: new Date().toISOString(),
        }));

        const { error: upsertError } = await supabase
          .from('account_category_activity')
          .upsert(upsertData, { onConflict: 'account_id,category_id' });

        if (upsertError) {
          throw new Error(`Upsert failed: ${upsertError.message}`);
        }

        const pinnedCount = categoriesWithPinning.filter(c => c.is_pinned_auto).length;

        // Update sync state to completed
        await supabase
          .from('account_category_sync_state')
          .update({
            status: 'completed',
            last_sync_at: new Date().toISOString(),
            last_sync_duration_ms: Date.now() - startTime,
            categories_found: categoriesWithPinning.length,
            categories_pinned: pinnedCount,
            error_message: null,
          })
          .eq('account_id', account.ml_user_id);

        results.push({
          account_id: account.ml_user_id,
          categories_found: categoriesWithPinning.length,
          categories_pinned: pinnedCount,
        });

        console.log(`[trends-sync-categories] Account ${account.ml_user_id}: ${categoriesWithPinning.length} categories, ${pinnedCount} pinned`);

      } catch (error) {
        console.error(`[trends-sync-categories] Error for account ${account.ml_user_id}:`, error);
        
        await supabase
          .from('account_category_sync_state')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
          })
          .eq('account_id', account.ml_user_id);

        results.push({
          account_id: account.ml_user_id,
          categories_found: 0,
          categories_pinned: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[trends-sync-categories] Fatal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

/**
 * Aggregate orders by category from meli_orders_cache + meli_order_items_cache + meli_listings_cache
 */
async function aggregateOrdersByCategory(
  supabase: SupabaseClient,
  sellerId: string
): Promise<CategoryAggregation[]> {
  const now = new Date();
  const date90dAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const date30dAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Get orders with items and their categories
  const { data: items, error } = await supabase
    .from('meli_order_items_cache')
    .select(`
      order_id,
      item_id,
      quantity,
      unit_price,
      created_at_meli
    `)
    .eq('seller_id', sellerId)
    .gte('created_at_meli', date90dAgo);

  if (error || !items || items.length === 0) {
    console.log(`[aggregateOrdersByCategory] No items found for seller ${sellerId}`);
    return [];
  }

  // Cast items to typed array
  const typedItems = items as unknown as OrderItem[];

  // Get unique item_ids
  const itemIds = [...new Set(typedItems.map(i => i.item_id))];

  // Fetch categories from listings cache
  const { data: listings } = await supabase
    .from('meli_listings_cache')
    .select('item_id, category_id')
    .eq('seller_id', sellerId)
    .in('item_id', itemIds);

  const typedListings = (listings || []) as unknown as ListingItem[];
  const itemCategoryMap = new Map<string, string>();
  typedListings.forEach(l => {
    if (l.category_id) {
      itemCategoryMap.set(l.item_id, l.category_id);
    }
  });

  // Aggregate by category
  const categoryStats = new Map<string, CategoryAggregation>();

  for (const item of typedItems) {
    const categoryId = itemCategoryMap.get(item.item_id);
    if (!categoryId) continue;

    const orderDate = item.created_at_meli;
    const is90d = orderDate >= date90dAgo;
    const is30d = orderDate >= date30dAgo;
    const quantity = Number(item.quantity) || 1;
    const unitPrice = Number(item.unit_price) || 0;
    const revenue = quantity * unitPrice;

    if (!categoryStats.has(categoryId)) {
      categoryStats.set(categoryId, {
        category_id: categoryId,
        orders_count_90d: 0,
        gmv_90d: 0,
        units_sold_90d: 0,
        orders_count_30d: 0,
        gmv_30d: 0,
        units_sold_30d: 0,
        last_order_at: null,
        first_order_at: null,
      });
    }

    const stats = categoryStats.get(categoryId)!;

    if (is90d) {
      stats.orders_count_90d += 1;
      stats.gmv_90d += revenue;
      stats.units_sold_90d += quantity;
    }

    if (is30d) {
      stats.orders_count_30d += 1;
      stats.gmv_30d += revenue;
      stats.units_sold_30d += quantity;
    }

    // Track first/last order dates
    if (!stats.last_order_at || orderDate > stats.last_order_at) {
      stats.last_order_at = orderDate;
    }
    if (!stats.first_order_at || orderDate < stats.first_order_at) {
      stats.first_order_at = orderDate;
    }
  }

  return Array.from(categoryStats.values());
}

/**
 * Enrich categories with names and paths from ML API
 */
async function enrichCategoryInfo(
  aggregations: CategoryAggregation[],
  accessToken: string
): Promise<Array<CategoryAggregation & { 
  category_name: string; 
  category_path: string[]; 
  level1_category_id: string; 
  level1_category_name: string 
}>> {
  const enriched: Array<CategoryAggregation & { 
    category_name: string; 
    category_path: string[]; 
    level1_category_id: string; 
    level1_category_name: string 
  }> = [];

  for (const agg of aggregations) {
    try {
      const categoryInfo = await fetchCategoryInfo(agg.category_id, accessToken);
      
      enriched.push({
        ...agg,
        category_name: categoryInfo?.name || agg.category_id,
        category_path: categoryInfo?.path_from_root?.map(p => p.name) || [],
        level1_category_id: categoryInfo?.path_from_root?.[0]?.id || agg.category_id,
        level1_category_name: categoryInfo?.path_from_root?.[0]?.name || 'Categoria',
      });

      await sleep(RATE_LIMIT_DELAY);
    } catch (error) {
      console.warn(`[enrichCategoryInfo] Error for ${agg.category_id}:`, error);
      enriched.push({
        ...agg,
        category_name: agg.category_id,
        category_path: [],
        level1_category_id: agg.category_id,
        level1_category_name: 'Categoria',
      });
    }
  }

  return enriched;
}

/**
 * Fetch category info from ML API
 */
async function fetchCategoryInfo(categoryId: string, accessToken: string): Promise<CategoryInfo | null> {
  try {
    const url = `https://api.mercadolibre.com/categories/${categoryId}`;
    const res = await fetch(url, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });

    if (!res.ok) {
      console.warn(`[fetchCategoryInfo] ${categoryId} returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    return {
      id: data.id,
      name: data.name,
      path_from_root: data.path_from_root || [],
    };
  } catch (error) {
    console.error(`[fetchCategoryInfo] Error fetching ${categoryId}:`, error);
    return null;
  }
}

/**
 * Apply pinning rules to determine which categories are always visible
 */
function applyPinningRules(
  categories: Array<CategoryAggregation & { 
    category_name: string; 
    category_path: string[]; 
    level1_category_id: string; 
    level1_category_name: string 
  }>
): Array<CategoryAggregation & { 
  category_name: string; 
  category_path: string[]; 
  level1_category_id: string; 
  level1_category_name: string;
  is_active: boolean;
  is_pinned_auto: boolean;
  pinned_reason: string | null;
  pinned_rank: number | null;
}> {
  // Calculate totals for determining if account is "new"
  const totalOrders90d = categories.reduce((sum, c) => sum + c.orders_count_90d, 0);
  const isNewAccount = totalOrders90d < 20;

  // Sort by GMV 90d for ranking
  const sortedByGmv = [...categories].sort((a, b) => b.gmv_90d - a.gmv_90d);

  return categories.map(cat => {
    // Determine if active
    const is_active = 
      cat.orders_count_90d >= MIN_ORDERS_90D || 
      cat.orders_count_30d >= MIN_ORDERS_30D;

    // Determine pinning
    let is_pinned_auto = false;
    let pinned_reason: string | null = null;
    let pinned_rank: number | null = null;

    // Rule 1: Top 3 by GMV 90d
    const gmvRank = sortedByGmv.findIndex(c => c.category_id === cat.category_id);
    if (gmvRank >= 0 && gmvRank < TOP_GMV_PIN_COUNT) {
      is_pinned_auto = true;
      pinned_reason = 'top_gmv_90d';
      pinned_rank = gmvRank + 1;
    }

    // Rule 2: High order count threshold
    if (!is_pinned_auto && cat.orders_count_90d >= MIN_ORDERS_FOR_THRESHOLD_PIN) {
      is_pinned_auto = true;
      pinned_reason = 'min_orders_threshold';
      pinned_rank = gmvRank + 1;
    }

    // Rule 3: For new accounts, top 1 by 30d GMV
    if (!is_pinned_auto && isNewAccount) {
      const sortedBy30d = [...categories].sort((a, b) => b.gmv_30d - a.gmv_30d);
      const gmv30dRank = sortedBy30d.findIndex(c => c.category_id === cat.category_id);
      if (gmv30dRank === 0 && cat.gmv_30d > 0) {
        is_pinned_auto = true;
        pinned_reason = 'top_gmv_30d_new_account';
        pinned_rank = 1;
      }
    }

    return {
      ...cat,
      is_active,
      is_pinned_auto,
      pinned_reason,
      pinned_rank,
    };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
