/**
 * Helper to enqueue email events from edge functions.
 * Uses service-role supabase client to call email-enqueue-event internally.
 * Fail-safe: never breaks the caller.
 */
export async function enqueueEmailEvent(
  supabaseUrl: string,
  serviceRoleKey: string,
  params: {
    event_key: string;
    user_id: string;
    company_id?: string | null;
    to_email?: string;
    variables?: Record<string, string>;
    dedup_key?: string;
  }
): Promise<void> {
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/email-enqueue-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(params),
    });
    
    if (!resp.ok) {
      const err = await resp.text();
      console.warn(`[email-trigger] Failed to enqueue ${params.event_key}:`, err);
    } else {
      console.log(`[email-trigger] Enqueued ${params.event_key} for user ${params.user_id}`);
    }
  } catch (err) {
    console.warn(`[email-trigger] Exception enqueuing ${params.event_key}:`, err);
  }
}
