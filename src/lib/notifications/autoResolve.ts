import { supabase } from "@/integrations/supabase/client";

/**
 * Auto-resolve notifications for a given category and seller.
 * Marks all unactioned notifications as actioned.
 */
export async function autoResolveNotifications(
  category: "qa_pending" | "post_sale_blocked" | "post_sale_error" | "qa_blocked" | "qa_send_error" | "qa_sla_breached" | "qa_sla_warning" | "system_alert" | "task_assigned" | "promotion_alert",
  sellerId: string
): Promise<void> {
  const { error } = await supabase
    .from("app_notifications")
    .update({ is_actioned: true, read_at: new Date().toISOString() } as never)
    .eq("seller_id", sellerId)
    .eq("category", category)
    .eq("is_actioned", false);

  if (error) {
    console.error(`[autoResolve] Failed to resolve ${category} for seller ${sellerId}:`, error);
  }
}
