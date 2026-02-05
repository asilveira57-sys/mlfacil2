import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { job_id } = await req.json();
    
    if (!job_id) {
      return new Response(
        JSON.stringify({ error: 'job_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get job status
    const { data: job, error: jobError } = await supabaseAdmin
      .from('meli_print_queue')
      .select('*')
      .eq('id', job_id)
      .eq('user_id', user.id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: 'Job not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse batches
    const batches = (job.batches || []) as Array<{
      batch_id: number;
      shipment_ids: string[];
      status: string;
      retry_count: number;
      error_message?: string;
    }>;

    const completedBatches = batches.filter(b => b.status === 'success').length;
    const errorBatches = batches.filter(b => b.status === 'error');
    const processingBatches = batches.filter(b => b.status === 'processing' || b.status === 'retrying');

    return new Response(
      JSON.stringify({
        job_id: job.id,
        status: job.status,
        format: job.format,
        total_labels: job.total_labels,
        processed_labels: job.processed_labels,
        total_batches: batches.length,
        completed_batches: completedBatches,
        error_batches: errorBatches.length,
        processing_batches: processingBatches.length,
        started_at: job.job_started_at,
        completed_at: job.job_completed_at,
        file_url: job.file_url,
        error_log: job.error_log,
        batch_details: batches.map(b => ({
          batch_id: b.batch_id,
          status: b.status,
          label_count: b.shipment_ids.length,
          retry_count: b.retry_count,
          error: b.error_message,
        })),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ml-generate-labels-status:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
