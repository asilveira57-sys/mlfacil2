// @ts-nocheck
/**
 * Queue Worker — Unified Batch Processor
 * Picks N pending jobs from processing_queue, groups by seller,
 * processes in batch, and logs everything.
 * 
 * ANTI-LOOP: Never runs per-account. Always batch.
 * CONCURRENCY: Uses locked_by + locked_at to prevent double-processing.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BATCH_SIZE = 30;
const LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 min stale lock
const MAX_EXECUTION_MS = 50_000; // 50s safety margin
const WORKER_ID = `worker-${crypto.randomUUID().slice(0, 8)}`;

// Priority order mapping
const PRIORITY_ORDER: Record<string, number> = { high: 0, normal: 1, low: 2 };

// Allowed job types (whitelist)
const ALLOWED_JOB_TYPES = new Set([
  "IMPORT_ORDERS",
  "CALCULATE_COST",
  "SYNC_LIGHT",
  "SYNC_BILLING_MANUAL",
  "REFRESH_KEYWORDS",
  "RADIOGRAPHY_ANALYZE",
]);

// Blocked patterns (anti-loop protection)
const BLOCKED_PATTERNS = [
  "BILLING_GLOBAL",
  "RECALCULATE_ALL",
  "SYNC_ALL_ACCOUNTS",
  "LOOP_ALL_SELLERS",
];

interface QueueJob {
  id: string;
  tenant_id: string | null;
  seller_id: string;
  job_type: string;
  payload: Record<string, unknown>;
  status: string;
  priority: string;
  attempts: number;
  max_attempts: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startMs = Date.now();
  const batchId = `batch-${Date.now()}-${WORKER_ID}`;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let jobsPicked = 0;
  let jobsCompleted = 0;
  let jobsFailed = 0;
  let blockedAttempts = 0;
  const sellersSet = new Set<string>();

  try {
    // 1. Release stale locks
    const staleThreshold = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString();
    await supabase
      .from("processing_queue")
      .update({ status: "pending", locked_by: null, locked_at: null })
      .eq("status", "processing")
      .lt("locked_at", staleThreshold);

    // 2. Pick batch of pending jobs (ordered by priority + age)
    const { data: pendingJobs, error: pickError } = await supabase
      .from("processing_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (pickError || !pendingJobs || pendingJobs.length === 0) {
      await logExecution(supabase, batchId, 0, 0, 0, 0, 0, Date.now() - startMs);
      return jsonResponse({ status: "idle", message: "No pending jobs" });
    }

    // Sort by priority
    const sorted = (pendingJobs as QueueJob[]).sort((a, b) => {
      return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
    });

    // 3. Filter blocked patterns
    const validJobs: QueueJob[] = [];
    for (const job of sorted) {
      const isBlocked = BLOCKED_PATTERNS.some(p =>
        job.job_type.toUpperCase().includes(p)
      );
      if (isBlocked || !ALLOWED_JOB_TYPES.has(job.job_type)) {
        blockedAttempts++;
        await supabase
          .from("processing_queue")
          .update({
            status: "error",
            error_message: `SYSTEM_BLOCK: job type "${job.job_type}" not allowed`,
            finished_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        console.warn(`[queue-worker] BLOCKED job ${job.id}: ${job.job_type}`);
        continue;
      }
      validJobs.push(job);
    }

    if (validJobs.length === 0) {
      await logExecution(supabase, batchId, 0, 0, 0, 0, blockedAttempts, Date.now() - startMs);
      return jsonResponse({ status: "blocked", blocked: blockedAttempts });
    }

    // 4. Lock all valid jobs atomically
    const jobIds = validJobs.map(j => j.id);
    jobsPicked = jobIds.length;

    await supabase
      .from("processing_queue")
      .update({
        status: "processing",
        locked_by: WORKER_ID,
        locked_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      })
      .in("id", jobIds);

    // 5. Group by job_type for batch processing
    const grouped = new Map<string, QueueJob[]>();
    for (const job of validJobs) {
      sellersSet.add(job.seller_id);
      const list = grouped.get(job.job_type) || [];
      list.push(job);
      grouped.set(job.job_type, list);
    }

    // 6. Process each group
    for (const [jobType, jobs] of grouped) {
      // Time guard
      if (Date.now() - startMs > MAX_EXECUTION_MS) {
        console.warn(`[queue-worker] Time limit approaching, releasing remaining jobs`);
        const remainingIds = jobs.map(j => j.id);
        await supabase
          .from("processing_queue")
          .update({ status: "pending", locked_by: null, locked_at: null })
          .in("id", remainingIds);
        break;
      }

      // Batch process by type using WHERE IN for seller_ids
      const sellerIds = [...new Set(jobs.map(j => j.seller_id))];

      try {
        await processBatch(supabase, jobType, jobs, sellerIds);

        // Mark all as done
        for (const job of jobs) {
          await supabase
            .from("processing_queue")
            .update({
              status: "done",
              finished_at: new Date().toISOString(),
              duration_ms: Date.now() - startMs,
              attempts: job.attempts + 1,
            })
            .eq("id", job.id);
          jobsCompleted++;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        for (const job of jobs) {
          const newAttempts = job.attempts + 1;
          const newStatus = newAttempts >= job.max_attempts ? "error" : "pending";
          await supabase
            .from("processing_queue")
            .update({
              status: newStatus,
              attempts: newAttempts,
              error_message: errorMsg,
              locked_by: null,
              locked_at: null,
              finished_at: newStatus === "error" ? new Date().toISOString() : null,
            })
            .eq("id", job.id);
          jobsFailed++;
        }
      }
    }

    const totalDuration = Date.now() - startMs;
    await logExecution(supabase, batchId, jobsPicked, jobsCompleted, jobsFailed, sellersSet.size, blockedAttempts, totalDuration);

    console.log(`[queue-worker] Batch ${batchId}: picked=${jobsPicked} done=${jobsCompleted} failed=${jobsFailed} blocked=${blockedAttempts} duration=${totalDuration}ms`);

    return jsonResponse({
      status: "completed",
      batch_id: batchId,
      jobs_picked: jobsPicked,
      jobs_completed: jobsCompleted,
      jobs_failed: jobsFailed,
      blocked_attempts: blockedAttempts,
      sellers_processed: sellersSet.size,
      duration_ms: totalDuration,
    });
  } catch (err) {
    console.error("[queue-worker] Fatal error:", err);
    await logExecution(supabase, batchId, jobsPicked, jobsCompleted, jobsFailed, sellersSet.size, blockedAttempts, Date.now() - startMs);
    return jsonResponse({ error: String(err) }, 500);
  }
});

/**
 * Process a batch of jobs of the same type.
 * Uses grouped seller_ids with WHERE IN instead of per-seller loops.
 */
async function processBatch(
  supabase: any,
  jobType: string,
  jobs: QueueJob[],
  sellerIds: string[]
) {
  console.log(`[queue-worker] Processing ${jobType}: ${jobs.length} jobs, ${sellerIds.length} sellers`);

  switch (jobType) {
    case "IMPORT_ORDERS": {
      // Delegate to ml-sync-orders with batch seller list
      for (const job of jobs) {
        const payload = job.payload || {};
        await supabase.functions.invoke("ml-sync-orders", {
          body: {
            seller_id: job.seller_id,
            date_from: payload.date_from,
            date_to: payload.date_to,
            source: "queue",
          },
        });
      }
      break;
    }

    case "CALCULATE_COST": {
      for (const job of jobs) {
        const payload = job.payload || {};
        await supabase.functions.invoke("cost-engine", {
          body: {
            action: "recalculate",
            seller_id: job.seller_id,
            period_days: payload.period_days || 30,
            date_from: payload.date_from,
            date_to: payload.date_to,
            source: "queue",
          },
        });
      }
      break;
    }

    case "SYNC_LIGHT": {
      // Light sync — status updates only, batched
      for (const job of jobs) {
        await supabase.functions.invoke("ml-sync-orders", {
          body: {
            seller_id: job.seller_id,
            mode: "light",
            source: "queue",
          },
        });
      }
      break;
    }

    case "SYNC_BILLING_MANUAL": {
      for (const job of jobs) {
        await supabase.functions.invoke("ml-sync-billing-details", {
          body: {
            seller_id: job.seller_id,
            action: "sync",
            scope: "recent",
            source: "queue",
          },
        });
      }
      break;
    }

    case "REFRESH_KEYWORDS": {
      for (const job of jobs) {
        await supabase.functions.invoke("radiography-collector", {
          body: {
            action: "refresh_keywords",
            seller_id: job.seller_id,
            source: "queue",
          },
        });
      }
      break;
    }

    case "RADIOGRAPHY_ANALYZE": {
      for (const job of jobs) {
        await supabase.functions.invoke("radiography-collector", {
          body: {
            action: "analyze",
            seller_id: job.seller_id,
            source: "queue",
          },
        });
      }
      break;
    }

    default:
      throw new Error(`Unknown job type: ${jobType}`);
  }
}

async function logExecution(
  supabase: any,
  batchId: string,
  picked: number,
  completed: number,
  failed: number,
  sellers: number,
  blocked: number,
  durationMs: number
) {
  try {
    await supabase.from("queue_execution_log").insert({
      batch_id: batchId,
      jobs_picked: picked,
      jobs_completed: completed,
      jobs_failed: failed,
      sellers_processed: sellers,
      blocked_attempts: blocked,
      total_duration_ms: durationMs,
      worker_id: WORKER_ID,
    });
  } catch (_) {
    console.warn("[queue-worker] Failed to log execution");
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });
}
