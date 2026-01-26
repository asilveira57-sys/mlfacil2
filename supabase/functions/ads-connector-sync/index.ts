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

interface RateLimitState {
  remaining: number;
  resetAt: Date | null;
  retryAfter: number;
}

const RATE_LIMIT_DELAY_MS = 200; // 200ms between requests
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    // Execute sync based on job type
    let result: SyncResult;
    
    try {
      switch (job_type) {
        case 'full':
          result = await executeFullSync(supabase, connection, job);
          break;
        case 'campaigns':
          result = await syncCampaigns(supabase, connection, job);
          break;
        case 'ad_groups':
          result = await syncAdGroups(supabase, connection, job);
          break;
        case 'items':
          result = await syncItems(supabase, connection, job);
          break;
        case 'metrics':
        case 'daily_metrics':
          result = await syncMetrics(supabase, connection, job, date_from, date_to);
          break;
        case 'incremental':
          result = await executeIncrementalSync(supabase, connection, job);
          break;
        default:
          result = { success: false, error: 'Unknown job type' };
      }
    } catch (syncError) {
      result = { 
        success: false, 
        error: syncError instanceof Error ? syncError.message : 'Sync failed',
      };
    }

    // Update job status
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

    await supabase
      .from('ads_sync_jobs')
      .update(jobUpdate)
      .eq('id', job.id);

    // Update connection last sync info
    await supabase
      .from('ads_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: result.success ? 'success' : 'error',
        last_sync_message: result.success ? `Sincronizado: ${result.processed || 0} registros` : result.error,
        next_scheduled_sync_at: new Date(Date.now() + connection.sync_interval_hours * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', connection_id);

    // Log sync end
    await logSync(supabase, {
      connection_id,
      job_id: job.id,
      seller_id: connection.seller_id,
      log_type: job_type === 'full' ? 'campaigns' : job_type,
      log_level: result.success ? 'info' : 'error',
      success: result.success,
      message: result.success ? 'Sync completed successfully' : `Sync failed: ${result.error}`,
      records_processed: result.processed,
      records_created: result.created,
      records_updated: result.updated,
      records_failed: result.failed,
      error_message: result.error,
    });

    // Update data freshness
    if (result.success) {
      await updateDataFreshness(supabase, connection_id, connection.seller_id, job_type, true);
    } else {
      await updateDataFreshness(supabase, connection_id, connection.seller_id, job_type, false);
    }

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

interface SyncResult {
  success: boolean;
  processed?: number;
  created?: number;
  updated?: number;
  failed?: number;
  total?: number;
  error?: string;
}

// Full sync: campaigns → ad groups → items → metrics
async function executeFullSync(supabase: any, connection: any, job: any): Promise<SyncResult> {
  const results: SyncResult[] = [];

  // Sync in order
  results.push(await syncCampaigns(supabase, connection, job));
  if (!results[0].success) return results[0];

  await delay(RATE_LIMIT_DELAY_MS);
  results.push(await syncAdGroups(supabase, connection, job));
  
  await delay(RATE_LIMIT_DELAY_MS);
  results.push(await syncItems(supabase, connection, job));

  await delay(RATE_LIMIT_DELAY_MS);
  results.push(await syncMetrics(supabase, connection, job));

  // Aggregate results
  const aggregated: SyncResult = {
    success: results.every(r => r.success),
    processed: results.reduce((sum, r) => sum + (r.processed || 0), 0),
    created: results.reduce((sum, r) => sum + (r.created || 0), 0),
    updated: results.reduce((sum, r) => sum + (r.updated || 0), 0),
    failed: results.reduce((sum, r) => sum + (r.failed || 0), 0),
    total: results.reduce((sum, r) => sum + (r.total || 0), 0),
  };

  if (!aggregated.success) {
    aggregated.error = results.find(r => r.error)?.error;
  }

  // Create full snapshot
  await createSnapshot(supabase, connection.id, connection.seller_id, job.id, 'full');

  return aggregated;
}

// Incremental sync: only metrics for recent days
async function executeIncrementalSync(supabase: any, connection: any, job: any): Promise<SyncResult> {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  return syncMetrics(supabase, connection, job, 
    sevenDaysAgo.toISOString().split('T')[0],
    today.toISOString().split('T')[0]
  );
}

// Sync campaigns - stub for future ML API integration
async function syncCampaigns(supabase: any, connection: any, job: any): Promise<SyncResult> {
  console.log(`[ads-connector-sync] Syncing campaigns for seller ${connection.seller_id}`);
  
  // For now, consolidate existing ads_campaigns data into staging
  const { data: existingCampaigns, error } = await supabase
    .from('ads_campaigns')
    .select('*')
    .eq('seller_id', connection.seller_id);

  if (error) {
    return { success: false, error: `Failed to fetch campaigns: ${error.message}` };
  }

  let created = 0;
  let updated = 0;

  for (const campaign of (existingCampaigns || [])) {
    // Insert into staging
    await supabase
      .from('ads_staging_campaigns')
      .insert({
        job_id: job.id,
        connection_id: connection.id,
        seller_id: connection.seller_id,
        ml_campaign_id: campaign.ml_campaign_id,
        raw_data: campaign,
        name: campaign.name,
        status: campaign.status,
        campaign_type: campaign.campaign_type,
        daily_budget: campaign.daily_budget,
        total_budget: campaign.total_budget,
        start_date: campaign.start_date,
        end_date: campaign.end_date,
        is_processed: true,
        processed_at: new Date().toISOString(),
      });
    created++;
  }

  // Create snapshot
  await createSnapshot(supabase, connection.id, connection.seller_id, job.id, 'campaigns', existingCampaigns);

  return {
    success: true,
    processed: existingCampaigns?.length || 0,
    created,
    updated,
    total: existingCampaigns?.length || 0,
  };
}

// Sync ad groups - stub for future ML API integration
async function syncAdGroups(supabase: any, connection: any, job: any): Promise<SyncResult> {
  console.log(`[ads-connector-sync] Syncing ad groups for seller ${connection.seller_id}`);

  const { data: existingGroups, error } = await supabase
    .from('ads_ad_groups')
    .select('*')
    .eq('seller_id', connection.seller_id);

  if (error) {
    return { success: false, error: `Failed to fetch ad groups: ${error.message}` };
  }

  let created = 0;

  for (const group of (existingGroups || [])) {
    await supabase
      .from('ads_staging_ad_groups')
      .insert({
        job_id: job.id,
        connection_id: connection.id,
        seller_id: connection.seller_id,
        ml_ad_group_id: group.ml_ad_group_id,
        ml_campaign_id: group.campaign_id,
        raw_data: group,
        name: group.name,
        status: group.status,
        default_bid: group.default_bid,
        is_processed: true,
        processed_at: new Date().toISOString(),
      });
    created++;
  }

  await createSnapshot(supabase, connection.id, connection.seller_id, job.id, 'ad_groups', existingGroups);

  return {
    success: true,
    processed: existingGroups?.length || 0,
    created,
    total: existingGroups?.length || 0,
  };
}

// Sync items - stub for future ML API integration
async function syncItems(supabase: any, connection: any, job: any): Promise<SyncResult> {
  console.log(`[ads-connector-sync] Syncing items for seller ${connection.seller_id}`);

  const { data: existingItems, error } = await supabase
    .from('ads_items')
    .select('*')
    .eq('seller_id', connection.seller_id);

  if (error) {
    return { success: false, error: `Failed to fetch items: ${error.message}` };
  }

  let created = 0;

  for (const item of (existingItems || [])) {
    await supabase
      .from('ads_staging_items')
      .insert({
        job_id: job.id,
        connection_id: connection.id,
        seller_id: connection.seller_id,
        item_id: item.item_id,
        ml_ad_group_id: item.ad_group_id,
        raw_data: item,
        title: item.title,
        status: item.status,
        bid: item.bid,
        current_price: item.current_price,
        is_processed: true,
        processed_at: new Date().toISOString(),
      });
    created++;
  }

  await createSnapshot(supabase, connection.id, connection.seller_id, job.id, 'items', existingItems);

  return {
    success: true,
    processed: existingItems?.length || 0,
    created,
    total: existingItems?.length || 0,
  };
}

// Sync metrics - stub for future ML API integration
async function syncMetrics(
  supabase: any, 
  connection: any, 
  job: any,
  dateFrom?: string,
  dateTo?: string
): Promise<SyncResult> {
  console.log(`[ads-connector-sync] Syncing metrics for seller ${connection.seller_id}`);

  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const from = dateFrom || thirtyDaysAgo.toISOString().split('T')[0];
  const to = dateTo || today;

  let query = supabase
    .from('ads_daily_metrics')
    .select('*')
    .eq('seller_id', connection.seller_id)
    .gte('metric_date', from)
    .lte('metric_date', to);

  const { data: existingMetrics, error } = await query;

  if (error) {
    return { success: false, error: `Failed to fetch metrics: ${error.message}` };
  }

  let created = 0;

  for (const metric of (existingMetrics || [])) {
    await supabase
      .from('ads_staging_metrics')
      .insert({
        job_id: job.id,
        connection_id: connection.id,
        seller_id: connection.seller_id,
        entity_type: metric.item_id ? 'item' : 'campaign',
        entity_id: metric.item_id || metric.campaign_id,
        metric_date: metric.metric_date,
        raw_data: metric,
        impressions: metric.impressions,
        clicks: metric.clicks,
        conversions: metric.conversions,
        spent: metric.spent,
        revenue: metric.revenue,
        is_processed: true,
        processed_at: new Date().toISOString(),
      });
    created++;
  }

  await createSnapshot(supabase, connection.id, connection.seller_id, job.id, 'metrics', existingMetrics);

  return {
    success: true,
    processed: existingMetrics?.length || 0,
    created,
    total: existingMetrics?.length || 0,
  };
}

// Create a snapshot of current data state
async function createSnapshot(
  supabase: any,
  connectionId: string,
  sellerId: string,
  jobId: string,
  snapshotType: string,
  data?: any[]
): Promise<void> {
  const now = new Date();
  
  await supabase
    .from('ads_snapshots')
    .insert({
      connection_id: connectionId,
      seller_id: sellerId,
      job_id: jobId,
      snapshot_type: snapshotType,
      snapshot_date: now.toISOString().split('T')[0],
      snapshot_hour: now.getHours(),
      data_json: data || [],
      record_count: data?.length || 0,
      is_valid: true,
    });
}

// Update data freshness tracking
async function updateDataFreshness(
  supabase: any,
  connectionId: string,
  sellerId: string,
  dataType: string,
  success: boolean
): Promise<void> {
  const mappedType = dataType === 'full' ? 'campaigns' : 
                     dataType === 'incremental' ? 'daily_metrics' :
                     dataType === 'metrics' ? 'daily_metrics' : dataType;

  const { data: existing } = await supabase
    .from('ads_data_freshness')
    .select('id, consecutive_failures')
    .eq('connection_id', connectionId)
    .eq('data_type', mappedType)
    .single();

  const now = new Date().toISOString();
  const consecutiveFailures = success ? 0 : (existing?.consecutive_failures || 0) + 1;
  const isStale = consecutiveFailures >= 3;

  const freshnessData = {
    connection_id: connectionId,
    seller_id: sellerId,
    data_type: mappedType,
    last_sync_attempt_at: now,
    consecutive_failures: consecutiveFailures,
    is_stale: isStale,
    ...(success ? { last_successful_sync_at: now } : {}),
  };

  if (existing) {
    await supabase
      .from('ads_data_freshness')
      .update(freshnessData)
      .eq('id', existing.id);
  } else {
    await supabase
      .from('ads_data_freshness')
      .insert(freshnessData);
  }
}

// Log sync activity
async function logSync(supabase: any, logData: {
  connection_id: string;
  job_id?: string;
  seller_id: string;
  log_type: string;
  log_level: string;
  success?: boolean;
  message?: string;
  details?: any;
  records_fetched?: number;
  records_processed?: number;
  records_created?: number;
  records_updated?: number;
  records_failed?: number;
  error_code?: string;
  error_message?: string;
}): Promise<void> {
  await supabase
    .from('ads_sync_logs')
    .insert({
      ...logData,
      started_at: new Date().toISOString(),
      ended_at: logData.success !== undefined ? new Date().toISOString() : null,
    });
}

// Utility delay function with async/await
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
