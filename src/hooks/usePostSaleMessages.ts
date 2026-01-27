import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import type {
  PostSaleTemplate,
  PostSaleMessage,
  ValidationResult,
  PostSaleTriggerEvent,
  PostSaleMessageType,
  PostSaleLogisticsProfile,
  PostSaleMessageStatus,
} from "@/types/post-sale";

export function usePostSaleTemplates() {
  const { sellerId } = useActiveAccount();

  return useQuery({
    queryKey: ["post-sale-templates", sellerId],
    queryFn: async () => {
      if (!sellerId) return [];
      
      const { data, error } = await supabase
        .from("post_sale_templates")
        .select("*")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as PostSaleTemplate[];
    },
    enabled: !!sellerId,
  });
}

export function usePostSaleMessages(filters?: {
  status?: PostSaleMessageStatus;
  trigger_event?: PostSaleTriggerEvent;
  dateFrom?: string;
  dateTo?: string;
  orderId?: string;
}) {
  const { sellerId } = useActiveAccount();

  return useQuery({
    queryKey: ["post-sale-messages", sellerId, filters],
    queryFn: async () => {
      if (!sellerId) return [];
      
      let query = supabase
        .from("post_sale_messages")
        .select("*")
        .eq("seller_id", sellerId)
        .eq("is_visible", true)
        .order("created_at", { ascending: false })
        .limit(100);
      
      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.trigger_event) {
        query = query.eq("trigger_event", filters.trigger_event);
      }
      if (filters?.orderId) {
        query = query.ilike("order_id", `%${filters.orderId}%`);
      }
      if (filters?.dateFrom) {
        query = query.gte("created_at", filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte("created_at", filters.dateTo);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as PostSaleMessage[];
    },
    enabled: !!sellerId,
  });
}

export function usePostSaleAutomationRules() {
  const { sellerId } = useActiveAccount();

  return useQuery({
    queryKey: ["post-sale-rules", sellerId],
    queryFn: async () => {
      if (!sellerId) return [];
      
      const { data, error } = await supabase
        .from("post_sale_automation_rules")
        .select("*, post_sale_templates(*)")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!sellerId,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const { sellerId } = useActiveAccount();

  return useMutation({
    mutationFn: async (template: {
      name: string;
      trigger_event: PostSaleTriggerEvent;
      message_type: PostSaleMessageType;
      content: string;
      logistics_profile?: PostSaleLogisticsProfile;
      max_characters?: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !sellerId) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("post_sale_templates")
        .insert({
          user_id: user.id,
          seller_id: sellerId,
          name: template.name,
          trigger_event: template.trigger_event,
          message_type: template.message_type,
          content: template.content,
          logistics_profile: template.logistics_profile || "mercado_envios",
          max_characters: template.max_characters || 500,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post-sale-templates"] });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PostSaleTemplate> & { id: string }) => {
      const { data, error } = await supabase
        .from("post_sale_templates")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post-sale-templates"] });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("post_sale_templates")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post-sale-templates"] });
    },
  });
}

export function useValidateMessage() {
  return useMutation({
    mutationFn: async ({ content, variables }: { 
      content: string; 
      variables?: Record<string, string>;
    }): Promise<ValidationResult> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/post-sale-messages?action=validate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ content, variables }),
        }
      );

      if (!res.ok) throw new Error("Validation failed");
      return res.json();
    },
  });
}

export function useAiSuggest() {
  return useMutation({
    mutationFn: async ({ content, messageType }: {
      content: string;
      messageType: string;
    }): Promise<{ suggestion: string; validation: ValidationResult }> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/post-sale-messages?action=suggest`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ content, messageType }),
        }
      );

      if (!res.ok) throw new Error("AI suggestion failed");
      return res.json();
    },
  });
}

export function useCreateAutomationRule() {
  const queryClient = useQueryClient();
  const { sellerId } = useActiveAccount();

  return useMutation({
    mutationFn: async (rule: {
      template_id: string;
      is_active?: boolean;
      require_approval?: boolean;
      wait_for_buyer_response?: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !sellerId) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("post_sale_automation_rules")
        .insert({
          user_id: user.id,
          seller_id: sellerId,
          template_id: rule.template_id,
          is_active: rule.is_active ?? false,
          require_approval: rule.require_approval ?? true,
          wait_for_buyer_response: rule.wait_for_buyer_response ?? false,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post-sale-rules"] });
    },
  });
}

export function useToggleAutomationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("post_sale_automation_rules")
        .update({ is_active })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post-sale-rules"] });
    },
  });
}

export function useLogMessage() {
  const queryClient = useQueryClient();
  const { sellerId } = useActiveAccount();

  return useMutation({
    mutationFn: async (message: {
      order_id: string;
      pack_id?: string;
      buyer_id?: string;
      buyer_name?: string;
      listing_id?: string;
      listing_title?: string;
      template_id?: string;
      trigger_event: PostSaleTriggerEvent;
      message_type: PostSaleMessageType;
      content_sent: string;
      status: PostSaleMessageStatus;
      block_reason?: string;
      block_details?: Record<string, unknown>;
      suggested_fix?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !sellerId) throw new Error("Not authenticated");

      const insertData = {
        user_id: user.id,
        seller_id: sellerId,
        order_id: message.order_id,
        pack_id: message.pack_id,
        buyer_id: message.buyer_id,
        buyer_name: message.buyer_name,
        listing_id: message.listing_id,
        listing_title: message.listing_title,
        template_id: message.template_id,
        trigger_event: message.trigger_event,
        message_type: message.message_type,
        content_sent: message.content_sent,
        status: message.status,
        block_reason: message.block_reason,
        block_details: message.block_details,
        suggested_fix: message.suggested_fix,
      };

      const { data, error } = await supabase
        .from("post_sale_messages")
        .insert(insertData as never)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post-sale-messages"] });
    },
  });
}
