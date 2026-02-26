import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

interface TierDef {
  tier_index: number;
  min_quantity: number;
  value_type: 'PERCENT_DISCOUNT' | 'FIXED_UNIT_PRICE';
  value: number;
  is_enabled: boolean;
}

interface ProfileWithTiers {
  id: string;
  name: string;
  rounding_mode: string;
  margin_min_pct: number | null;
  tiers: TierDef[];
}

interface PreviewRow {
  item_id: string;
  title: string;
  thumbnail: string;
  category_id: string;
  category_name: string;
  current_price: number;
  status: string;
  profile_id: string;
  profile_name: string;
  source: 'override' | 'category' | 'default';
  tiers: { tier_index: number; min_quantity: number; unit_price: number; discount_pct: number }[];
  is_excluded: boolean;
}

function applyRounding(price: number, mode: string): number {
  if (mode === 'end_90') {
    return Math.floor(price) + 0.90;
  }
  if (mode === 'end_99') {
    return Math.floor(price) + 0.99;
  }
  return Math.round(price * 100) / 100;
}

function calculateTierPrices(
  basePrice: number,
  tiers: TierDef[],
  roundingMode: string
): { tier_index: number; min_quantity: number; unit_price: number; discount_pct: number }[] {
  return tiers
    .filter(t => t.is_enabled)
    .map(t => {
      let unitPrice: number;
      let discountPct: number;
      if (t.value_type === 'PERCENT_DISCOUNT') {
        unitPrice = basePrice * (1 - t.value / 100);
        discountPct = t.value;
      } else {
        unitPrice = t.value;
        discountPct = basePrice > 0 ? ((basePrice - t.value) / basePrice) * 100 : 0;
      }
      unitPrice = applyRounding(unitPrice, roundingMode);
      return {
        tier_index: t.tier_index,
        min_quantity: t.min_quantity,
        unit_price: unitPrice,
        discount_pct: Math.round(discountPct * 100) / 100,
      };
    });
}

async function fetchAllSellerItems(
  accessToken: string,
  sellerId: string,
  categoryFilter?: string
): Promise<any[]> {
  const items: any[] = [];
  let offset = 0;
  const limit = 50;
  let total = 1;

  while (offset < total) {
    let url = `https://api.mercadolibre.com/users/${sellerId}/items/search?limit=${limit}&offset=${offset}&status=active`;
    if (categoryFilter) {
      url += `&category=${categoryFilter}`;
    }

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[wholesale-engine] Search error: ${res.status}`, err);
      break;
    }

    const data = await res.json();
    total = data.paging?.total || 0;

    if (data.results?.length > 0) {
      // Fetch item details in batches of 20
      const ids = data.results as string[];
      for (let i = 0; i < ids.length; i += 20) {
        const batch = ids.slice(i, i + 20);
        const multiRes = await fetch(
          `https://api.mercadolibre.com/items?ids=${batch.join(',')}&attributes=id,title,price,thumbnail,category_id,status`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        if (multiRes.ok) {
          const multiData = await multiRes.json();
          for (const entry of multiData) {
            if (entry.code === 200 && entry.body) {
              items.push(entry.body);
            }
          }
        }
      }
    }

    offset += limit;
    if (offset >= 1000) break; // Safety limit
  }

  return items;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub as string;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ML API Access Gate
    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabaseAdmin, userId);
    if (!gate.allowed) return gate.response!;

    const body = await req.json();
    const { action, sellerId, companyId } = body;

    if (!sellerId || !companyId) {
      return new Response(JSON.stringify({ error: 'sellerId and companyId required' }), { status: 400, headers: corsHeaders });
    }

    // Get ML account token
    const { data: mlAccount, error: accError } = await supabase
      .from('ml_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('ml_user_id', sellerId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (accError || !mlAccount) {
      return new Response(JSON.stringify({ error: 'No ML account connected', needsAuth: true }), { status: 401, headers: corsHeaders });
    }

    let accessToken = mlAccount.access_token;
    const tokenExpiry = new Date(mlAccount.token_expires_at);
    if (tokenExpiry <= new Date()) {
      const refreshRes = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: Deno.env.get('ML_APP_ID') || '',
          client_secret: Deno.env.get('ML_SECRET_KEY') || '',
          refresh_token: mlAccount.refresh_token,
        }),
      });
      if (!refreshRes.ok) {
        return new Response(JSON.stringify({ error: 'Token expired, reconnect ML account', needsAuth: true }), { status: 401, headers: corsHeaders });
      }
      const refreshData = await refreshRes.json();
      accessToken = refreshData.access_token;
      await supabaseAdmin.from('ml_accounts').update({
        access_token: refreshData.access_token,
        refresh_token: refreshData.refresh_token,
        token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
      }).eq('id', mlAccount.id);
    }

    // ============================================================
    // ACTION: preview
    // ============================================================
    if (action === 'preview') {
      console.log(`[wholesale-engine] Preview for seller ${sellerId}, company ${companyId}`);

      // 1. Load all profiles + tiers for this company
      const { data: profiles } = await supabaseAdmin
        .from('wholesale_profiles')
        .select('id, name, rounding_mode, margin_min_pct, is_active')
        .eq('company_id', companyId)
        .eq('is_active', true);

      if (!profiles || profiles.length === 0) {
        return new Response(JSON.stringify({ ok: true, data: { rows: [], summary: [], total_items: 0 } }), { headers: corsHeaders });
      }

      const profileIds = profiles.map((p: any) => p.id);
      const { data: allTiers } = await supabaseAdmin
        .from('wholesale_profile_tiers')
        .select('*')
        .in('profile_id', profileIds)
        .order('tier_index');

      const profileMap: Record<string, ProfileWithTiers> = {};
      for (const p of profiles) {
        profileMap[p.id] = {
          ...p,
          tiers: (allTiers || []).filter((t: any) => t.profile_id === p.id),
        };
      }

      // 2. Load category bindings
      const { data: catBindings } = await supabaseAdmin
        .from('wholesale_profile_categories')
        .select('profile_id, category_id, category_name')
        .eq('company_id', companyId);

      const categoryProfileMap: Record<string, { profile_id: string; category_name: string }> = {};
      for (const cb of catBindings || []) {
        categoryProfileMap[cb.category_id] = { profile_id: cb.profile_id, category_name: cb.category_name || '' };
      }

      // 3. Load product overrides
      const { data: overrides } = await supabaseAdmin
        .from('wholesale_product_overrides')
        .select('item_id, profile_id, is_excluded')
        .eq('company_id', companyId);

      const overrideMap: Record<string, { profile_id: string | null; is_excluded: boolean }> = {};
      for (const o of overrides || []) {
        overrideMap[o.item_id] = { profile_id: o.profile_id, is_excluded: o.is_excluded };
      }

      // 4. Load default settings
      const { data: settings } = await supabaseAdmin
        .from('wholesale_seller_settings')
        .select('default_profile_id')
        .eq('company_id', companyId)
        .maybeSingle();

      const defaultProfileId = settings?.default_profile_id || null;

      // 5. Fetch ML items
      const mlItems = await fetchAllSellerItems(accessToken, sellerId);
      console.log(`[wholesale-engine] Fetched ${mlItems.length} items from ML`);

      // 6. Resolve profile for each item
      const previewRows: PreviewRow[] = [];
      const categorySummary: Record<string, { category_name: string; count: number; avg_discount: number; total_discounts: number[] }> = {};

      for (const item of mlItems) {
        const itemId = item.id as string;
        const categoryId = item.category_id as string;
        const basePrice = item.price as number;

        // Check override
        const override = overrideMap[itemId];
        if (override?.is_excluded) {
          previewRows.push({
            item_id: itemId,
            title: item.title || '',
            thumbnail: item.thumbnail || '',
            category_id: categoryId,
            category_name: categoryProfileMap[categoryId]?.category_name || categoryId,
            current_price: basePrice,
            status: item.status || 'active',
            profile_id: '',
            profile_name: '—',
            source: 'override',
            tiers: [],
            is_excluded: true,
          });
          continue;
        }

        // Resolve profile: override > category > default
        let resolvedProfileId: string | null = null;
        let source: 'override' | 'category' | 'default' = 'default';

        if (override?.profile_id) {
          resolvedProfileId = override.profile_id;
          source = 'override';
        } else if (categoryProfileMap[categoryId]) {
          resolvedProfileId = categoryProfileMap[categoryId].profile_id;
          source = 'category';
        } else if (defaultProfileId) {
          resolvedProfileId = defaultProfileId;
          source = 'default';
        }

        if (!resolvedProfileId || !profileMap[resolvedProfileId]) continue;

        const profile = profileMap[resolvedProfileId];
        const tierPrices = calculateTierPrices(basePrice, profile.tiers, profile.rounding_mode);

        if (tierPrices.length === 0) continue;

        const catName = categoryProfileMap[categoryId]?.category_name || categoryId;

        previewRows.push({
          item_id: itemId,
          title: item.title || '',
          thumbnail: item.thumbnail || '',
          category_id: categoryId,
          category_name: catName,
          current_price: basePrice,
          status: item.status || 'active',
          profile_id: resolvedProfileId,
          profile_name: profile.name,
          source,
          tiers: tierPrices,
          is_excluded: false,
        });

        // Aggregate category summary
        if (!categorySummary[categoryId]) {
          categorySummary[categoryId] = { category_name: catName, count: 0, avg_discount: 0, total_discounts: [] };
        }
        categorySummary[categoryId].count++;
        const maxDiscount = Math.max(...tierPrices.map(t => t.discount_pct));
        categorySummary[categoryId].total_discounts.push(maxDiscount);
      }

      // Calculate avg discount per category
      const summary = Object.entries(categorySummary).map(([catId, s]) => ({
        category_id: catId,
        category_name: s.category_name,
        items_count: s.count,
        avg_max_discount: s.total_discounts.length > 0
          ? Math.round((s.total_discounts.reduce((a, b) => a + b, 0) / s.total_discounts.length) * 100) / 100
          : 0,
      }));

      return new Response(JSON.stringify({
        ok: true,
        data: {
          rows: previewRows,
          summary,
          total_items: mlItems.length,
          items_with_profile: previewRows.filter(r => !r.is_excluded && r.tiers.length > 0).length,
          items_excluded: previewRows.filter(r => r.is_excluded).length,
          items_without_profile: mlItems.length - previewRows.length,
        },
      }), { headers: corsHeaders });
    }

    // ============================================================
    // ACTION: apply
    // ============================================================
    if (action === 'apply') {
      const { itemIds } = body;
      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        return new Response(JSON.stringify({ error: 'itemIds array required' }), { status: 400, headers: corsHeaders });
      }

      console.log(`[wholesale-engine] Apply wholesale for ${itemIds.length} items`);

      // Load all needed data
      const { data: profiles } = await supabaseAdmin
        .from('wholesale_profiles')
        .select('id, name, rounding_mode, margin_min_pct')
        .eq('company_id', companyId)
        .eq('is_active', true);

      const profileIds = (profiles || []).map((p: any) => p.id);
      const { data: allTiers } = await supabaseAdmin
        .from('wholesale_profile_tiers')
        .select('*')
        .in('profile_id', profileIds.length > 0 ? profileIds : ['none'])
        .order('tier_index');

      const profileMap: Record<string, ProfileWithTiers> = {};
      for (const p of (profiles || [])) {
        profileMap[p.id] = { ...p, tiers: (allTiers || []).filter((t: any) => t.profile_id === p.id) };
      }

      const { data: catBindings } = await supabaseAdmin
        .from('wholesale_profile_categories')
        .select('profile_id, category_id')
        .eq('company_id', companyId);

      const categoryProfileMap: Record<string, string> = {};
      for (const cb of (catBindings || [])) {
        categoryProfileMap[cb.category_id] = cb.profile_id;
      }

      const { data: overrides } = await supabaseAdmin
        .from('wholesale_product_overrides')
        .select('item_id, profile_id, is_excluded')
        .eq('company_id', companyId);

      const overrideMap: Record<string, { profile_id: string | null; is_excluded: boolean }> = {};
      for (const o of (overrides || [])) {
        overrideMap[o.item_id] = { profile_id: o.profile_id, is_excluded: o.is_excluded };
      }

      const { data: settings } = await supabaseAdmin
        .from('wholesale_seller_settings')
        .select('default_profile_id')
        .eq('company_id', companyId)
        .maybeSingle();

      const defaultProfileId = settings?.default_profile_id || null;

      // Fetch items from ML
      const batchResults: { item_id: string; success: boolean; error?: string }[] = [];

      for (let i = 0; i < itemIds.length; i += 20) {
        const batch = itemIds.slice(i, i + 20);
        const multiRes = await fetch(
          `https://api.mercadolibre.com/items?ids=${batch.join(',')}&attributes=id,price,category_id,status`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );

        if (!multiRes.ok) {
          batch.forEach((id: string) => batchResults.push({ item_id: id, success: false, error: 'Failed to fetch item' }));
          continue;
        }

        const multiData = await multiRes.json();

        for (const entry of multiData) {
          if (entry.code !== 200 || !entry.body) {
            batchResults.push({ item_id: entry.body?.id || 'unknown', success: false, error: `ML error ${entry.code}` });
            continue;
          }

          const item = entry.body;
          const itemId = item.id;
          const categoryId = item.category_id;
          const basePrice = item.price;

          // Check exclusion
          if (overrideMap[itemId]?.is_excluded) {
            batchResults.push({ item_id: itemId, success: false, error: 'Item excluded from wholesale' });
            continue;
          }

          // Resolve profile
          let resolvedProfileId: string | null = overrideMap[itemId]?.profile_id || categoryProfileMap[categoryId] || defaultProfileId;

          if (!resolvedProfileId || !profileMap[resolvedProfileId]) {
            batchResults.push({ item_id: itemId, success: false, error: 'No profile resolved' });
            continue;
          }

          const profile = profileMap[resolvedProfileId];
          const tierPrices = calculateTierPrices(basePrice, profile.tiers, profile.rounding_mode);

          if (tierPrices.length === 0) {
            batchResults.push({ item_id: itemId, success: false, error: 'No enabled tiers' });
            continue;
          }

          // Build sale_terms with quantity discount structure
          // ML uses sale_terms QUANTITY_DISCOUNTS for some categories
          // We'll try the standard PUT /items approach with sale_terms
          const salePrices = tierPrices.map(t => ({
            quantity: t.min_quantity,
            amount: t.unit_price,
          }));

          try {
            const putRes = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                sale_terms: [{
                  id: 'QUANTITY_DISCOUNTS',
                  values: salePrices.map(sp => ({
                    quantity: sp.quantity,
                    amount: sp.amount,
                    currency_id: 'BRL',
                  })),
                }],
              }),
            });

            if (putRes.ok) {
              batchResults.push({ item_id: itemId, success: true });
            } else {
              const errBody = await putRes.json().catch(() => ({}));
              const errMsg = errBody.message || errBody.error || `HTTP ${putRes.status}`;
              batchResults.push({ item_id: itemId, success: false, error: errMsg });
            }
          } catch (err: any) {
            batchResults.push({ item_id: itemId, success: false, error: err.message || 'Request failed' });
          }

          // Rate limit pause
          await new Promise(r => setTimeout(r, 200));
        }
      }

      const successCount = batchResults.filter(r => r.success).length;
      const failCount = batchResults.filter(r => !r.success).length;

      return new Response(JSON.stringify({
        ok: true,
        data: {
          total: batchResults.length,
          success: successCount,
          failed: failCount,
          results: batchResults,
        },
      }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: corsHeaders });

  } catch (err: any) {
    console.error('[wholesale-engine] Error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), { status: 500, headers: corsHeaders });
  }
});
