// ml-generate-labels-file-v2 — entrega o arquivo final (PDF/ZPL) de um job V2.
// Chamado UMA vez, quando o status vira terminal com has_file=true.
// Lê do Storage (file_url); para jobs antigos/legados, cai em pdf_base64/zpl_content.
import { createClient } from "npm:@supabase/supabase-js@2";
import { downloadFile } from "../_shared/print-labels-storage.ts";
import { uint8ToBase64 } from "../_shared/labeltest-render.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing authorization header' }, 401);

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) return json({ error: 'User not authenticated' }, 401);

    const body = await req.json().catch(() => null);
    const jobId = body?.job_id;
    if (!jobId || typeof jobId !== 'string' || !/^[0-9a-f-]{36}$/i.test(jobId)) return json({ error: 'job_id is required' }, 400);

    const { data: job, error } = await supabaseAdmin
      .from('meli_print_queue_v2')
      .select('id, format, file_url, download_filename')
      .eq('id', jobId).eq('user_id', user.id).maybeSingle();
    if (error) return json({ error: 'DB error', detail: error.message }, 500);
    if (!job) return json({ error: 'Job not found', job_id: jobId }, 404);

    const base = { job_id: job.id, format: job.format, download_filename: job.download_filename };

    if (job.file_url) {
      const bytes = await downloadFile(supabaseAdmin, job.file_url);
      if (job.format === 'zpl') return json({ ...base, zpl_content: new TextDecoder().decode(bytes) });
      return json({ ...base, pdf_base64: uint8ToBase64(bytes) });
    }

    // Fallback: jobs gravados no modo legado
    const col = job.format === 'zpl' ? 'zpl_content' : 'pdf_base64';
    const { data: legacy } = await supabaseAdmin.from('meli_print_queue_v2').select(col).eq('id', job.id).maybeSingle();
    const content = (legacy as any)?.[col];
    if (!content) return json({ error: 'Arquivo não disponível para este job', job_id: job.id }, 404);
    return json({ ...base, [col]: content });
  } catch (e: any) {
    console.error('[file-v2] error:', e);
    return json({ error: e?.message || 'Internal error' }, 500);
  }
});
