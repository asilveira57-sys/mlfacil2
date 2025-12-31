// @ts-nocheck - Deno types not available in build context
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declare EdgeRuntime for Supabase Edge Functions
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Sleep helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ViaCEP response interface
interface ViaCEPResponse {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

// Background enrichment function
async function enrichNeighborhoodsInBackground(
  supabaseAdmin: ReturnType<typeof createClient>,
  sellerId: string,
  userId: string
) {
  const BATCH_SIZE = 10; // Small batches to respect ViaCEP rate limit
  const MAX_RECORDS = 200; // Max records per execution to avoid timeout
  const DELAY_BETWEEN_CALLS = 400; // 400ms delay between ViaCEP calls

  try {
    console.log(`[Enrich] Starting neighborhood enrichment for seller ${sellerId}`);

    // Get unique zipcodes that need enrichment
    const { data: pendingShipments, error: fetchError } = await supabaseAdmin
      .from('meli_shipments_cache')
      .select('shipping_zipcode')
      .eq('seller_id', sellerId)
      .not('shipping_zipcode', 'is', null)
      .neq('shipping_zipcode', '')
      .or('shipping_neighborhood.is.null,shipping_neighborhood.eq.')
      .limit(MAX_RECORDS);

    if (fetchError) {
      console.error('[Enrich] Error fetching pending shipments:', fetchError);
      return;
    }

    if (!pendingShipments || pendingShipments.length === 0) {
      console.log('[Enrich] No shipments need neighborhood enrichment');
      return;
    }

    // Get unique CEPs
    const uniqueCeps = [...new Set(
      pendingShipments
        .map(s => s.shipping_zipcode?.replace(/\D/g, ''))
        .filter((cep): cep is string => cep !== null && cep.length === 8)
    )];

    console.log(`[Enrich] Found ${uniqueCeps.length} unique CEPs to process`);

    let enriched = 0;
    let cached = 0;
    let errors = 0;

    // Process in batches
    for (let i = 0; i < uniqueCeps.length; i += BATCH_SIZE) {
      const batch = uniqueCeps.slice(i, i + BATCH_SIZE);
      
      for (const cep of batch) {
        try {
          // Check cache first
          const { data: cachedCep } = await supabaseAdmin
            .from('cep_cache')
            .select('neighborhood, city, state_uf')
            .eq('zipcode', cep)
            .maybeSingle();

          let neighborhood: string | null = null;
          let city: string | null = null;
          let stateUf: string | null = null;

          if (cachedCep) {
            // Use cached data
            neighborhood = cachedCep.neighborhood;
            city = cachedCep.city;
            stateUf = cachedCep.state_uf;
            cached++;
          } else {
            // Call ViaCEP
            const viacepUrl = `https://viacep.com.br/ws/${cep}/json/`;
            const response = await fetch(viacepUrl);
            
            if (response.ok) {
              const data: ViaCEPResponse = await response.json();
              
              if (!data.erro) {
                neighborhood = data.bairro || null;
                city = data.localidade || null;
                stateUf = data.uf || null;

                // Save to cache (even empty results to avoid re-fetching)
                await supabaseAdmin.from('cep_cache').upsert({
                  zipcode: cep,
                  neighborhood: neighborhood,
                  city: city,
                  state_uf: stateUf,
                  street: data.logradouro || null,
                  updated_at: new Date().toISOString(),
                }, {
                  onConflict: 'zipcode',
                  ignoreDuplicates: false,
                });

                enriched++;
              } else {
                // CEP not found - cache as null to avoid retrying
                await supabaseAdmin.from('cep_cache').upsert({
                  zipcode: cep,
                  neighborhood: null,
                  city: null,
                  state_uf: null,
                  updated_at: new Date().toISOString(),
                }, {
                  onConflict: 'zipcode',
                  ignoreDuplicates: false,
                });
              }
            } else {
              console.warn(`[Enrich] ViaCEP returned ${response.status} for CEP ${cep}`);
              errors++;
            }

            // Delay between ViaCEP calls to respect rate limit
            await sleep(DELAY_BETWEEN_CALLS);
          }

          // Update shipments with this CEP
          if (neighborhood) {
            const updateData: Record<string, unknown> = {
              shipping_neighborhood: neighborhood,
            };
            
            // Also fill city and state if they're empty
            if (city) updateData.shipping_city = city;
            if (stateUf) updateData.shipping_state_uf = stateUf;

            const { error: updateError } = await supabaseAdmin
              .from('meli_shipments_cache')
              .update(updateData)
              .eq('seller_id', sellerId)
              .eq('shipping_zipcode', cep);

            if (updateError) {
              console.error(`[Enrich] Error updating shipments for CEP ${cep}:`, updateError);
            }
          }

        } catch (err) {
          console.error(`[Enrich] Error processing CEP ${cep}:`, err);
          errors++;
        }
      }

      // Small delay between batches
      if (i + BATCH_SIZE < uniqueCeps.length) {
        await sleep(100);
      }
    }

    console.log(`[Enrich] Completed: ${enriched} from ViaCEP, ${cached} from cache, ${errors} errors`);

  } catch (error) {
    console.error('[Enrich] Background enrichment error:', error);
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

    // This function can be called internally without auth for background processing
    const { seller_id, user_id } = await req.json();
    
    if (!seller_id || !user_id) {
      return new Response(
        JSON.stringify({ error: 'seller_id and user_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Enrich] Received request for seller ${seller_id}`);

    // Start background processing
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(
        enrichNeighborhoodsInBackground(supabaseAdmin, seller_id, user_id)
      );
    } else {
      // Fallback for local testing
      enrichNeighborhoodsInBackground(supabaseAdmin, seller_id, user_id)
        .catch(err => console.error('[Enrich] Background processing failed:', err));
    }

    // Return immediately
    return new Response(
      JSON.stringify({ 
        accepted: true,
        message: 'Neighborhood enrichment started in background',
      }),
      { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Enrich] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
