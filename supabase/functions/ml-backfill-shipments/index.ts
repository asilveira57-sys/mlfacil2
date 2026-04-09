// @ts-nocheck - Deno types not available in build context
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const STATE_TO_UF: Record<string, string> = {
  'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM',
  'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF', 'Espírito Santo': 'ES',
  'Goiás': 'GO', 'Maranhão': 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS',
  'Minas Gerais': 'MG', 'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR',
  'Pernambuco': 'PE', 'Piauí': 'PI', 'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN',
  'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', 'Roraima': 'RR', 'Santa Catarina': 'SC',
  'São Paulo': 'SP', 'Sergipe': 'SE', 'Tocantins': 'TO',
  'Amapa': 'AP', 'Ceara': 'CE', 'Espirito Santo': 'ES', 'Goias': 'GO',
  'Maranhao': 'MA', 'Para': 'PA', 'Paraiba': 'PB', 'Parana': 'PR',
  'Piaui': 'PI', 'Rio Grande Do Norte': 'RN', 'Rondonia': 'RO', 'Sao Paulo': 'SP',
};

const SELLER_PRINTABLE_SUBSTATUSES = ['ready_to_print', 'printed'];
const FULL_LOGISTIC_TYPES = ['fulfillment'];

const BATCH_SIZE = 50;
const MAX_PER_EXECUTION = 200;
const DELAY_BETWEEN_CALLS = 600; // Rate-limit safety

async function backfillInBackground(
  supabaseAdmin: ReturnType<typeof createClient>,
  sellerId: string,
  userId: string,
  accessToken: string
) {
  try {
    console.log(`[Backfill] Starting shipment backfill for seller ${sellerId}`);

    // Find orders with shipment_id — paginate to avoid 1000-row limit
    const allOrderShipments: { shipment_id: string }[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: page, error: fetchErr } = await supabaseAdmin
        .from('meli_orders_cache')
        .select('shipment_id')
        .eq('seller_id', sellerId)
        .not('shipment_id', 'is', null)
        .neq('shipment_id', '')
        .range(from, from + PAGE_SIZE - 1);

      if (fetchErr) {
        console.error('[Backfill] Error fetching orders:', fetchErr);
        return;
      }

      if (!page || page.length === 0) {
        hasMore = false;
      } else {
        allOrderShipments.push(...page);
        from += PAGE_SIZE;
        hasMore = page.length === PAGE_SIZE;
      }
    }

    if (allOrderShipments.length === 0) {
      console.log('[Backfill] No orders found');
      return;
    }

    // Get unique shipment IDs
    const allShipmentIds = [...new Set(allOrderShipments.map(o => o.shipment_id).filter(Boolean))];
    console.log(`[Backfill] Found ${allShipmentIds.length} unique shipment IDs from orders`);

    // Check which ones already exist in cache - batch in groups of 500
    const existingSet = new Set<string>();
    for (let i = 0; i < allShipmentIds.length; i += 500) {
      const batch = allShipmentIds.slice(i, i + 500);
      const { data: existing } = await supabaseAdmin
        .from('meli_shipments_cache')
        .select('shipment_id')
        .eq('seller_id', sellerId)
        .in('shipment_id', batch);
      
      (existing || []).forEach(e => existingSet.add(e.shipment_id));
    }

    const missingIds = allShipmentIds.filter(id => !existingSet.has(id));
    console.log(`[Backfill] ${missingIds.length} shipments missing from cache`);

    if (missingIds.length === 0) {
      console.log('[Backfill] All shipments already cached');
      return;
    }

    // Process up to MAX_PER_EXECUTION
    const toProcess = missingIds.slice(0, MAX_PER_EXECUTION);
    let synced = 0;
    let errors = 0;

    // Build order mapping — batch .in() to avoid limits
    const orderMap = new Map<string, string>();
    for (let i = 0; i < toProcess.length; i += 500) {
      const batch = toProcess.slice(i, i + 500);
      const { data: mappingData } = await supabaseAdmin
        .from('meli_orders_cache')
        .select('order_id, shipment_id')
        .eq('seller_id', sellerId)
        .in('shipment_id', batch);
      
      (mappingData || []).forEach(o => {
        if (o.shipment_id) orderMap.set(o.shipment_id, o.order_id);
      });
    }

    // Process in batches
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE);
      console.log(`[Backfill] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} shipments`);

      await Promise.all(batch.map(async (shipmentId) => {
        try {
          const orderId = orderMap.get(shipmentId);
          if (!orderId) { errors++; return; }

          const resp = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });

          if (!resp.ok) {
            if (resp.status === 404) {
              // Shipment doesn't exist — insert placeholder so we don't retry
              await supabaseAdmin.from('meli_shipments_cache').upsert({
                shipment_id: shipmentId,
                order_id: orderId,
                seller_id: sellerId,
                user_id: userId,
                shipment_status: 'not_found',
                label_available: false,
              }, { onConflict: 'seller_id,shipment_id' });
            }
            errors++;
            return;
          }

          const shipment = await resp.json();
          const addr = shipment.receiver_address;
          
          const rawCity = addr?.city?.name || null;
          const rawState = addr?.state?.name || null;
          const rawZipcode = addr?.zip_code?.replace(/\D/g, '') || null;
          const rawNeighborhood = addr?.neighborhood?.name || null;
          const stateUf = rawState ? (STATE_TO_UF[rawState] || addr?.state?.id || rawState) : null;

          const addressParts = [addr?.address_line, rawCity, rawState, addr?.zip_code].filter(Boolean);
          const receiverAddress = addressParts.join(', ') || null;

          const isFullLogistic = FULL_LOGISTIC_TYPES.includes(shipment.logistic_type);
          const isPrintable = SELLER_PRINTABLE_SUBSTATUSES.includes(shipment.substatus || '');
          const labelAvailable = isPrintable && !isFullLogistic;

          await supabaseAdmin.from('meli_shipments_cache').upsert({
            shipment_id: shipmentId,
            order_id: orderId,
            seller_id: sellerId,
            user_id: userId,
            shipment_status: shipment.status || null,
            shipment_substatus: shipment.substatus || null,
            tracking_number: shipment.tracking_number || null,
            logistic_type: shipment.logistic_type || null,
            label_available: labelAvailable,
            receiver_name: addr?.receiver_name || null,
            receiver_address: receiverAddress,
            shipping_city: rawCity,
            shipping_state_uf: stateUf,
            shipping_zipcode: rawZipcode,
            shipping_neighborhood: rawNeighborhood,
          }, { onConflict: 'seller_id,shipment_id' });

          synced++;
        } catch (err) {
          console.error(`[Backfill] Error processing shipment ${shipmentId}:`, err);
          errors++;
        }
      }));

      // Rate limit between batches
      if (i + BATCH_SIZE < toProcess.length) {
        await sleep(DELAY_BETWEEN_CALLS);
      }
    }

    console.log(`[Backfill] Done: ${synced} synced, ${errors} errors out of ${toProcess.length}`);

    // Self-chain if there are more to process
    if (missingIds.length > MAX_PER_EXECUTION) {
      const remaining = missingIds.length - MAX_PER_EXECUTION;
      console.log(`[Backfill] ${remaining} remaining, self-chaining...`);
      try {
        const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ml-backfill-shipments`;
        await fetch(selfUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'x-internal-key': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
          },
          body: JSON.stringify({ seller_id: sellerId, user_id: userId }),
        });
      } catch (chainErr) {
        console.warn('[Backfill] Self-chain failed:', chainErr);
      }
    }

    // Trigger neighborhood/city enrichment via ViaCEP for any that came without city
    if (synced > 0) {
      console.log(`[Backfill] Triggering geographic enrichment...`);
      try {
        const enrichUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ml-enrich-neighborhoods`;
        fetch(enrichUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ seller_id: sellerId, user_id: userId }),
        }).catch(err => console.warn('[Backfill] Enrichment trigger failed:', err));
      } catch (e) {
        console.warn('[Backfill] Enrichment trigger error:', e);
      }
    }

  } catch (error) {
    console.error('[Backfill] Fatal error:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Support both authenticated calls and internal service-role calls
    const authHeader = req.headers.get('Authorization');
    const internalKey = req.headers.get('x-internal-key');
    const isInternal = internalKey === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    let userId: string;
    
    if (isInternal) {
      const body = await req.json();
      if (!body.seller_id || !body.user_id) {
        return new Response(JSON.stringify({ error: 'seller_id and user_id required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = body.user_id;
      
      // Get ML access token
      const { data: mlAccount } = await supabaseAdmin
        .from('ml_accounts')
        .select('access_token')
        .eq('user_id', userId)
        .eq('ml_user_id', body.seller_id)
        .eq('is_active', true)
        .maybeSingle();

      if (!mlAccount?.access_token) {
        return new Response(JSON.stringify({ error: 'ML account not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Start background processing
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
        EdgeRuntime.waitUntil(backfillInBackground(supabaseAdmin, body.seller_id, userId, mlAccount.access_token));
      } else {
        backfillInBackground(supabaseAdmin, body.seller_id, userId, mlAccount.access_token)
          .catch(err => console.error('[Backfill] BG failed:', err));
      }

      return new Response(JSON.stringify({ accepted: true, message: 'Backfill started' }), {
        status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authenticated user call
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    userId = user.id;
    const { seller_id } = await req.json();
    if (!seller_id) {
      return new Response(JSON.stringify({ error: 'seller_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ML API Access Gate
    const { assertMlApiAccess } = await import("../_shared/ml-api-gate.ts");
    const gate = await assertMlApiAccess(supabaseAdmin, userId);
    if (!gate.allowed) return gate.response!;

    const { data: mlAccount } = await supabaseAdmin
      .from('ml_accounts')
      .select('access_token')
      .eq('user_id', userId)
      .eq('ml_user_id', seller_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!mlAccount?.access_token) {
      return new Response(JSON.stringify({ error: 'ML account not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(backfillInBackground(supabaseAdmin, seller_id, userId, mlAccount.access_token));
    } else {
      backfillInBackground(supabaseAdmin, seller_id, userId, mlAccount.access_token)
        .catch(err => console.error('[Backfill] BG failed:', err));
    }

    return new Response(JSON.stringify({ accepted: true, message: 'Shipment backfill started in background' }), {
      status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Backfill] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
