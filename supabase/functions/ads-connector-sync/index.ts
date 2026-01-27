import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncRequest {
  connection_id: string;
  job_type?: 'full' | 'incremental' | 'campaigns' | 'ad_groups' | 'items' | 'metrics' | 'daily_metrics';
  date_from?: string;
  date_to?: string;
  manual?: boolean;
}

interface SyncResult {
  success: boolean;
  processed?: number;
  created?: number;
  updated?: number;
  failed?: number;
  total?: number;
  error?: string;
}

const RATE_LIMIT_DELAY_MS = 200;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  // deno-lint-ignore no-explicit-any
  const supabase: any = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { connection_id, job_type = 'full', date_from, date_to, manual = false }: SyncRequest = await req.json();

    if (!connection_id) {
      return new Response(
        JSON.stringify({ error: 'connection_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[ads-connector-sync] Starting ${job_type} sync for connection ${connection_id}`);

    // Get connection details
    const { data: connection, error: connError } = await supabase
      .from('ads_connections')
      .select('*')
      .eq('id', connection_id)
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: 'Connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get ML account credentials
    const { data: mlAccount, error: mlError } = await supabase
      .from('ml_accounts')
      .select('access_token, ml_user_id')
      .eq('ml_user_id', connection.seller_id)
      .eq('is_active', true)
      .maybeSingle();

    if (mlError || !mlAccount) {
      console.error(`[ads-connector-sync] ML account not found for seller ${connection.seller_id}`);
      return new Response(
        JSON.stringify({ error: 'ML account not found or inactive' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create sync job
    const { data: job, error: jobError } = await supabase
      .from('ads_sync_jobs')
      .insert({
        connection_id,
        job_type,
        status: 'running',
        started_at: new Date().toISOString(),
        date_from: date_from || null,
        date_to: date_to || null,
        priority: manual ? 1 : 5,
      })
      .select()
      .single();

    if (jobError) {
      throw new Error(`Failed to create sync job: ${jobError.message}`);
    }

    // Log sync start
    await logSync(supabase, {
      connection_id,
      job_id: job.id,
      seller_id: connection.seller_id,
      log_type: job_type === 'full' ? 'campaigns' : job_type,
      log_level: 'info',
      message: `Starting ${job_type} sync`,
      details: { manual, date_from, date_to },
    });

    // Execute sync
    let result: SyncResult;
    
    try {
      result = await executeFullSync(supabase, connection, job, mlAccount.access_token);
    } catch (syncError) {
      result = { 
        success: false, 
        error: syncError instanceof Error ? syncError.message : 'Sync failed',
      };
    }

    // Update job status
    // deno-lint-ignore no-explicit-any
    const jobUpdate: any = {
      status: result.success ? 'completed' : 'failed',
      completed_at: new Date().toISOString(),
      processed_records: result.processed || 0,
      failed_records: result.failed || 0,
      total_records: result.total || 0,
      result_summary: result,
    };

    if (!result.success) {
      jobUpdate.error_message = result.error;
      jobUpdate.retry_count = job.retry_count + 1;
      
      if (job.retry_count < MAX_RETRIES) {
        const backoffMs = BACKOFF_BASE_MS * Math.pow(2, job.retry_count);
        jobUpdate.status = 'pending';
        jobUpdate.next_retry_at = new Date(Date.now() + backoffMs).toISOString();
      }
    }

    await supabase.from('ads_sync_jobs').update(jobUpdate).eq('id', job.id);

    // Update connection last sync info
    await supabase
      .from('ads_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: result.success ? 'success' : 'error',
        last_sync_message: result.success ? `Sincronizado: ${result.processed || 0} campanhas` : result.error,
        next_scheduled_sync_at: new Date(Date.now() + connection.sync_interval_hours * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', connection_id);

    // Log sync end
    await logSync(supabase, {
      connection_id,
      job_id: job.id,
      seller_id: connection.seller_id,
      log_type: 'campaigns',
      log_level: result.success ? 'info' : 'error',
      success: result.success,
      message: result.success ? 'Sync completed successfully' : `Sync failed: ${result.error}`,
      records_processed: result.processed,
      records_created: result.created,
      records_updated: result.updated,
      records_failed: result.failed,
      error_message: result.error,
    });

    console.log(`[ads-connector-sync] Sync ${result.success ? 'completed' : 'failed'} for connection ${connection_id}`);

    return new Response(
      JSON.stringify({
        success: result.success,
        job_id: job.id,
        processed: result.processed,
        created: result.created,
        updated: result.updated,
        failed: result.failed,
        error: result.error,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ads-connector-sync] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ========== ML API Helpers ==========
async function fetchML<T>(
  url: string,
  accessToken: string,
  apiVersion = '2'
): Promise<{ data: T | null; error: string | null }> {
  try {
    console.log(`[ads-connector-sync] Fetching: ${url}`);
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'api-version': apiVersion,
        'Content-Type': 'application/json',
      },
    });

    const text = await response.text();
    console.log(`[ads-connector-sync] Response status: ${response.status}, length: ${text.length}`);

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const errJson = JSON.parse(text);
        errMsg = errJson.message || errJson.error || errMsg;
      } catch {
        // Keep default error message
      }
      return { data: null, error: errMsg };
    }

    if (!text || text.trim() === '') {
      return { data: null, error: null };
    }

    const data = JSON.parse(text) as T;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: String(err) };
  }
}

// Discover advertiser ID for Product Ads
async function getAdvertiserId(accessToken: string): Promise<{ advertiserId: string | null; error: string | null }> {
  const { data, error } = await fetchML<{ results?: { id: string }[] }>(
    'https://api.mercadolibre.com/advertising/advertisers?product_id=PADS',
    accessToken,
    '1'
  );

  if (error) {
    return { advertiserId: null, error };
  }

  if (!data?.results?.length) {
    return { advertiserId: null, error: 'No Product Ads advertiser found for this account' };
  }

  return { advertiserId: data.results[0].id, error: null };
}

// ========== Full Sync ==========
// deno-lint-ignore no-explicit-any
async function executeFullSync(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  // deno-lint-ignore no-explicit-any
  connection: any,
  // deno-lint-ignore no-explicit-any
  job: any,
  accessToken: string
): Promise<SyncResult> {
  const sellerId = connection.seller_id as string;
  const userId = connection.user_id as string;
  const connectionId = connection.id as string;

  // Step 1: Get advertiser ID
  console.log(`[ads-connector-sync] Getting advertiser ID for seller ${sellerId}`);
  const { advertiserId, error: advError } = await getAdvertiserId(accessToken);

  if (advError || !advertiserId) {
    console.log(`[ads-connector-sync] No advertiser found: ${advError}`);
    // Return success with 0 records - seller may not have Product Ads
    return { success: true, processed: 0, total: 0 };
  }

  console.log(`[ads-connector-sync] Found advertiser: ${advertiserId}`);

  // Step 2: Fetch campaigns with metrics
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateFrom = thirtyDaysAgo.toISOString().split('T')[0];

  const metrics = 'clicks,prints,cost,cpc,acos,roas,direct_amount,indirect_amount,total_amount,units_quantity';
  const campaignsUrl = `https://api.mercadolibre.com/advertising/advertisers/${advertiserId}/product_ads/campaigns?limit=50&offset=0&date_from=${dateFrom}&date_to=${today}&metrics=${metrics}`;

  // deno-lint-ignore no-explicit-any
  const { data: campaignsData, error: campaignsError } = await fetchML<any>(campaignsUrl, accessToken);

  if (campaignsError) {
    return { success: false, error: `Failed to fetch campaigns: ${campaignsError}` };
  }

  const campaigns = campaignsData?.results || [];
  console.log(`[ads-connector-sync] Fetched ${campaigns.length} campaigns`);

  let created = 0;
  let updated = 0;
  let totalSpent = 0;
  let totalRevenue = 0;

  // deno-lint-ignore no-explicit-any
  for (const campaign of campaigns as any[]) {
    const mlCampaignId = String(campaign.id || campaign.campaign_id);
    const name = String(campaign.name || campaign.title || 'Campaign');
    const status = String(campaign.status || 'unknown').toLowerCase();
    const campaignType = String(campaign.type || campaign.campaign_type || 'product_ads');
    const dailyBudget = Number(campaign.daily_budget) || null;
    const totalBudget = Number(campaign.total_budget) || null;
    
    // Metrics from API
    // deno-lint-ignore no-explicit-any
    const metricsData = (campaign.metrics as any) || campaign;
    const spent = Number(metricsData.cost) || 0;
    const clicks = Number(metricsData.clicks) || 0;
    const impressions = Number(metricsData.prints) || 0;
    const revenue = Number(metricsData.total_amount) || Number(metricsData.direct_amount) || 0;

    totalSpent += spent;
    totalRevenue += revenue;

    // Upsert campaign
    const { data: existingCampaign } = await supabase
      .from('ads_campaigns')
      .select('id')
      .eq('ml_campaign_id', mlCampaignId)
      .eq('seller_id', sellerId)
      .maybeSingle();

    if (existingCampaign) {
      await supabase
        .from('ads_campaigns')
        .update({
          name,
          status,
          campaign_type: campaignType,
          daily_budget: dailyBudget,
          total_budget: totalBudget,
          spent_total: spent,
          raw_data: campaign,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingCampaign.id);
      updated++;
    } else {
      await supabase
        .from('ads_campaigns')
        .insert({
          ml_campaign_id: mlCampaignId,
          seller_id: sellerId,
          user_id: userId,
          workspace_id: connection.workspace_id || null,
          name,
          status,
          campaign_type: campaignType,
          daily_budget: dailyBudget,
          total_budget: totalBudget,
          spent_total: spent,
          raw_data: campaign,
          synced_at: new Date().toISOString(),
        });
      created++;
    }

    // Insert daily metrics if we have data
    if (clicks > 0 || spent > 0 || impressions > 0) {
      // Get campaign internal ID
      const { data: campaignRecord } = await supabase
        .from('ads_campaigns')
        .select('id')
        .eq('ml_campaign_id', mlCampaignId)
        .eq('seller_id', sellerId)
        .maybeSingle();

      if (campaignRecord) {
        const roas = spent > 0 ? revenue / spent : 0;
        const acos = revenue > 0 ? (spent / revenue) * 100 : 0;

        await supabase
          .from('ads_daily_metrics')
          .upsert({
            seller_id: sellerId,
            user_id: userId,
            campaign_id: campaignRecord.id,
            metric_date: today,
            impressions,
            clicks,
            spent,
            revenue,
            roas,
            acos,
          }, {
            onConflict: 'campaign_id,metric_date',
            ignoreDuplicates: false,
          });
      }
    }

    await delay(RATE_LIMIT_DELAY_MS);
  }

  // Create snapshot
  await supabase.from('ads_snapshots').insert({
    connection_id: connectionId,
    seller_id: sellerId,
    job_id: job.id,
    snapshot_type: 'full',
    snapshot_date: today,
    snapshot_hour: new Date().getHours(),
    data_json: { campaigns: campaigns.length, spent: totalSpent, revenue: totalRevenue },
    record_count: campaigns.length,
    is_valid: true,
  });

  // Update data freshness
  await supabase.from('ads_data_freshness').upsert({
    connection_id: connectionId,
    seller_id: sellerId,
    data_type: 'campaigns',
    last_successful_sync_at: new Date().toISOString(),
    last_sync_attempt_at: new Date().toISOString(),
    cached_record_count: campaigns.length,
    is_stale: false,
    consecutive_failures: 0,
  }, {
    onConflict: 'connection_id,data_type',
  });

  return {
    success: true,
    processed: campaigns.length,
    created,
    updated,
    total: campaigns.length,
  };
}

// ========== Helpers ==========
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// deno-lint-ignore no-explicit-any
async function logSync(supabase: any, data: Record<string, unknown>): Promise<void> {
  await supabase.from('ads_sync_logs').insert({
    connection_id: data.connection_id,
    job_id: data.job_id,
    seller_id: data.seller_id,
    log_type: data.log_type || 'general',
    log_level: data.log_level || 'info',
    message: data.message,
    success: data.success ?? null,
    records_processed: data.records_processed ?? null,
    records_created: data.records_created ?? null,
    records_updated: data.records_updated ?? null,
    records_failed: data.records_failed ?? null,
    error_message: data.error_message ?? null,
    details: data.details ?? null,
    started_at: new Date().toISOString(),
  });
}
