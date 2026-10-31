// Storage helpers do fluxo de etiquetas V2.
// O conteúdo (PDF/ZPL) vive no bucket privado `print-labels`; o banco guarda
// apenas o caminho (meli_print_queue_v2.file_url / batches[].storage_path).
//
// Kill-switch: LABELS_LEGACY_PAYLOAD=1 restaura o comportamento antigo
// (conteúdo em pdf_base64 / zpl_content / batches[].pdf_b64). Lido a cada
// chamada, então basta trocar a variável — sem redeploy.

export const PRINT_LABELS_BUCKET = 'print-labels';

export function isLegacyPayload(): boolean {
  return Deno.env.get('LABELS_LEGACY_PAYLOAD') === '1';
}

export function batchPath(userId: string, sellerId: string, jobId: string, idx: number) {
  return `${userId}/${sellerId}/${jobId}/batch_${idx}.pdf`;
}

export function finalPath(userId: string, sellerId: string, jobId: string, ext: 'pdf' | 'zpl') {
  return `${userId}/${sellerId}/${jobId}.${ext}`;
}

export async function uploadFile(supabaseAdmin: any, path: string, content: Uint8Array | string, contentType: string) {
  const body = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const { error } = await supabaseAdmin.storage.from(PRINT_LABELS_BUCKET).upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`storage upload failed (${path}): ${error.message}`);
}

export async function downloadFile(supabaseAdmin: any, path: string): Promise<Uint8Array> {
  const { data, error } = await supabaseAdmin.storage.from(PRINT_LABELS_BUCKET).download(path);
  if (error || !data) throw new Error(`storage download failed (${path}): ${error?.message || 'empty'}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeFiles(supabaseAdmin: any, paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await supabaseAdmin.storage.from(PRINT_LABELS_BUCKET).remove(paths);
  if (error) console.warn(`[print-labels] remove failed:`, error.message);
}

// Retenção "somente o último por vendedor": apaga o arquivo dos jobs
// anteriores deste seller e limpa file_url (a linha fica no histórico).
export async function enforceLatestOnly(supabaseAdmin: any, sellerId: string, keepJobId: string) {
  try {
    // Retenção = último arquivo por USUÁRIO naquele vendedor (titular e colaborador não se apagam).
    const { data: keep } = await supabaseAdmin
      .from('meli_print_queue_v2').select('user_id').eq('id', keepJobId).maybeSingle();
    if (!keep?.user_id) return;
    const { data: old } = await supabaseAdmin
      .from('meli_print_queue_v2')
      .select('id, file_url')
      .eq('seller_id', sellerId)
      .eq('user_id', keep.user_id)
      .not('file_url', 'is', null)
      .neq('id', keepJobId);
    const rows = (old || []) as { id: string; file_url: string }[];
    if (rows.length === 0) return;
    await removeFiles(supabaseAdmin, rows.map(r => r.file_url));
    await supabaseAdmin.from('meli_print_queue_v2').update({ file_url: null } as any).in('id', rows.map(r => r.id));
    console.log(`[print-labels] retention seller=${sellerId} removed=${rows.length}`);
  } catch (e: any) {
    console.warn(`[print-labels] retention failed seller=${sellerId}:`, e?.message || e);
  }
}
