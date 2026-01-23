/**
 * trends-nightly-public
 * Job noturno para coleta de tendências públicas do mercado.
 * Roda via cron (02:00 BRT) ou manual (admin).
 * 
 * Funcionalidades v2:
 * - Lock global com auto-recovery de jobs stuck
 * - Timeout global (50min) com checkpoints
 * - Rate limiting inteligente (20 req/min)
 * - Coleta recursiva de subcategorias até nível 2
 * - Fallback de keywords via títulos de highlights
 * - 25+ categorias principais
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ML_APP_ID = Deno.env.get('ML_APP_ID')!;
const ML_SECRET_KEY = Deno.env.get('ML_SECRET_KEY')!;

// =====================================================
// CONSTANTS & CONFIGURATION
// =====================================================
const JOB_NAME = 'public_trends_nightly';
const LOCK_KEY = 'public_trends_nightly';
const LOCK_TTL_MINUTES = 60;

// Timeout and rate limiting
const JOB_TIMEOUT_MS = 50 * 60 * 1000; // 50 minutes (safe margin for 55min edge limit)
const REQUEST_TIMEOUT_MS = 15000;
const RATE_LIMIT_DELAY_MS = 800; // Increased from 500
const RETRY_DELAYS = [1000, 2000, 4000];
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

// Subcategory collection settings
const MAX_SUBCATEGORIES_PER_LEVEL = 10; // Increased from 5
const MAX_SUBCATEGORY_DEPTH = 2; // Collect level 1 and level 2

// Global rate limiter
interface RateLimiter {
  requestsThisMinute: number;
  lastResetTime: number;
  maxPerMinute: number;
}

const rateLimiter: RateLimiter = {
  requestsThisMinute: 0,
  lastResetTime: Date.now(),
  maxPerMinute: 20,
};

async function checkRateLimit(): Promise<void> {
  const now = Date.now();
  
  // Reset counter every minute
  if (now - rateLimiter.lastResetTime > 60000) {
    rateLimiter.requestsThisMinute = 0;
    rateLimiter.lastResetTime = now;
  }
  
  // If at limit, wait until next minute
  if (rateLimiter.requestsThisMinute >= rateLimiter.maxPerMinute) {
    const waitTime = 60000 - (now - rateLimiter.lastResetTime) + 1000;
    console.log(`[RateLimiter] Waiting ${Math.round(waitTime / 1000)}s to reset`);
    await sleep(waitTime);
    rateLimiter.requestsThisMinute = 0;
    rateLimiter.lastResetTime = Date.now();
  }
  
  rateLimiter.requestsThisMinute++;
}

interface JobMetrics {
  categoriesProcessed: number;
  categoriesFailed: number;
  subcategoriesProcessed: number;
  keywordsSaved: number;
  highlightsSaved: number;
  itemsEnriched: number;
}

interface CategoryConfig {
  id: string;
  name: string;
  is_active: boolean;
  priority: number;
  parent_id: string | null;
  depth: number;
  collect_subcategories: boolean;
}

interface SubcategoryInfo {
  id: string;
  name: string;
  parent_id: string;
  depth: number;
  path: string[];
  total_items_in_category?: number;
}

// Global job state for timeout checking
let jobStartTime: number;

function isTimedOut(): boolean {
  return Date.now() - jobStartTime > JOB_TIMEOUT_MS;
}

function getRemainingTime(): number {
  return Math.max(0, JOB_TIMEOUT_MS - (Date.now() - jobStartTime));
}

// =====================================================
// MAIN HANDLER
// =====================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const logPrefix = '[trends-nightly-public]';
  jobStartTime = Date.now();
  console.log(`${logPrefix} Job started at ${new Date().toISOString()}`);

  try {
    // 0) Auto-recover stuck jobs (running > 1 hour)
    const { data: stuckJobs } = await supabase
      .from('job_runs')
      .update({ 
        status: 'failed', 
        error_message: 'Timeout auto-recovery',
        finished_at: new Date().toISOString()
      })
      .eq('job_name', JOB_NAME)
      .eq('status', 'running')
      .lt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .select('id');
    
    if (stuckJobs?.length) {
      console.log(`${logPrefix} Recovered ${stuckJobs.length} stuck jobs`);
    }

    // Clean expired locks
    await supabase
      .from('job_locks')
      .delete()
      .lt('expires_at', new Date().toISOString());

    // 1) Try to acquire lock
    const lockAcquired = await acquireLock(supabase, LOCK_KEY, LOCK_TTL_MINUTES);
    if (!lockAcquired) {
      console.log(`${logPrefix} Lock already held, skipping execution`);
      
      await supabase.from('job_runs').insert({
        job_name: JOB_NAME,
        status: 'skipped',
        finished_at: new Date().toISOString(),
        error_message: 'Lock already held by another execution',
      });

      return new Response(JSON.stringify({ status: 'skipped', message: 'Another execution in progress' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) Create job run record
    const { data: jobRun, error: jobError } = await supabase
      .from('job_runs')
      .insert({ job_name: JOB_NAME, status: 'running' })
      .select('id')
      .single();

    if (jobError || !jobRun) {
      console.error(`${logPrefix} Failed to create job run:`, jobError);
      await releaseLock(supabase, LOCK_KEY);
      throw new Error('Failed to create job run');
    }

    const jobRunId = jobRun.id;
    console.log(`${logPrefix} Created job run: ${jobRunId}`);

    // 3) Get active ML account for API calls
    const { data: mlAccount, error: accError } = await supabase
      .from('ml_accounts')
      .select('ml_user_id, access_token, refresh_token, token_expires_at, user_id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (accError || !mlAccount) {
      console.error(`${logPrefix} No active ML account found`);
      await finalizeJobRun(supabase, jobRunId, 'failed', createEmptyMetrics(), 'No active ML account');
      await releaseLock(supabase, LOCK_KEY);
      return new Response(JSON.stringify({ status: 'failed', error: 'No active ML account' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Refresh token if needed
    let accessToken = mlAccount.access_token;
    if (new Date(mlAccount.token_expires_at) < new Date()) {
      const refreshed = await refreshToken(supabase, mlAccount.ml_user_id, mlAccount.user_id, mlAccount.refresh_token);
      if (!refreshed) {
        console.error(`${logPrefix} Token refresh failed`);
        await finalizeJobRun(supabase, jobRunId, 'failed', createEmptyMetrics(), 'Token refresh failed');
        await releaseLock(supabase, LOCK_KEY);
        return new Response(JSON.stringify({ status: 'failed', error: 'Token refresh failed' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      accessToken = refreshed;
    }

    // 4) Get categories from public_categories
    const { data: categories, error: catError } = await supabase
      .from('public_categories')
      .select('id, name, is_active, priority, parent_id, depth, collect_subcategories')
      .eq('is_active', true)
      .is('parent_id', null)
      .order('priority', { ascending: true });

    if (catError) {
      console.error(`${logPrefix} Failed to fetch categories:`, catError);
      await finalizeJobRun(supabase, jobRunId, 'failed', createEmptyMetrics(), 'Failed to fetch categories');
      await releaseLock(supabase, LOCK_KEY);
      throw new Error('Failed to fetch categories');
    }

    const activeCategories: CategoryConfig[] = categories || [];
    console.log(`${logPrefix} Processing ${activeCategories.length} main categories`);

    // 5) Process categories sequentially
    const metrics: JobMetrics = createEmptyMetrics();
    const today = new Date().toISOString().split('T')[0];
    const siteId = 'MLB';

    for (const category of activeCategories) {
      // Check timeout before each category
      if (isTimedOut()) {
        console.log(`${logPrefix} Timeout reached, stopping gracefully`);
        break;
      }

      const catPrefix = `${logPrefix}[${category.id}]`;
      console.log(`${catPrefix} Starting... (remaining: ${Math.round(getRemainingTime() / 1000)}s)`);

      try {
        // a) Collect trends/keywords for main category
        await checkRateLimit();
        const trendsResult = await collectTrendsWithRetry(supabase, jobRunId, siteId, category.id, today, accessToken);
        if (trendsResult.success) {
          metrics.keywordsSaved += trendsResult.count;
        }
        await sleep(RATE_LIMIT_DELAY_MS);

        // b) Collect highlights (skip for __ROOT__)
        if (category.id !== '__ROOT__') {
          await checkRateLimit();
          const highlightsResult = await collectHighlightsWithRetry(supabase, jobRunId, siteId, category.id, today, accessToken);
          if (highlightsResult.success) {
            metrics.highlightsSaved += highlightsResult.snapshotSaved ? 1 : 0;
            metrics.itemsEnriched += highlightsResult.itemsEnriched;
          }
          await sleep(RATE_LIMIT_DELAY_MS);
        }

        // c) Recursively process subcategories if enabled
        if (category.collect_subcategories && category.id !== '__ROOT__') {
          const subcatMetrics = await processSubcategoriesRecursive(
            supabase,
            jobRunId,
            siteId,
            category.id,
            today,
            accessToken,
            1, // Start at depth 1
            [category.id]
          );
          
          metrics.subcategoriesProcessed += subcatMetrics.subcategoriesProcessed;
          metrics.keywordsSaved += subcatMetrics.keywordsSaved;
          metrics.highlightsSaved += subcatMetrics.highlightsSaved;
          metrics.itemsEnriched += subcatMetrics.itemsEnriched;
        }

        metrics.categoriesProcessed++;
        console.log(`${catPrefix} Completed successfully`);
      } catch (error) {
        console.error(`${catPrefix} Failed:`, error);
        metrics.categoriesFailed++;
        
        await supabase.from('job_run_steps').insert({
          job_run_id: jobRunId,
          category_id: category.id,
          step_type: 'category',
          status: 'failed',
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 6) Determine final status
    let finalStatus: 'success' | 'partial_success' | 'failed';
    if (metrics.categoriesFailed === 0 && !isTimedOut()) {
      finalStatus = 'success';
    } else if (metrics.categoriesProcessed > 0) {
      finalStatus = 'partial_success';
    } else {
      finalStatus = 'failed';
    }

    // 7) Finalize job run
    await finalizeJobRun(supabase, jobRunId, finalStatus, metrics, isTimedOut() ? 'Completed with timeout' : null);

    // 8) Update public_trends_status
    await updatePublicTrendsStatus(supabase, finalStatus, metrics, activeCategories.length);

    // 9) Release lock
    await releaseLock(supabase, LOCK_KEY);

    const duration = Math.round((Date.now() - jobStartTime) / 1000);
    console.log(`${logPrefix} Job completed in ${duration}s with status: ${finalStatus}`, metrics);

    return new Response(JSON.stringify({ 
      status: finalStatus, 
      metrics,
      jobRunId,
      durationSeconds: duration,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`${logPrefix} Unhandled error:`, error);
    await releaseLock(supabase, LOCK_KEY);
    
    return new Response(JSON.stringify({ 
      status: 'failed', 
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function createEmptyMetrics(): JobMetrics {
  return {
    categoriesProcessed: 0,
    categoriesFailed: 0,
    subcategoriesProcessed: 0,
    keywordsSaved: 0,
    highlightsSaved: 0,
    itemsEnriched: 0,
  };
}

// =====================================================
// RECURSIVE SUBCATEGORY PROCESSING
// =====================================================

interface SubcategoryMetrics {
  subcategoriesProcessed: number;
  keywordsSaved: number;
  highlightsSaved: number;
  itemsEnriched: number;
}

async function processSubcategoriesRecursive(
  supabase: any,
  jobRunId: string,
  siteId: string,
  parentCategoryId: string,
  today: string,
  accessToken: string,
  currentDepth: number,
  path: string[]
): Promise<SubcategoryMetrics> {
  const metrics: SubcategoryMetrics = {
    subcategoriesProcessed: 0,
    keywordsSaved: 0,
    highlightsSaved: 0,
    itemsEnriched: 0,
  };

  // Check depth and timeout
  if (currentDepth > MAX_SUBCATEGORY_DEPTH || isTimedOut()) {
    return metrics;
  }

  const prefix = `[processSubcategories][${parentCategoryId}][depth=${currentDepth}]`;
  console.log(`${prefix} Fetching subcategories...`);

  try {
    await checkRateLimit();
    const subcategories = await fetchSubcategories(siteId, parentCategoryId, accessToken);
    console.log(`${prefix} Found ${subcategories.length} subcategories`);

    // Save to cache
    await saveSubcategoriesToCache(supabase, subcategories);

    // Process top N subcategories
    const toProcess = subcategories.slice(0, MAX_SUBCATEGORIES_PER_LEVEL);

    for (const subcat of toProcess) {
      if (isTimedOut()) {
        console.log(`${prefix} Timeout reached, stopping subcategory processing`);
        break;
      }

      try {
        console.log(`${prefix} Processing ${subcat.id}...`);
        
        // Collect trends
        await checkRateLimit();
        const trendsResult = await collectTrendsWithRetry(supabase, jobRunId, siteId, subcat.id, today, accessToken);
        if (trendsResult.success) {
          metrics.keywordsSaved += trendsResult.count;
        }
        await sleep(RATE_LIMIT_DELAY_MS);

        // Collect highlights
        await checkRateLimit();
        const highlightsResult = await collectHighlightsWithRetry(supabase, jobRunId, siteId, subcat.id, today, accessToken);
        if (highlightsResult.success) {
          metrics.highlightsSaved += highlightsResult.snapshotSaved ? 1 : 0;
          metrics.itemsEnriched += highlightsResult.itemsEnriched;
        }
        await sleep(RATE_LIMIT_DELAY_MS);

        metrics.subcategoriesProcessed++;

        // Recurse to next level
        if (currentDepth < MAX_SUBCATEGORY_DEPTH) {
          const childMetrics = await processSubcategoriesRecursive(
            supabase,
            jobRunId,
            siteId,
            subcat.id,
            today,
            accessToken,
            currentDepth + 1,
            [...path, subcat.id]
          );
          
          metrics.subcategoriesProcessed += childMetrics.subcategoriesProcessed;
          metrics.keywordsSaved += childMetrics.keywordsSaved;
          metrics.highlightsSaved += childMetrics.highlightsSaved;
          metrics.itemsEnriched += childMetrics.itemsEnriched;
        }
      } catch (error) {
        console.error(`${prefix} Subcategory ${subcat.id} failed:`, error);
      }
    }
  } catch (error) {
    console.error(`${prefix} Error fetching subcategories:`, error);
  }

  return metrics;
}

// =====================================================
// SUBCATEGORIES FETCHING
// =====================================================

async function fetchSubcategories(
  siteId: string,
  categoryId: string,
  accessToken: string
): Promise<SubcategoryInfo[]> {
  const prefix = `[fetchSubcategories][${categoryId}]`;
  
  try {
    const url = `https://api.mercadolibre.com/categories/${categoryId}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      console.error(`${prefix} Failed: ${response.status} - ${text}`);
      return [];
    }

    const categoryData = await response.json();
    const childrenIds = categoryData.children_categories || [];
    
    const subcategories: SubcategoryInfo[] = childrenIds.map((child: any) => ({
      id: child.id,
      name: child.name,
      parent_id: categoryId,
      depth: 1,
      path: [categoryId, child.id],
      total_items_in_category: child.total_items_in_category || 0,
    }));

    // Sort by total_items_in_category descending (most relevant first)
    subcategories.sort((a, b) => (b.total_items_in_category || 0) - (a.total_items_in_category || 0));

    return subcategories;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error(`${prefix} Timeout`);
    } else {
      console.error(`${prefix} Error:`, error);
    }
    return [];
  }
}

async function saveSubcategoriesToCache(
  supabase: any,
  subcategories: SubcategoryInfo[]
): Promise<void> {
  if (subcategories.length === 0) return;

  const rows = subcategories.map((sub) => ({
    id: sub.id,
    parent_id: sub.parent_id,
    name: sub.name,
    path: sub.path,
    depth: sub.depth,
    total_items_qty: sub.total_items_in_category || 0,
    fetched_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('category_tree_cache')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    console.error('[saveSubcategoriesToCache] Error:', error);
  }
}

// =====================================================
// LOCK MANAGEMENT
// =====================================================

async function acquireLock(supabase: any, lockKey: string, ttlMinutes: number): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  // Try to delete expired locks first
  await supabase
    .from('job_locks')
    .delete()
    .eq('lock_key', lockKey)
    .lt('expires_at', now.toISOString());

  // Try to insert new lock
  const { error } = await supabase
    .from('job_locks')
    .insert({
      lock_key: lockKey,
      locked_at: now.toISOString(),
      locked_by: 'trends-nightly-public',
      expires_at: expiresAt.toISOString(),
    });

  if (error) {
    console.log('[acquireLock] Lock already held:', error.message);
    return false;
  }

  return true;
}

async function releaseLock(supabase: any, lockKey: string): Promise<void> {
  await supabase
    .from('job_locks')
    .delete()
    .eq('lock_key', lockKey);
}

// =====================================================
// TOKEN REFRESH
// =====================================================

async function refreshToken(supabase: any, sellerId: string, userId: string, refreshTokenValue: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ML_APP_ID,
        client_secret: ML_SECRET_KEY,
        refresh_token: refreshTokenValue,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[refreshToken] Failed:', response.status, errText);
      return null;
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    await supabase
      .from('ml_accounts')
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('ml_user_id', sellerId)
      .eq('user_id', userId);

    return data.access_token;
  } catch (error) {
    console.error('[refreshToken] Error:', error);
    return null;
  }
}

// =====================================================
// TRENDS COLLECTION
// =====================================================

interface TrendsResult {
  success: boolean;
  count: number;
}

async function collectTrendsWithRetry(
  supabase: any,
  jobRunId: string,
  siteId: string,
  categoryId: string,
  today: string,
  accessToken: string
): Promise<TrendsResult> {
  const stepStart = new Date().toISOString();
  let lastError: string | null = null;
  let retryCount = 0;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const result = await collectTrends(supabase, siteId, categoryId, today, accessToken);
      
      // If no trends found, try keyword extraction fallback
      if (result.count === 0) {
        const fallbackResult = await extractKeywordsFromHighlights(supabase, siteId, categoryId, today);
        if (fallbackResult.count > 0) {
          result.count = fallbackResult.count;
          result.success = true;
        }
      }
      
      await supabase.from('job_run_steps').insert({
        job_run_id: jobRunId,
        category_id: categoryId,
        step_type: 'trends',
        status: 'success',
        started_at: stepStart,
        finished_at: new Date().toISOString(),
        items_count: result.count,
        retry_count: retryCount,
      });

      return result;
    } catch (error: any) {
      lastError = error?.message || String(error);
      const statusCode = error?.statusCode;

      if (RETRYABLE_STATUS_CODES.includes(statusCode) && attempt < RETRY_DELAYS.length) {
        console.log(`[collectTrendsWithRetry] Retry ${attempt + 1} for ${categoryId} after ${RETRY_DELAYS[attempt]}ms`);
        await sleep(RETRY_DELAYS[attempt]);
        retryCount++;
        continue;
      }

      await supabase.from('job_run_steps').insert({
        job_run_id: jobRunId,
        category_id: categoryId,
        step_type: 'trends',
        status: 'failed',
        started_at: stepStart,
        finished_at: new Date().toISOString(),
        error_code: String(statusCode || 'unknown'),
        error_message: lastError,
        retry_count: retryCount,
      });

      return { success: false, count: 0 };
    }
  }

  return { success: false, count: 0 };
}

async function collectTrends(
  supabase: any,
  siteId: string,
  categoryId: string,
  today: string,
  accessToken: string
): Promise<TrendsResult> {
  const categoryValue = categoryId === '__ROOT__' ? null : categoryId;
  let url = `https://api.mercadolibre.com/trends/${siteId}`;
  if (categoryValue) {
    url += `/${categoryValue}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[collectTrends] ${categoryId} status=${response.status} body=${errText}`);
      const error: any = new Error(`Trends API error: ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }

    const trendsData = await response.json();
    const trendsCount = Array.isArray(trendsData) ? trendsData.length : 0;

    // Upsert trend snapshot
    const categoryDbValue = categoryValue || '__ROOT__';
    const { data: existing } = await supabase
      .from('trend_snapshots')
      .select('id')
      .eq('site_id', siteId)
      .eq('category_id', categoryDbValue)
      .eq('snapshot_date', today)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('trend_snapshots')
        .update({ trends_data: trendsData })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('trend_snapshots')
        .insert({
          site_id: siteId,
          category_id: categoryDbValue,
          snapshot_date: today,
          trends_data: trendsData,
        });
    }

    console.log(`[collectTrends] ${categoryId} saved ${trendsCount} trends`);
    return { success: true, count: trendsCount };

  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      const err: any = new Error('Request timeout');
      err.statusCode = 504;
      throw err;
    }
    throw error;
  }
}

// Fallback: extract keywords from highlight titles when trends API returns empty
async function extractKeywordsFromHighlights(
  supabase: any,
  siteId: string,
  categoryId: string,
  today: string
): Promise<TrendsResult> {
  const prefix = `[extractKeywordsFromHighlights][${categoryId}]`;
  
  try {
    // Get recent highlights for this category
    const { data: highlights } = await supabase
      .from('highlights_items')
      .select('title, snapshot_id')
      .eq('snapshot_id', supabase.from('highlights_snapshots')
        .select('id')
        .eq('category_id', categoryId)
        .order('snapshot_date', { ascending: false })
        .limit(1))
      .limit(20);
    
    if (!highlights?.length) {
      console.log(`${prefix} No highlights found for keyword extraction`);
      return { success: false, count: 0 };
    }

    // Extract keywords from titles
    const wordCounts = new Map<string, number>();
    const stopWords = new Set(['de', 'para', 'com', 'em', 'e', 'ou', 'a', 'o', 'as', 'os', 'um', 'uma', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'por', 'que', 'se', 'ao', 'à']);
    
    for (const item of highlights) {
      if (!item.title) continue;
      const words = item.title.toLowerCase()
        .replace(/[^\w\sàáâãéêíóôõúç]/g, '')
        .split(/\s+/)
        .filter((w: string) => w.length > 2 && !stopWords.has(w));
      
      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }
    
    // Get top 20 keywords by frequency
    const sortedKeywords = Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([keyword], idx) => ({ keyword, url: `https://lista.mercadolivre.com.br/${encodeURIComponent(keyword)}` }));
    
    if (sortedKeywords.length === 0) {
      return { success: false, count: 0 };
    }

    // Save as synthetic trends
    const categoryDbValue = categoryId === '__ROOT__' ? '__ROOT__' : categoryId;
    const { data: existing } = await supabase
      .from('trend_snapshots')
      .select('id')
      .eq('site_id', siteId)
      .eq('category_id', categoryDbValue)
      .eq('snapshot_date', today)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('trend_snapshots')
        .update({ trends_data: sortedKeywords })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('trend_snapshots')
        .insert({
          site_id: siteId,
          category_id: categoryDbValue,
          snapshot_date: today,
          trends_data: sortedKeywords,
        });
    }

    console.log(`${prefix} Extracted ${sortedKeywords.length} synthetic keywords from titles`);
    return { success: true, count: sortedKeywords.length };
  } catch (error) {
    console.error(`${prefix} Error:`, error);
    return { success: false, count: 0 };
  }
}

// =====================================================
// HIGHLIGHTS COLLECTION
// =====================================================

interface HighlightsResult {
  success: boolean;
  snapshotSaved: boolean;
  itemsEnriched: number;
}

async function collectHighlightsWithRetry(
  supabase: any,
  jobRunId: string,
  siteId: string,
  categoryId: string,
  today: string,
  accessToken: string
): Promise<HighlightsResult> {
  const stepStart = new Date().toISOString();
  let lastError: string | null = null;
  let retryCount = 0;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const result = await collectHighlights(supabase, siteId, categoryId, today, accessToken);
      
      await supabase.from('job_run_steps').insert({
        job_run_id: jobRunId,
        category_id: categoryId,
        step_type: 'highlights',
        status: 'success',
        started_at: stepStart,
        finished_at: new Date().toISOString(),
        items_count: result.itemsEnriched,
        retry_count: retryCount,
      });

      return result;
    } catch (error: any) {
      lastError = error?.message || String(error);
      const statusCode = error?.statusCode;

      if (RETRYABLE_STATUS_CODES.includes(statusCode) && attempt < RETRY_DELAYS.length) {
        console.log(`[collectHighlightsWithRetry] Retry ${attempt + 1} for ${categoryId}`);
        await sleep(RETRY_DELAYS[attempt]);
        retryCount++;
        continue;
      }

      await supabase.from('job_run_steps').insert({
        job_run_id: jobRunId,
        category_id: categoryId,
        step_type: 'highlights',
        status: 'failed',
        started_at: stepStart,
        finished_at: new Date().toISOString(),
        error_code: String(statusCode || 'unknown'),
        error_message: lastError,
        retry_count: retryCount,
      });

      return { success: false, snapshotSaved: false, itemsEnriched: 0 };
    }
  }

  return { success: false, snapshotSaved: false, itemsEnriched: 0 };
}

async function collectHighlights(
  supabase: any,
  siteId: string,
  categoryId: string,
  today: string,
  accessToken: string
): Promise<HighlightsResult> {
  const prefix = `[collectHighlights][${categoryId}]`;

  // 1) Fetch highlights
  const url = `https://api.mercadolibre.com/highlights/${siteId}/category/${categoryId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let highlightsData: any = null;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const text = await response.text();
    console.log(`${prefix} highlights status=${response.status}`);

    if (!response.ok) {
      console.error(`${prefix} highlights error body=${text}`);
      if (response.status === 403) {
        console.log(`${prefix} Trying fallback search`);
        return await collectHighlightsViaSearch(supabase, siteId, categoryId, today, accessToken);
      }
      const error: any = new Error(`Highlights API error: ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }

    highlightsData = text ? JSON.parse(text) : null;
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      const err: any = new Error('Request timeout');
      err.statusCode = 504;
      throw err;
    }
    throw error;
  }

  const content: any[] = Array.isArray(highlightsData?.content) ? highlightsData.content : [];
  console.log(`${prefix} content.length=${content.length}`);

  if (content.length === 0) {
    console.log(`${prefix} Empty highlights, using fallback search`);
    return await collectHighlightsViaSearch(supabase, siteId, categoryId, today, accessToken);
  }

  // 2) Separate ITEM vs PRODUCT
  const items: any[] = [];
  const products: any[] = [];

  for (const entry of content.slice(0, 20)) {
    if (!entry?.id) continue;
    const rawType = String(entry.type || '').toUpperCase();
    if (rawType === 'ITEM') {
      items.push({ id: entry.id, rank: items.length + products.length + 1 });
    } else if (rawType === 'PRODUCT' || rawType === 'USER_PRODUCT') {
      products.push({ id: entry.id, rank: items.length + products.length + 1 });
    } else {
      items.push({ id: entry.id, rank: items.length + products.length + 1, unknownType: rawType });
    }
  }

  console.log(`${prefix} items=${items.length} products=${products.length}`);

  // 3) Enrich items in batch
  const enrichedItems: any[] = [];
  let itemsEnriched = 0;
  const failedItemIds: string[] = [];

  if (items.length > 0) {
    const itemIds = items.map((i) => i.id).join(',');
    const batchUrl = `https://api.mercadolibre.com/items?ids=${encodeURIComponent(itemIds)}`;
    
    try {
      await checkRateLimit();
      const batchRes = await fetch(batchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      if (batchRes.ok) {
        const batchData = await batchRes.json();
        const bodyMap = new Map<string, any>();
        
        for (const entry of batchData || []) {
          if (entry?.code === 200 && entry?.body?.id) {
            bodyMap.set(entry.body.id, entry.body);
          } else if (entry?.body?.id) {
            failedItemIds.push(entry.body.id);
          }
        }
        
        for (const item of items) {
          if (!bodyMap.has(item.id) && !failedItemIds.includes(item.id)) {
            failedItemIds.push(item.id);
          }
        }

        for (const item of items) {
          const body = bodyMap.get(item.id);
          if (body) {
            const price = body?.price || null;
            const soldQty = body?.sold_quantity || null;
            const estimatedRevenue = (price && soldQty) ? price * soldQty : null;
            
            enrichedItems.push({
              item_id: item.id,
              entity_type: 'ITEM',
              product_id: null,
              rank: item.rank,
              title: body?.title || (item.unknownType ? `[${item.unknownType}] ${item.id}` : item.id),
              thumbnail: body?.thumbnail || null,
              price,
              sold_quantity: soldQty,
              permalink: body?.permalink || null,
              estimated_revenue: estimatedRevenue,
            });
            if (body?.title) itemsEnriched++;
          }
        }
      } else {
        failedItemIds.push(...items.map((i) => i.id));
      }
    } catch (err) {
      console.error(`${prefix} batch items error:`, err);
      failedItemIds.push(...items.map((i) => i.id));
    }
  }
  
  // Try to enrich failed ITEMs as PRODUCTs
  console.log(`${prefix} failedItemIds=${failedItemIds.length}`);
  for (const itemId of failedItemIds) {
    const item = items.find((i) => i.id === itemId);
    if (!item) continue;
    
    try {
      await checkRateLimit();
      const productUrl = `https://api.mercadolibre.com/products/${itemId}`;
      const productRes = await fetch(productUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      if (productRes.ok) {
        const productData = await productRes.json();
        console.log(`${prefix} item ${itemId} is actually a PRODUCT`);
        
        let price: number | null = null;
        let soldQuantity: number | null = null;
        let permalink: string | null = null;
        let thumbnail = productData.pictures?.[0]?.url || null;
        
        const buyBoxItemId = productData.buy_box_winner?.item_id;
        if (buyBoxItemId) {
          price = productData.buy_box_winner.price || null;
          await sleep(100);
          
          await checkRateLimit();
          const itemRes = await fetch(`https://api.mercadolibre.com/items/${buyBoxItemId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (itemRes.ok) {
            const itemData = await itemRes.json();
            soldQuantity = itemData.sold_quantity ?? null;
            permalink = itemData.permalink ?? null;
            if (!thumbnail) thumbnail = itemData.thumbnail ?? null;
          }
        }
        
        enrichedItems.push({
          item_id: itemId,
          entity_type: 'PRODUCT',
          product_id: itemId,
          rank: item.rank,
          title: productData.name || productData.title || `[Catálogo] ${itemId}`,
          thumbnail,
          price,
          sold_quantity: soldQuantity,
          permalink,
          estimated_revenue: (price && soldQuantity) ? price * soldQuantity : null,
        });
        itemsEnriched++;
      } else {
        enrichedItems.push({
          item_id: itemId,
          entity_type: 'ITEM',
          product_id: null,
          rank: item.rank,
          title: item.unknownType ? `[${item.unknownType}] ${itemId}` : itemId,
          thumbnail: null,
          price: null,
          sold_quantity: null,
          permalink: null,
          estimated_revenue: null,
        });
      }
      await sleep(100);
    } catch (err) {
      console.warn(`${prefix} failed to enrich ${itemId} as product:`, err);
      enrichedItems.push({
        item_id: itemId,
        entity_type: 'ITEM',
        product_id: null,
        rank: item.rank,
        title: item.unknownType ? `[${item.unknownType}] ${itemId}` : itemId,
        thumbnail: null,
        price: null,
        sold_quantity: null,
        permalink: null,
        estimated_revenue: null,
      });
    }
  }

  // 4) Enrich products
  for (const product of products) {
    try {
      await checkRateLimit();
      const productUrl = `https://api.mercadolibre.com/products/${product.id}`;
      const productRes = await fetch(productUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let title = product.id;
      let thumbnail: string | null = null;
      let price: number | null = null;
      let soldQuantity: number | null = null;
      let permalink: string | null = null;
      let representativeItemId: string | null = null;
      let estimatedRevenue: number | null = null;

      if (productRes.ok) {
        const productData = await productRes.json();
        title = productData.name || productData.title || product.id;
        thumbnail = productData.pictures?.[0]?.url || productData.thumbnail || null;

        if (productData.buy_box_winner?.item_id) {
          representativeItemId = productData.buy_box_winner.item_id;
          price = productData.buy_box_winner.price || null;
          
          try {
            await checkRateLimit();
            const itemRes = await fetch(`https://api.mercadolibre.com/items/${representativeItemId}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (itemRes.ok) {
              const itemData = await itemRes.json();
              soldQuantity = itemData.sold_quantity || null;
              permalink = itemData.permalink || null;
              if (!thumbnail) thumbnail = itemData.thumbnail || null;
            }
          } catch (e) {
            console.log(`${prefix} Failed to fetch representative item ${representativeItemId}`);
          }
        }
        
        if (price && soldQuantity) {
          estimatedRevenue = price * soldQuantity;
        }
        
        itemsEnriched++;
      } else {
        console.log(`${prefix} product ${product.id} fetch failed: ${productRes.status}`);
        title = `[PRODUCT] ${product.id}`;
      }

      enrichedItems.push({
        item_id: representativeItemId || product.id,
        entity_type: 'PRODUCT',
        product_id: product.id,
        rank: product.rank,
        title,
        thumbnail,
        price,
        sold_quantity: soldQuantity,
        permalink,
        estimated_revenue: estimatedRevenue,
      });

      await sleep(100);
    } catch (err) {
      console.error(`${prefix} product ${product.id} error:`, err);
      enrichedItems.push({
        item_id: product.id,
        entity_type: 'PRODUCT',
        product_id: product.id,
        rank: product.rank,
        title: `[PRODUCT] ${product.id}`,
        thumbnail: null,
        price: null,
        sold_quantity: null,
        permalink: null,
        estimated_revenue: null,
      });
    }
  }

  // Re-sort by rank
  enrichedItems.sort((a, b) => a.rank - b.rank);
  
  // Check enrichment quality
  const itemsWithPrice = enrichedItems.filter((i: any) => i.price !== null);
  console.log(`${prefix} items with price=${itemsWithPrice.length}/${enrichedItems.length}`);
  
  if (enrichedItems.length > 0 && itemsWithPrice.length < enrichedItems.length * 0.3) {
    console.log(`${prefix} low enrichment quality, trying search fallback`);
    const searchResult = await collectHighlightsViaSearch(supabase, siteId, categoryId, today, accessToken);
    if (searchResult.success && searchResult.itemsEnriched > itemsWithPrice.length) {
      console.log(`${prefix} search fallback provided better data`);
      return searchResult;
    }
  }

  // 5) Save to database
  return await saveHighlightsSnapshot(supabase, siteId, categoryId, today, enrichedItems, itemsEnriched);
}

async function collectHighlightsViaSearch(
  supabase: any,
  siteId: string,
  categoryId: string,
  today: string,
  accessToken: string
): Promise<HighlightsResult> {
  const prefix = `[collectHighlightsViaSearch][${categoryId}]`;
  const url = `https://api.mercadolibre.com/sites/${siteId}/search?category=${categoryId}&sort=sold_quantity_desc&limit=20`;

  try {
    await checkRateLimit();
    // Try without token first (public)
    let response = await fetch(url);
    
    if (!response.ok) {
      await checkRateLimit();
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    if (!response.ok) {
      console.error(`${prefix} search failed: ${response.status}`);
      return { success: false, snapshotSaved: false, itemsEnriched: 0 };
    }

    const searchData = await response.json();
    const results = searchData.results || [];

    const enrichedItems = results.slice(0, 20).map((item: any, idx: number) => {
      const price = item.price || null;
      const soldQty = item.sold_quantity || null;
      const estimatedRevenue = (price && soldQty) ? price * soldQty : null;
      
      return {
        item_id: item.id,
        entity_type: 'ITEM',
        product_id: item.catalog_product_id || null,
        rank: idx + 1,
        title: item.title || item.id,
        thumbnail: item.thumbnail || null,
        price,
        sold_quantity: soldQty,
        permalink: item.permalink || null,
        estimated_revenue: estimatedRevenue,
      };
    });

    const itemsEnriched = enrichedItems.filter((i: any) => i.title && i.title !== i.item_id).length;

    return await saveHighlightsSnapshot(supabase, siteId, categoryId, today, enrichedItems, itemsEnriched);
  } catch (error) {
    console.error(`${prefix} error:`, error);
    return { success: false, snapshotSaved: false, itemsEnriched: 0 };
  }
}

async function saveHighlightsSnapshot(
  supabase: any,
  siteId: string,
  categoryId: string,
  today: string,
  items: any[],
  itemsEnriched: number
): Promise<HighlightsResult> {
  if (items.length === 0) {
    return { success: true, snapshotSaved: false, itemsEnriched: 0 };
  }

  // Upsert snapshot
  const { data: existing } = await supabase
    .from('highlights_snapshots')
    .select('id')
    .eq('site_id', siteId)
    .eq('category_id', categoryId)
    .eq('snapshot_date', today)
    .maybeSingle();

  let snapshotId: string;

  if (existing) {
    snapshotId = existing.id;
  } else {
    const { data: newSnap, error } = await supabase
      .from('highlights_snapshots')
      .insert({ site_id: siteId, category_id: categoryId, snapshot_date: today })
      .select('id')
      .single();

    if (error || !newSnap) {
      console.error('[saveHighlightsSnapshot] Failed to create snapshot:', error);
      return { success: false, snapshotSaved: false, itemsEnriched: 0 };
    }
    snapshotId = newSnap.id;
  }

  // Delete old items and insert new
  await supabase.from('highlights_items').delete().eq('snapshot_id', snapshotId);

  const itemsWithSnapshot = items.map((item) => ({
    ...item,
    snapshot_id: snapshotId,
  }));

  const { error: insertError } = await supabase.from('highlights_items').insert(itemsWithSnapshot);

  if (insertError) {
    console.error('[saveHighlightsSnapshot] Failed to insert items:', insertError);
    return { success: false, snapshotSaved: true, itemsEnriched: 0 };
  }

  console.log(`[saveHighlightsSnapshot] ${categoryId} saved ${items.length} items, enriched=${itemsEnriched}`);
  return { success: true, snapshotSaved: true, itemsEnriched };
}

// =====================================================
// JOB FINALIZATION
// =====================================================

async function finalizeJobRun(
  supabase: any,
  jobRunId: string,
  status: string,
  metrics: JobMetrics,
  errorMessage: string | null
): Promise<void> {
  await supabase
    .from('job_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      categories_processed: metrics.categoriesProcessed,
      categories_failed: metrics.categoriesFailed,
      keywords_saved: metrics.keywordsSaved,
      highlights_saved: metrics.highlightsSaved,
      items_enriched: metrics.itemsEnriched,
      error_message: errorMessage,
    })
    .eq('id', jobRunId);
}

async function updatePublicTrendsStatus(
  supabase: any,
  status: string,
  metrics: JobMetrics,
  totalCategories: number
): Promise<void> {
  const now = new Date().toISOString();
  const nextRun = new Date();
  nextRun.setDate(nextRun.getDate() + 1);
  nextRun.setHours(2, 0, 0, 0); // Updated to 02:00

  const updateData: any = {
    last_run_at: now,
    total_categories: totalCategories,
    coverage_keywords: metrics.keywordsSaved > 0 ? metrics.categoriesProcessed : 0,
    coverage_highlights: metrics.highlightsSaved,
    subcategories_collected: metrics.subcategoriesProcessed,
    last_subcategory_sync_at: metrics.subcategoriesProcessed > 0 ? now : undefined,
    next_run_at: nextRun.toISOString(),
    updated_at: now,
  };

  if (status === 'success') {
    updateData.last_success_at = now;
  } else if (status === 'partial_success') {
    updateData.last_partial_at = now;
  } else {
    updateData.last_failed_at = now;
  }

  await supabase
    .from('public_trends_status')
    .update(updateData)
    .eq('id', 'main');
}

// =====================================================
// UTILITIES
// =====================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
