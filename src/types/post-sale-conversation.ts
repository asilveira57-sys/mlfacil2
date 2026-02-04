export interface PostSaleConversation {
  id: string;
  user_id: string;
  seller_id: string;
  order_id: string;
  pack_id?: string | null;
  buyer_id: string;
  buyer_name?: string | null;
  item_title?: string | null;
  item_thumbnail?: string | null;
  shipment_id?: string | null;
  conversation_status: string;
  unread_count: number;
  last_message_date?: string | null;
  last_message_text?: string | null;
  last_message_from?: 'buyer' | 'seller' | null;
  seller_max_chars: number;
  created_at: string;
  updated_at: string;
}

export interface PostSaleConversationMessage {
  id: string;
  conversation_id: string;
  ml_message_id?: string | null;
  from_user_id: string;
  from_type: 'buyer' | 'seller';
  message_text?: string | null;
  message_status: string;
  moderation_status: string;
  moderation_reason?: string | null;
  has_attachments: boolean;
  attachments: MessageAttachment[];
  message_date: string;
  read_at?: string | null;
  created_at: string;
}

export interface MessageAttachment {
  filename?: string;
  size?: string;
  type?: string;
  original_filename?: string;
  [key: string]: unknown;
}

export interface ConversationFilters {
  unreadOnly?: boolean;
  search?: string;
  status?: string;
}

export interface SyncMessagesResult {
  success: boolean;
  synced?: number;
  unread?: number;
  errors?: number;
  error?: string;
}

export interface SendMessageResult {
  success: boolean;
  ml_message_id?: string;
  sent_at?: string;
  error?: string;
  error_code?: string;
  violations?: Array<{
    category: string;
    pattern: string;
    description: string;
    match: string;
  }>;
}

export const conversationStatusLabels: Record<string, string> = {
  active: 'Ativa',
  blocked: 'Bloqueada',
  closed: 'Encerrada',
};

export const fromTypeLabels: Record<string, string> = {
  buyer: 'Comprador',
  seller: 'Vendedor',
};
